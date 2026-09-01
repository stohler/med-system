import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../state";
import { useToast } from "../toast";
import { getLocationColor } from "../utils/locationColors";
import { useDebouncedValue } from "../utils/useDebouncedValue";

dayjs.extend(isoWeek);

const DAYS = [
  { key: 1, label: "Seg" },
  { key: 2, label: "Ter" },
  { key: 3, label: "Qua" },
  { key: 4, label: "Qui" },
  { key: 5, label: "Sex" },
  { key: 6, label: "Sab" },
  { key: 7, label: "Dom" },
];

function buildHalfHourSlotLabels(startHour, endHour) {
  const slots = [];
  const from = Math.max(0, Math.min(23, Number(startHour) || 0));
  const to = Math.max(0, Math.min(23, Number(endHour) || 0));
  if (from > to) return slots;
  for (let minutes = from * 60; minutes <= to * 60; minutes += 30) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`);
  }
  return slots;
}

function timeLabelFromMinutes(slotMin) {
  const h = Math.floor(slotMin / 60);
  const mm = slotMin % 60;
  return `${String(h).padStart(2, "0")}:${mm === 0 ? "00" : "30"}`;
}

function halfHourSlotKeyFromDate(isoOrDate) {
  const start = dayjs(isoOrDate);
  if (!start.isValid()) return null;
  const dayKey = start.isoWeekday();
  const totalMin = start.hour() * 60 + start.minute();
  const slotMin = Math.floor(totalMin / 30) * 30;
  const hourKey = timeLabelFromMinutes(slotMin);
  return `${dayKey}-${hourKey}`;
}

const emptyForm = {
  patientId: "",
  patientSearch: "",
  location: "",
  procedureType: "",
  startsAt: "",
  endsAt: "",
  notes: "",
};

function procedureEnabledAtLocation(procedure, locationId) {
  if (!procedure || !locationId) return true;
  const locationPrices = Array.isArray(procedure.locationPrices) ? procedure.locationPrices : [];
  if (locationPrices.length === 0) return true;
  return locationPrices.some((entry) => String(entry.location) === String(locationId));
}

const emptyMessagePreview = {
  open: false,
  loading: false,
  payload: null,
  message: "",
  canSend: false,
};

function patientLabel(patient) {
  const birth = patient.birthDate ? dayjs(patient.birthDate).format("DD/MM/YYYY") : "--";
  return `${patient.fullName} - ${birth}`;
}

function toDateTimeLocal(value) {
  return dayjs(value).format("YYYY-MM-DDTHH:mm");
}

function locationCardStyle(location) {
  const color = getLocationColor(location?._id || location || "default");
  return {
    background: color.bg,
    borderColor: color.border,
    color: color.text,
  };
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 7H20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 7V5.8C9 5.24772 9.44772 4.8 10 4.8H14C14.5523 4.8 15 5.24772 15 5.8V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 7L7.9 18.4C7.94099 18.9195 8.37548 19.32 8.896 19.32H15.104C15.6245 19.32 16.059 18.9195 16.1 18.4L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10 10.5V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14 10.5V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function AppointmentsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [googleSync, setGoogleSync] = useState({
    loading: true,
    connected: false,
    configured: false,
    details: "",
  });
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(dayjs().startOf("isoWeek"));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [messagePreview, setMessagePreview] = useState(emptyMessagePreview);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [clinicPrefs, setClinicPrefs] = useState({
    agendaGridStartHour: 7,
    agendaGridEndHour: 19,
  });
  const [markingNoShow, setMarkingNoShow] = useState(false);
  const [appointmentActionLoading, setAppointmentActionLoading] = useState("");

  const navigate = useNavigate();
  const locationRouter = useLocation();

  const calculateEndsAt = (startsAtValue, procedureTypeId) => {
    if (!startsAtValue) return "";
    const startsAt = dayjs(startsAtValue);
    if (!startsAt.isValid()) return "";
    const procedure = procedures.find((item) => String(item._id) === String(procedureTypeId));
    const durationMinutes = Number(procedure?.defaultDurationMinutes || 30);
    return startsAt.add(durationMinutes, "minute").format("YYYY-MM-DDTHH:mm");
  };

  const loadGoogleSyncStatus = async () => {
    try {
      const { data } = await api.get("/integrations/google/status");
      const connected = Boolean(data?.connected);
      const configured = Boolean(data?.configured);
      const details = !configured
        ? "Integracao Google nao configurada no servidor."
        : connected
          ? data?.tokenExpiryAt
            ? `Expira em ${dayjs(data.tokenExpiryAt).format("DD/MM/YYYY HH:mm")}`
            : "Conexao ativa."
          : "Conecte na tela Integracoes para sincronizar com Google Calendar.";

      setGoogleSync({
        loading: false,
        connected,
        configured,
        details,
      });
    } catch (_error) {
      setGoogleSync({
        loading: false,
        connected: false,
        configured: false,
        details:
          "Nao foi possivel verificar status da integracao Google neste momento.",
      });
    }
  };

  const load = async () => {
    const weekFrom = weekStart.startOf("day").toISOString();
    const weekTo = weekStart.add(6, "day").endOf("day").toISOString();

    const [l, pr, a, prefsRes] = await Promise.all([
      api.get("/locations"),
      api.get("/procedures"),
      api.get("/appointments", { params: { from: weekFrom, to: weekTo } }),
      api.get("/clinic-preferences").catch(() => ({ data: {} })),
    ]);
    setLocations(l.data.locations || []);
    setProcedures(pr.data.procedures || []);
    setAppointments(a.data.appointments || []);
    const prefs = prefsRes?.data;
    if (
      typeof prefs?.agendaGridStartHour === "number" &&
      typeof prefs?.agendaGridEndHour === "number"
    ) {
      setClinicPrefs({
        agendaGridStartHour: prefs.agendaGridStartHour,
        agendaGridEndHour: prefs.agendaGridEndHour,
      });
    }
  };

  useEffect(() => {
    load().catch((err) => setError(err?.response?.data?.message || "Falha ao carregar agenda"));
  }, [weekStart.valueOf()]);

  useEffect(() => {
    if (user?.role === "reception") {
      setGoogleSync({
        loading: false,
        connected: false,
        configured: false,
        details: "Integracao Google nao disponivel para seu perfil.",
      });
      return undefined;
    }
    loadGoogleSyncStatus().catch(() => null);
    return undefined;
  }, [user?.role]);

  useEffect(() => {
    const selected = locationRouter.state?.selectedPatient;
    if (!selected) return;
    const draft = locationRouter.state?.appointmentDraft || {};
    const draftWeekStart = locationRouter.state?.appointmentWeekStart;

    if (draftWeekStart) {
      const parsedWeek = dayjs(draftWeekStart);
      if (parsedWeek.isValid()) {
        setWeekStart(parsedWeek.startOf("isoWeek"));
      }
    }

    setForm((prev) => ({
      ...prev,
      ...draft,
      patientId: selected.id,
      patientSearch: patientLabel({
        fullName: selected.fullName,
        birthDate: selected.birthDate,
      }),
    }));
    if (locationRouter.state?.openAppointmentForm) {
      setShowForm(true);
    }

    navigate(locationRouter.pathname, { replace: true, state: null });
  }, [locationRouter.state]);

  const debouncedPatientQuery = useDebouncedValue(form.patientSearch, 300);

  useEffect(() => {
    if (form.patientId) {
      setPatientSuggestions([]);
      setPatientSearchLoading(false);
      return undefined;
    }

    const query = debouncedPatientQuery.trim();
    if (!query) {
      setPatientSuggestions([]);
      setPatientSearchLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setPatientSearchLoading(true);

    api
      .get("/patients", {
        params: { q: query, pageSize: 15 },
        signal: controller.signal,
      })
      .then(({ data }) => {
        setPatientSuggestions(data.data || []);
      })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        setPatientSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPatientSearchLoading(false);
        }
      });

    return () => controller.abort();
  }, [debouncedPatientQuery, form.patientId]);

  const proceduresForSelectedLocation = useMemo(() => {
    if (!form.location) return procedures;
    return procedures.filter((procedure) =>
      procedureEnabledAtLocation(procedure, form.location)
    );
  }, [procedures, form.location]);

  const timeSlots = useMemo(() => {
    const base = buildHalfHourSlotLabels(
      clinicPrefs.agendaGridStartHour,
      clinicPrefs.agendaGridEndHour
    );
    const set = new Set(base);
    for (const appointment of appointments) {
      const start = dayjs(appointment.startsAt);
      if (!start.isValid()) continue;
      const totalMin = start.hour() * 60 + start.minute();
      const slotMin = Math.floor(totalMin / 30) * 30;
      set.add(timeLabelFromMinutes(slotMin));
    }
    return Array.from(set).sort((a, b) => {
      const [ha, ma] = a.split(":").map(Number);
      const [hb, mb] = b.split(":").map(Number);
      return ha * 60 + ma - (hb * 60 + mb);
    });
  }, [
    clinicPrefs.agendaGridStartHour,
    clinicPrefs.agendaGridEndHour,
    appointments,
  ]);

  const weeklyGrid = useMemo(() => {
    const map = new Map();

    for (const appointment of appointments) {
      const key = halfHourSlotKeyFromDate(appointment.startsAt);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(appointment);
      map.set(key, list);
    }

    return map;
  }, [appointments]);

  const openForm = (dayKey) => {
    const start = weekStart.isoWeekday(dayKey).hour(9).minute(0).second(0).millisecond(0);
    const end = start.add(30, "minute");

    setForm((prev) => {
      const initialLocation = prev.location || locations[0]?._id || "";
      const availableProcedures = procedures.filter((procedure) =>
        procedureEnabledAtLocation(procedure, initialLocation)
      );
      const initialProcedureType =
        availableProcedures.find(
          (procedure) => String(procedure._id) === String(prev.procedureType)
        )?._id ||
        availableProcedures[0]?._id ||
        "";
      return ({
      ...emptyForm,
      ...prev,
      location: initialLocation,
      procedureType: initialProcedureType,
      startsAt: toDateTimeLocal(start),
      endsAt:
        calculateEndsAt(
          toDateTimeLocal(start),
          initialProcedureType
        ) || toDateTimeLocal(end),
    })});
    setShowForm(true);
  };

  const openEditForm = (appointment) => {
    setForm({
      patientId: appointment.patient?._id || appointment.patient,
      patientSearch: patientLabel(appointment.patient || {}),
      location: appointment.location?._id || appointment.location,
      procedureType: appointment.procedureType?._id || appointment.procedureType,
      startsAt: toDateTimeLocal(appointment.startsAt),
      endsAt: toDateTimeLocal(appointment.endsAt),
      notes: appointment.notes || "",
      editingId: appointment._id,
    });
    setShowForm(true);
  };

  const goToAttend = (appointment) => {
    const appointmentContext = {
      id: appointment._id,
      patient: appointment.patient || null,
      procedureType: appointment.procedureType || null,
      location: appointment.location || null,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
    localStorage.setItem("active_appointment_context", JSON.stringify(appointmentContext));
    navigate("/encounters", {
      state: {
        openEncounterForm: true,
        appointmentId: appointment._id,
        appointmentContext,
      },
    });
  };

  const handleAppointmentClick = (appointment) => {
    setSelectedAppointment(appointment);
  };

  const handleMarkNoShow = async () => {
    if (!selectedAppointment?._id) return;
    const ok = window.confirm("Marcar este agendamento como falta do paciente?");
    if (!ok) return;
    setMarkingNoShow(true);
    setError("");
    try {
      await api.put(`/appointments/${selectedAppointment._id}`, { status: "no_show" });
      toast.success("Agendamento marcado como faltou.");
      setSelectedAppointment(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel atualizar o agendamento");
    } finally {
      setMarkingNoShow(false);
    }
  };

  const handleResendTemplate = async () => {
    if (!selectedAppointment?._id) return;
    setAppointmentActionLoading("resend-template");
    setError("");
    try {
      const { data } = await api.post(`/appointments/${selectedAppointment._id}/resend-template`);
      toast.success(data?.message || "Template reenviado com sucesso.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel reenviar o template");
    } finally {
      setAppointmentActionLoading("");
    }
  };

  const handleSendAgendaConfirmation = async () => {
    if (!selectedAppointment?._id) return;
    setAppointmentActionLoading("send-confirmation");
    setError("");
    try {
      const { data } = await api.post(
        `/appointments/${selectedAppointment._id}/send-confirmation`
      );
      toast.success(data?.message || "Confirmacao enviada com sucesso.");
      await load();
      setSelectedAppointment((prev) =>
        prev ? { ...prev, status: "confirmed" } : prev
      );
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel enviar a confirmacao");
    } finally {
      setAppointmentActionLoading("");
    }
  };

  const goToPatientCreate = () => {
    const typed = form.patientSearch.trim();
    navigate("/patients", {
      state: {
        returnTo: "/appointments",
        prefillPatientName: typed,
        appointmentWeekStart: weekStart.toISOString(),
        appointmentDraft: {
          location: form.location,
          procedureType: form.procedureType,
          startsAt: form.startsAt,
          endsAt: form.endsAt,
          notes: form.notes,
        },
      },
    });
  };

  const handlePatientBlur = () => {
    const typed = form.patientSearch.trim();
    if (!typed || form.patientId) return;

    const shouldCreate = window.confirm(
      `Paciente "${typed}" nao encontrado. Deseja ir para o cadastro de paciente?`
    );

    if (shouldCreate) {
      goToPatientCreate();
    }
  };

  const selectPatient = (patient) => {
    setForm((prev) => ({
      ...prev,
      patientId: patient._id,
      patientSearch: patientLabel(patient),
    }));
    setPatientSuggestions([]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      if (!form.patientId) {
        throw new Error("Selecione um paciente ou clique para cadastrar.");
      }

      const payload = {
        patient: form.patientId,
        location: form.location,
        procedureType: form.procedureType,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        notes: form.notes,
      };

      if (form.editingId) {
        await api.put(`/appointments/${form.editingId}`, payload);
        setShowForm(false);
        setForm(emptyForm);
        await load();
        return;
      } else {
        setMessagePreview({
          open: true,
          loading: true,
          payload,
          message: "",
          canSend: false,
        });
        const { data } = await api.post("/appointments/preview-message", payload);
        setMessagePreview({
          open: true,
          loading: false,
          payload,
          message: data?.message || "",
          canSend: Boolean(data?.canSend),
        });
        return;
      }
    } catch (err) {
      setMessagePreview(emptyMessagePreview);
      setError(err?.response?.data?.message || err.message || "Falha ao salvar agendamento");
    }
  };

  const closeMessagePreview = () => {
    if (savingAppointment) return;
    setMessagePreview(emptyMessagePreview);
  };

  const finishCreateWithMessageAction = async (action) => {
    if (!messagePreview.payload) return;
    setSavingAppointment(true);
    setError("");
    const previewText = messagePreview.message || "";

    if (action === "copy" && previewText) {
      try {
        await navigator.clipboard.writeText(previewText);
        toast.success("Mensagem copiada para a area de transferencia.");
      } catch (_error) {
        toast.error("Nao foi possivel copiar a mensagem automaticamente.");
      }
    }

    try {
      const { data } = await api.post("/appointments", {
        ...messagePreview.payload,
        confirmMessage: {
          action,
          text: previewText,
        },
      });
      setMessagePreview(emptyMessagePreview);
      setShowForm(false);
      setForm(emptyForm);
      await load();
      if (action === "send") {
        if (data?.whatsapp?.sent) {
          toast.success("Agendamento salvo e mensagem enviada.");
        } else {
          toast.error("Agendamento salvo, mas a mensagem do WhatsApp falhou.");
        }
      } else if (action === "copy") {
        toast.success("Agendamento salvo sem envio automatico.");
      } else {
        toast.info("Agendamento salvo sem envio de mensagem.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao salvar agendamento");
    } finally {
      setSavingAppointment(false);
    }
  };

  const previousWeek = () => setWeekStart((prev) => prev.subtract(7, "day"));
  const nextWeek = () => setWeekStart((prev) => prev.add(7, "day"));
  const deleteEditingAppointment = async () => {
    if (!form.editingId) return;
    const confirmed = window.confirm("Deseja cancelar este agendamento?");
    if (!confirmed) return;

    setError("");
    try {
      await api.delete(`/appointments/${form.editingId}`);
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(
        err?.response?.data?.message || "Falha ao cancelar agendamento"
      );
    }
  };

  const printDaySummary = (dayKey) => {
    const dayMeta = DAYS.find((day) => day.key === dayKey);
    const dayDate = weekStart.isoWeekday(dayKey);
    const dayAppointments = appointments
      .filter((item) => dayjs(item.startsAt).isSame(dayDate, "day"))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    const printWindow = window.open(
      "about:blank",
      "_blank",
      "width=980,height=720"
    );
    if (!printWindow) {
      setError("Nao foi possivel abrir a janela de impressao. Libere pop-ups e tente novamente.");
      return;
    }

    const rowsHtml =
      dayAppointments.length > 0
        ? dayAppointments
            .map((item) => {
              const startsAt = dayjs(item.startsAt);
              const endsAt = dayjs(item.endsAt);
              const period = `${startsAt.format("HH:mm")} - ${
                endsAt.isValid() ? endsAt.format("HH:mm") : "--:--"
              }`;
              return `
                <tr>
                  <td>${escapeHtml(period)}</td>
                  <td>${escapeHtml(item.patient?.fullName || "Sem paciente")}</td>
                  <td>${escapeHtml(item.patient?.phone || "-")}</td>
                  <td>${escapeHtml(item.procedureType?.name || "Sem procedimento")}</td>
                  <td>${escapeHtml(item.location?.name || "Sem local")}</td>
                  <td>${escapeHtml(item.notes || "-")}</td>
                </tr>
              `;
            })
            .join("")
        : `
          <tr>
            <td colspan="6">Nenhum agendamento para este dia.</td>
          </tr>
        `;

    const title = `Resumo de pacientes - ${dayMeta?.label || "Dia"} ${dayDate.format("DD/MM/YYYY")}`;
    const printHtml = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
            h1 { margin: 0 0 6px; font-size: 20px; }
            p { margin: 0 0 16px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p>Total de agendamentos: ${dayAppointments.length}</p>
          <table>
            <thead>
              <tr>
                <th>Horario</th>
                <th>Paciente</th>
                <th>Telefone</th>
                <th>Procedimento</th>
                <th>Endereco</th>
                <th>Observacoes</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <section className="stack">
      <div className="week-header">
        <h2>Agenda da Semana</h2>
        <div className="inline-actions">
          <span
            className={`status-chip ${
              googleSync.connected ? "status-chip-connected" : "status-chip-disconnected"
            }`}
            title={googleSync.details}
          >
            Google Sync:{" "}
            {googleSync.loading
              ? "Verificando..."
              : googleSync.connected
                ? "Ativo"
                : "Inativo"}
          </span>
          <button type="button" className="btn-ghost" onClick={previousWeek}>
            Semana anterior
          </button>
          <button type="button" className="btn-ghost" onClick={nextWeek}>
            Proxima semana
          </button>
        </div>
      </div>

      <div className="week-days-actions">
        {DAYS.map((day) => {
          const date = weekStart.isoWeekday(day.key);
          return (
            <div key={day.key} className="day-actions-card">
              <button
                type="button"
                className="day-add-btn"
                onClick={() => openForm(day.key)}
                title={`Novo agendamento em ${day.label}`}
              >
                + {day.label} {date.format("DD/MM")}
              </button>
              <button
                type="button"
                className="btn-ghost day-print-btn"
                onClick={() => printDaySummary(day.key)}
                title={`Imprimir resumo de ${day.label}`}
              >
                Imprimir
              </button>
            </div>
          );
        })}
      </div>

      {showForm ? (
        <form className="card form-grid" onSubmit={submit}>
          <div className="form-title-row">
            <h3>{form.editingId ? "Editar agendamento" : "Novo agendamento"}</h3>
            {form.editingId ? (
              <button
                type="button"
                className="icon-danger-button"
                title="Cancelar agendamento"
                aria-label="Cancelar agendamento"
                onClick={deleteEditingAppointment}
              >
                <TrashIcon />
              </button>
            ) : null}
          </div>

          {googleSync.loading ? (
            <p className="muted">Validando status da integracao Google...</p>
          ) : googleSync.connected ? (
            <p className="success">Google Calendar conectado: este agendamento sera sincronizado.</p>
          ) : (
            <p className="error">
              Google Calendar desconectado: o agendamento sera salvo apenas no sistema.
            </p>
          )}

          <label className="autocomplete-wrap">
            Paciente
            <input
              value={form.patientSearch}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, patientSearch: e.target.value, patientId: "" }))
              }
              onBlur={() => {
                setTimeout(() => handlePatientBlur(), 120);
              }}
              placeholder="Digite nome do paciente"
              required
            />
            {patientSearchLoading && !form.patientId && form.patientSearch.trim() ? (
              <p className="muted autocomplete-status">Buscando pacientes...</p>
            ) : null}
            {patientSuggestions.length > 0 && !form.patientId ? (
              <div className="autocomplete-list">
                {patientSuggestions.map((patient) => (
                  <button
                    type="button"
                    key={patient._id}
                    className="autocomplete-item"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectPatient(patient);
                    }}
                  >
                    {patientLabel(patient)}
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          {!form.patientId && form.patientSearch.trim() ? (
            <button type="button" className="btn-ghost" onClick={goToPatientCreate}>
              Cadastrar novo paciente
            </button>
          ) : null}

          <label>
            Endereco
            <select
              value={form.location}
              onChange={(e) =>
                setForm((prev) => {
                  const nextLocation = e.target.value;
                  const allowedProcedures = procedures.filter((procedure) =>
                    procedureEnabledAtLocation(procedure, nextLocation)
                  );
                  const keptProcedure = allowedProcedures.find(
                    (procedure) => String(procedure._id) === String(prev.procedureType)
                  );
                  const nextProcedureType = keptProcedure?._id || allowedProcedures[0]?._id || "";
                  return {
                    ...prev,
                    location: nextLocation,
                    procedureType: nextProcedureType,
                    endsAt: calculateEndsAt(prev.startsAt, nextProcedureType) || prev.endsAt,
                  };
                })
              }
              required
            >
              <option value="">Selecione</option>
              {locations.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Procedimento
            <select
              value={form.procedureType}
              onChange={(e) =>
                setForm((prev) => {
                  const nextProcedureType = e.target.value;
                  return {
                    ...prev,
                    procedureType: nextProcedureType,
                    endsAt:
                      calculateEndsAt(prev.startsAt, nextProcedureType) || prev.endsAt,
                  };
                })
              }
              required
            >
              <option value="">Selecione</option>
              {proceduresForSelectedLocation.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Inicio
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  startsAt: e.target.value,
                  endsAt:
                    calculateEndsAt(e.target.value, prev.procedureType) || prev.endsAt,
                }))
              }
              required
            />
          </label>

          <label>
            Fim
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
              required
            />
          </label>

          <label>
            Observacoes
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>

          <div className="inline-actions">
            <button type="submit">Salvar agendamento</button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      {messagePreview.open ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Previa da mensagem para o paciente</h3>
            {messagePreview.loading ? (
              <p className="muted">Montando mensagem...</p>
            ) : (
              <>
                {!messagePreview.canSend ? (
                  <p className="muted">
                    Este procedimento esta com envio desativado. Voce ainda pode copiar ou
                    seguir sem enviar.
                  </p>
                ) : null}
                <textarea
                  value={messagePreview.message}
                  readOnly
                  rows={12}
                  style={{ width: "100%", resize: "vertical" }}
                />
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => finishCreateWithMessageAction("send")}
                    disabled={
                      messagePreview.loading ||
                      savingAppointment ||
                      !messagePreview.canSend
                    }
                  >
                    Enviar e salvar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => finishCreateWithMessageAction("skip")}
                    disabled={messagePreview.loading || savingAppointment}
                  >
                    Nao enviar e salvar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => finishCreateWithMessageAction("copy")}
                    disabled={messagePreview.loading || savingAppointment}
                  >
                    Copiar e salvar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={closeMessagePreview}
                    disabled={savingAppointment}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="week-grid-wrap card">
        <div className="week-grid">
          <div className="week-grid-head hour-col">Horario</div>
          {DAYS.map((day) => {
            const date = weekStart.isoWeekday(day.key);
            return (
              <div key={day.key} className="week-grid-head">
                {day.label} <span>{date.format("DD/MM")}</span>
              </div>
            );
          })}

          {timeSlots.map((slot) => (
            <div key={`row-${slot}`} style={{ display: "contents" }}>
              <div key={`h-${slot}`} className="week-grid-hour">
                {slot}
              </div>
              {DAYS.map((day) => {
                const key = `${day.key}-${slot}`;
                const items = weeklyGrid.get(key) || [];
                return (
                  <div key={`${key}-cell`} className="week-grid-cell">
                    {items.map((item) => (
                      <article
                        key={item._id}
                        className={`week-event clickable${
                          item.status === "no_show" ? " week-event-no-show" : ""
                        }`}
                        onClick={() => handleAppointmentClick(item)}
                        title="Clique para editar ou atender"
                        style={locationCardStyle(item.location)}
                      >
                        {item.status === "no_show" ? (
                          <span className="week-event-badge">Faltou</span>
                        ) : null}
                        <strong>{item.patient?.fullName}</strong>
                        <span>{item.procedureType?.name}</span>
                        <span className="location-chip" style={locationCardStyle(item.location)}>
                          {item.location?.name}
                        </span>
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedAppointment ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Acoes do agendamento</h3>
            <p>
              {selectedAppointment.patient?.fullName}
              {selectedAppointment.patient?.birthDate
                ? ` - ${dayjs(selectedAppointment.patient.birthDate).format("DD/MM/YYYY")}`
                : ""}{" "}
              - {dayjs(selectedAppointment.startsAt).format("DD/MM/YYYY HH:mm")}
            </p>
            <p>
              <strong>Telefone:</strong> {selectedAppointment.patient?.phone || "-"}
            </p>
            {selectedAppointment.status === "no_show" ? (
              <p className="week-event-badge-inline">Paciente faltou neste horario.</p>
            ) : null}
            <div
              className="location-chip"
              style={locationCardStyle(selectedAppointment.location)}
            >
              {selectedAppointment.location?.name || "Sem local"}
            </div>
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => {
                  openEditForm(selectedAppointment);
                  setSelectedAppointment(null);
                }}
              >
                Editar agendamento
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  goToAttend(selectedAppointment);
                  setSelectedAppointment(null);
                }}
              >
                Atender paciente
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={Boolean(appointmentActionLoading)}
                onClick={() => handleResendTemplate()}
              >
                {appointmentActionLoading === "resend-template"
                  ? "Reenviando..."
                  : "Reenviar template"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={Boolean(appointmentActionLoading)}
                onClick={() => handleSendAgendaConfirmation()}
              >
                {appointmentActionLoading === "send-confirmation"
                  ? "Enviando..."
                  : "Enviar confirmacao agenda"}
              </button>
              {["scheduled", "confirmed"].includes(selectedAppointment.status) ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={markingNoShow}
                  onClick={() => handleMarkNoShow()}
                >
                  {markingNoShow ? "Salvando..." : "Marcar faltou"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelectedAppointment(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
