import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

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
  pricesByLocation: [],
};

export function SettingsPage() {
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [locationForm, setLocationForm] = useState(emptyLocation);
  const [procedureForm, setProcedureForm] = useState(emptyProcedure);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const [l, p] = await Promise.all([api.get("/locations"), api.get("/procedures")]);
    setLocations(l.data.locations || []);
    setProcedures(p.data.procedures || []);
  };

  useEffect(() => {
    load().catch((err) => setError(err?.response?.data?.message || "Falha ao carregar configuracoes"));
  }, []);

  const pricesPreview = useMemo(() => {
    const map = new Map(procedureForm.pricesByLocation.map((item) => [item.location, item.priceCents]));
    return locations.map((location) => ({
      location,
      price: map.has(location._id) ? map.get(location._id) : procedureForm.defaultPriceCents,
    }));
  }, [locations, procedureForm]);

  const saveLocation = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.post("/locations", {
        ...locationForm,
        consultationPriceCents: Number(locationForm.consultationPriceCents),
      });
      setLocationForm(emptyLocation);
      await load();
      setMessage("Endereco salvo com sucesso.");
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel salvar endereco");
    }
  };

  const saveProcedure = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.post("/procedures", {
        ...procedureForm,
        defaultDurationMinutes: Number(procedureForm.defaultDurationMinutes),
        defaultPriceCents: Number(procedureForm.defaultPriceCents),
      });
      setProcedureForm(emptyProcedure);
      await load();
      setMessage("Procedimento salvo com sucesso.");
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel salvar procedimento");
    }
  };

  const updateLocationPrice = (locationId, value) => {
    const priceCents = Number(value || 0);
    setProcedureForm((prev) => {
      const remaining = prev.pricesByLocation.filter((entry) => entry.location !== locationId);
      return {
        ...prev,
        pricesByLocation: [...remaining, { location: locationId, priceCents }],
      };
    });
  };

  return (
    <section className="stack">
      <h2>Configuracoes</h2>
      <p className="muted">
        Cadastre enderecos e procedimentos padrao. O mesmo procedimento pode ter preco diferente por local.
      </p>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}

      <div className="grid-cards">
        <form className="card form-grid" onSubmit={saveLocation}>
          <h3>Novo endereco</h3>
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
            Valor base da consulta (centavos)
            <input
              type="number"
              min="0"
              value={locationForm.consultationPriceCents}
              onChange={(e) =>
                setLocationForm((p) => ({ ...p, consultationPriceCents: e.target.value }))
              }
              required
            />
          </label>
          <button type="submit">Salvar endereco</button>
        </form>

        <form className="card form-grid" onSubmit={saveProcedure}>
          <h3>Novo procedimento</h3>
          <label>
            Nome
            <input value={procedureForm.name} onChange={(e) => setProcedureForm((p) => ({ ...p, name: e.target.value }))} required />
          </label>
          <label>
            Descricao
            <textarea value={procedureForm.description} onChange={(e) => setProcedureForm((p) => ({ ...p, description: e.target.value }))} />
          </label>
          <label>
            Duracao padrao (min)
            <input
              type="number"
              min="10"
              value={procedureForm.defaultDurationMinutes}
              onChange={(e) =>
                setProcedureForm((p) => ({ ...p, defaultDurationMinutes: e.target.value }))
              }
              required
            />
          </label>
          <label>
            Valor padrao (centavos)
            <input
              type="number"
              min="0"
              value={procedureForm.defaultPriceCents}
              onChange={(e) =>
                setProcedureForm((p) => ({ ...p, defaultPriceCents: e.target.value }))
              }
              required
            />
          </label>

          <div className="card-mini">
            <strong>Preco por endereco</strong>
            {pricesPreview.map(({ location, price }) => (
              <label key={location._id}>
                {location.name}
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => updateLocationPrice(location._id, e.target.value)}
                />
              </label>
            ))}
          </div>

          <button type="submit">Salvar procedimento</button>
        </form>
      </div>

      <div className="card">
        <h3>Enderecos cadastrados</h3>
        <div className="list">
          {locations.map((location) => (
            <article key={location._id} className="card-mini">
              <strong>{location.name}</strong>
              <p>
                {location.addressLine1} - {location.city}/{location.state}
              </p>
              <p>Valor consulta base: R$ {(location.consultationPriceCents / 100).toFixed(2)}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Procedimentos cadastrados</h3>
        <div className="list">
          {procedures.map((procedure) => (
            <article key={procedure._id} className="card-mini">
              <strong>{procedure.name}</strong>
              <p>{procedure.description || "Sem descricao"}</p>
              <p>Duracao: {procedure.defaultDurationMinutes} min</p>
              <p>Valor padrao: R$ {(procedure.defaultPriceCents / 100).toFixed(2)}</p>
              {procedure.pricesByLocation?.length ? (
                <ul>
                  {procedure.pricesByLocation.map((entry) => {
                    const location = locations.find((item) => item._id === entry.location);
                    return (
                      <li key={`${procedure._id}-${entry.location}`}>
                        {location?.name || "Local"}: R$ {(entry.priceCents / 100).toFixed(2)}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
