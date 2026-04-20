import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function centsToBrl(cents) {
  return BRL.format((Number(cents || 0) || 0) / 100);
}

function parseBrlToCents(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return Number(digits || 0);
}

function formatBrlInputFromCents(cents) {
  return centsToBrl(cents).replace(/^R\$\s?/, "R$ ");
}

const emptyLocation = {
  name: "",
  addressLine1: "",
  city: "",
  state: "",
  zipCode: "",
  consultationPriceCents: 0,
};

const emptyProcedure = {
  name: "",
  description: "",
  defaultDurationMinutes: 30,
  defaultPriceCents: 0,
  requiresPreparation: false,
  locationPrices: [],
  appointmentConfirmationEnabled: false,
  appointmentConfirmationTemplate: "",
  preparationInfoUrl: "",
};

export function SettingsPage() {
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [locationForm, setLocationForm] = useState(emptyLocation);
  const [procedureForm, setProcedureForm] = useState(emptyProcedure);
  const [editingLocationId, setEditingLocationId] = useState("");
  const [editingProcedureId, setEditingProcedureId] = useState("");
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showProcedureForm, setShowProcedureForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [templateForm, setTemplateForm] = useState({
    consultationReminder1Day: "",
  });

  const load = async () => {
    const [l, p, templates] = await Promise.all([
      api.get("/locations"),
      api.get("/procedures"),
      api.get("/message-templates"),
    ]);
    setLocations(l.data.locations || []);
    setProcedures(p.data.procedures || []);
    const consultationReminder1Day =
      templates.data.templates?.consultationReminder1Day?.content || "";
    setTemplateForm({ consultationReminder1Day });
  };

  useEffect(() => {
    load().catch((err) => setError(err?.response?.data?.message || "Falha ao carregar configuracoes"));
  }, []);

  const pricesPreview = useMemo(() => {
    const map = new Map(
      (procedureForm.locationPrices || []).map((item) => [
        String(item.location),
        Number(item.priceCents || 0),
      ])
    );
    return locations.map((location) => ({
      location,
      enabled: map.has(String(location._id)),
      price: map.has(String(location._id))
        ? map.get(String(location._id))
        : procedureForm.defaultPriceCents,
    }));
  }, [locations, procedureForm]);

  const resetLocationForm = () => {
    setEditingLocationId("");
    setLocationForm(emptyLocation);
    setShowLocationForm(false);
  };

  const resetProcedureForm = () => {
    setEditingProcedureId("");
    setProcedureForm(emptyProcedure);
    setShowProcedureForm(false);
  };

  const startEditLocation = (location) => {
    setEditingLocationId(location._id);
    setLocationForm({
      name: location.name || "",
      addressLine1: location.addressLine1 || "",
      city: location.city || "",
      state: location.state || "",
      zipCode: location.zipCode || "",
      consultationPriceCents: location.consultationPriceCents || 0,
    });
    setShowLocationForm(true);
  };

  const startEditProcedure = (procedure) => {
    setEditingProcedureId(procedure._id);
    setProcedureForm({
      name: procedure.name || "",
      description: procedure.description || "",
      defaultDurationMinutes: procedure.defaultDurationMinutes || 30,
      defaultPriceCents: procedure.defaultPriceCents || 0,
      requiresPreparation: Boolean(procedure.requiresPreparation),
      locationPrices: procedure.locationPrices || procedure.pricesByLocation || [],
      appointmentConfirmationEnabled: Boolean(procedure.appointmentConfirmationEnabled),
      appointmentConfirmationTemplate: procedure.appointmentConfirmationTemplate || "",
      preparationInfoUrl: procedure.preparationInfoUrl || "",
    });
    setShowProcedureForm(true);
  };

  const saveMessageTemplates = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.put("/message-templates", {
        consultationReminder1Day: templateForm.consultationReminder1Day,
      });
      setMessage("Templates de mensagem atualizados com sucesso.");
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel salvar templates.");
    }
  };

  const saveLocation = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = {
        ...locationForm,
        consultationPriceCents: Number(locationForm.consultationPriceCents),
      };
      if (editingLocationId) {
        await api.put(`/locations/${editingLocationId}`, payload);
      } else {
        await api.post("/locations", payload);
      }
      resetLocationForm();
      await load();
      setMessage(editingLocationId ? "Endereco atualizado com sucesso." : "Endereco salvo com sucesso.");
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel salvar endereco");
    }
  };

  const saveProcedure = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = {
        ...procedureForm,
        defaultDurationMinutes: Number(procedureForm.defaultDurationMinutes),
        defaultPriceCents: Number(procedureForm.defaultPriceCents),
        appointmentConfirmationEnabled: Boolean(procedureForm.appointmentConfirmationEnabled),
        appointmentConfirmationTemplate:
          procedureForm.appointmentConfirmationTemplate || "",
        preparationInfoUrl: procedureForm.preparationInfoUrl || "",
        locationPrices: (procedureForm.locationPrices || []).map((entry) => ({
          location: entry.location,
          priceCents: Number(entry.priceCents || 0),
        })),
      };
      if (editingProcedureId) {
        await api.put(`/procedures/${editingProcedureId}`, payload);
      } else {
        await api.post("/procedures", payload);
      }
      resetProcedureForm();
      await load();
      setMessage(editingProcedureId ? "Procedimento atualizado com sucesso." : "Procedimento salvo com sucesso.");
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel salvar procedimento");
    }
  };

  const updateLocationPrice = (locationId, value) => {
    const priceCents = parseBrlToCents(value);
    setProcedureForm((prev) => {
      const remaining = (prev.locationPrices || []).filter(
        (entry) => String(entry.location) !== String(locationId)
      );
      return {
        ...prev,
        locationPrices: [...remaining, { location: locationId, priceCents }],
      };
    });
  };

  const toggleProcedureAtLocation = (locationId, enabled) => {
    setProcedureForm((prev) => {
      const current = prev.locationPrices || [];
      const remaining = current.filter(
        (entry) => String(entry.location) !== String(locationId)
      );
      if (!enabled) {
        return { ...prev, locationPrices: remaining };
      }
      return {
        ...prev,
        locationPrices: [
          ...remaining,
          { location: locationId, priceCents: prev.defaultPriceCents || 0 },
        ],
      };
    });
  };

  return (
    <section className="stack">
      <h2>Configuracoes</h2>
      <p className="muted">
        Enderecos e procedimentos padrao. O mesmo procedimento pode ter preco diferente por local.
      </p>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}

      <div className="card">
        <div className="table-header">
          <h3>Templates de mensagens</h3>
        </div>
        <form className="form-grid" onSubmit={saveMessageTemplates}>
          <label>
            Mensagem de confirmação de consulta 1 dia antes
            <textarea
              value={templateForm.consultationReminder1Day}
              onChange={(e) =>
                setTemplateForm((prev) => ({
                  ...prev,
                  consultationReminder1Day: e.target.value,
                }))
              }
              placeholder="Use placeholders: {{patientName}}, {{startsAt}}, {{locationName}}..."
              required
            />
          </label>
          <p className="muted">
            Placeholders disponiveis: {"{{patientName}}"}, {"{{appointmentDate}}"}, {"{{appointmentTime}}"}, {"{{appointmentDateTime}}"}, {"{{locationName}}"}, {"{{locationAddress}}"}, {"{{procedureName}}"}, {"{{preparationInfoUrl}}"}, {"{{notes}}"}.
          </p>
          <div className="inline-actions">
            <button type="submit">Salvar templates</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="table-header">
          <h3>Enderecos</h3>
          <button
            type="button"
            onClick={() => {
              setEditingLocationId("");
              setLocationForm(emptyLocation);
              setShowLocationForm(true);
            }}
          >
            + Adicionar endereco
          </button>
        </div>

        {showLocationForm ? (
          <form className="form-grid" onSubmit={saveLocation}>
            <label>
              Nome
              <input value={locationForm.name} onChange={(e) => setLocationForm((p) => ({ ...p, name: e.target.value }))} required />
            </label>
            <label>
              Endereco
              <input value={locationForm.addressLine1} onChange={(e) => setLocationForm((p) => ({ ...p, addressLine1: e.target.value }))} required />
            </label>
            <label>
              Cidade
              <input value={locationForm.city} onChange={(e) => setLocationForm((p) => ({ ...p, city: e.target.value }))} required />
            </label>
            <label>
              Estado
              <input value={locationForm.state} onChange={(e) => setLocationForm((p) => ({ ...p, state: e.target.value }))} required />
            </label>
            <label>
              CEP
              <input value={locationForm.zipCode} onChange={(e) => setLocationForm((p) => ({ ...p, zipCode: e.target.value }))} required />
            </label>
            <label>
              Valor base consulta
              <input
                value={formatBrlInputFromCents(locationForm.consultationPriceCents)}
                onChange={(e) =>
                  setLocationForm((p) => ({
                    ...p,
                    consultationPriceCents: parseBrlToCents(e.target.value),
                  }))
                }
                required
              />
            </label>
            <div className="inline-actions">
              <button type="submit">{editingLocationId ? "Atualizar" : "Salvar"}</button>
              <button type="button" className="btn-ghost" onClick={resetLocationForm}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Endereco</th>
                <th>Cidade/UF</th>
                <th>Valor base</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => (
                <tr key={location._id}>
                  <td>{location.name}</td>
                  <td>{location.addressLine1}</td>
                  <td>{location.city}/{location.state}</td>
                  <td>{centsToBrl(location.consultationPriceCents)}</td>
                  <td>
                    <button type="button" className="btn-ghost" onClick={() => startEditLocation(location)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="table-header">
          <h3>Procedimentos</h3>
          <button
            type="button"
            onClick={() => {
              setEditingProcedureId("");
              setProcedureForm(emptyProcedure);
              setShowProcedureForm(true);
            }}
          >
            + Adicionar procedimento
          </button>
        </div>

        {showProcedureForm ? (
          <form className="form-grid" onSubmit={saveProcedure}>
            <label>
              Nome
              <input value={procedureForm.name} onChange={(e) => setProcedureForm((p) => ({ ...p, name: e.target.value }))} required />
            </label>
            <label>
              Descricao
              <textarea value={procedureForm.description} onChange={(e) => setProcedureForm((p) => ({ ...p, description: e.target.value }))} />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={Boolean(procedureForm.appointmentConfirmationEnabled)}
                onChange={(e) =>
                  setProcedureForm((p) => ({
                    ...p,
                    appointmentConfirmationEnabled: e.target.checked,
                  }))
                }
              />
              Enviar confirmação de agendamento para este procedimento
            </label>
            <label>
              Template de confirmação do procedimento
              <textarea
                value={procedureForm.appointmentConfirmationTemplate}
                onChange={(e) =>
                  setProcedureForm((p) => ({
                    ...p,
                    appointmentConfirmationTemplate: e.target.value,
                  }))
                }
                placeholder={`Confirmado agendamento\n\nAgendamento: {{startsAt}}\n{{locationName}} - {{procedureName}}\n{{locationAddress}}\n\nAs informacoes de preparo...`}
                disabled={!procedureForm.appointmentConfirmationEnabled}
              />
            </label>
            <label>
              Link de preparo/orientacoes
              <input
                type="url"
                value={procedureForm.preparationInfoUrl}
                onChange={(e) =>
                  setProcedureForm((p) => ({
                    ...p,
                    preparationInfoUrl: e.target.value,
                  }))
                }
                placeholder="https://stohler.com.br/endoscopia-digestiva-alta/"
              />
            </label>
            <label>
              Duracao (min)
              <input type="number" min="10" value={procedureForm.defaultDurationMinutes} onChange={(e) => setProcedureForm((p) => ({ ...p, defaultDurationMinutes: e.target.value }))} required />
            </label>
            <label>
              Valor padrao
              <input
                value={formatBrlInputFromCents(procedureForm.defaultPriceCents)}
                onChange={(e) =>
                  setProcedureForm((p) => ({
                    ...p,
                    defaultPriceCents: parseBrlToCents(e.target.value),
                  }))
                }
                required
              />
            </label>

            <div className="card-mini">
              <strong>Valor por endereco</strong>
              {pricesPreview.map(({ location, price, enabled }) => (
                <label key={location._id}>
                  <span className="inline-actions">
                    <strong>{location.name}</strong>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          toggleProcedureAtLocation(location._id, e.target.checked)
                        }
                      />
                      Realiza neste endereco
                    </label>
                  </span>
                  <input
                    value={formatBrlInputFromCents(price)}
                    onChange={(e) => updateLocationPrice(location._id, e.target.value)}
                    disabled={!enabled}
                  />
                </label>
              ))}
            </div>

            <div className="inline-actions">
              <button type="submit">{editingProcedureId ? "Atualizar" : "Salvar"}</button>
              <button type="button" className="btn-ghost" onClick={resetProcedureForm}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Duracao</th>
                <th>Valor padrao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {procedures.map((procedure) => (
                <tr key={procedure._id}>
                  <td>{procedure.name}</td>
                  <td>{procedure.defaultDurationMinutes} min</td>
                  <td>{centsToBrl(procedure.defaultPriceCents)}</td>
                  <td>
                    <button type="button" className="btn-ghost" onClick={() => startEditProcedure(procedure)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
