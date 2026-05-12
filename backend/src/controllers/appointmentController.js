const { z } = require("zod");
const mongoose = require("mongoose");
const {
  Appointment,
  ClinicLocation,
  ProcedureType,
  Patient,
  MessageTemplate,
} = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError, NotFoundError, ForbiddenError } = require("../utils/errors");
const {
  createCalendarEvent,
  getValidGoogleTokensForUser,
  updateCalendarEvent,
} = require("../services/googleCalendarService");
const { sendWhatsappNotification } = require("../services/whatsappService");
const { formatDisplayDate, formatDisplayTime } = require("../utils/displayTime");
const {
  assertLocationAllowedForReception,
  normalizedAllowedLocationIds,
} = require("../utils/locationAccess");

const CONSULTATION_REMINDER_KEY = "consultation_reminder_1_day_before";
const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const DEFAULT_APPOINTMENT_TEMPLATE = `Confirmado agendamento

Agendamento: {{appointmentDate}} - {{appointmentTime}}
{{locationName}} - {{procedureName}}
{{locationAddress}}

As informacoes de preparo e orientacoes sobre o exame podem ser encontradas nesse link:

{{preparationInfoUrl}}

A nao realizacao correta do preparo, conforme orientado, pode acarretar a nao
realizacao do exame.`;

const appointmentSchema = z.object({
  patient: z.string().min(1),
  location: z.string().min(1),
  procedureType: z.string().min(1),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  notes: z.string().optional(),
});

const updateSchema = appointmentSchema.partial().extend({
  status: z
    .enum(["scheduled", "confirmed", "cancelled", "completed", "no_show"])
    .optional(),
});

const confirmMessageSchema = z
  .object({
    action: z.enum(["send", "skip", "copy"]).default("skip"),
    text: z.string().optional(),
  })
  .optional();

function overlapFilter({ startsAt, endsAt, location, ignoreId }) {
  return {
    location,
    _id: ignoreId ? { $ne: ignoreId } : { $exists: true },
    status: { $in: ["scheduled", "confirmed"] },
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt },
  };
}

async function ensureNoOverlap(payload, ignoreId) {
  const exists = await Appointment.findOne(overlapFilter({ ...payload, ignoreId }));
  if (exists) {
    throw new AppError(
      "Conflito de agenda: ja existe outro agendamento nesse intervalo",
      409
    );
  }
}

async function calculatePrice(locationId, procedureTypeId) {
  const [location, procedure] = await Promise.all([
    ClinicLocation.findById(locationId),
    ProcedureType.findById(procedureTypeId),
  ]);

  if (!location || !procedure) {
    throw new NotFoundError("Endereco ou procedimento nao encontrado");
  }

  const locationOverrides = Array.isArray(procedure.locationPrices)
    ? procedure.locationPrices
    : [];
  const override = locationOverrides.find(
    (item) => String(item.location) === String(location._id)
  );
  if (locationOverrides.length > 0 && !override) {
    throw new AppError("Procedimento nao disponivel para este endereco", 400);
  }
  const procedurePrice = override ? override.priceCents : procedure.defaultPriceCents || 0;

  return (location.consultationPriceCents || 0) + procedurePrice;
}

function buildLocationAddress(location) {
  if (!location) return "-";
  const cityUf = [location.city, location.state].filter(Boolean).join(" - ");
  const parts = [location.addressLine1, cityUf, location.zipCode].filter(Boolean);
  return parts.join(", ") || "-";
}

function renderTemplate(template, context) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, token) => {
    return String(context[token] ?? "");
  });
}

function resolveProcedurePriceCents(procedure, locationId) {
  const locationPrices = Array.isArray(procedure?.locationPrices)
    ? procedure.locationPrices
    : [];
  const locationOverride = locationPrices.find(
    (item) => String(item?.location) === String(locationId)
  );
  if (locationOverride) {
    return Number(locationOverride.priceCents || 0);
  }
  return Number(procedure?.defaultPriceCents || 0);
}

function formatCentsToBrl(cents) {
  return BRL_FORMATTER.format((Number(cents || 0) || 0) / 100);
}

async function resolveAppointmentTemplate(procedure) {
  if (procedure?.appointmentConfirmationTemplate?.trim()) {
    return procedure.appointmentConfirmationTemplate.trim();
  }
  const globalTemplate = await MessageTemplate.findOne({
    key: CONSULTATION_REMINDER_KEY,
    enabled: true,
  }).lean();
  if (globalTemplate?.content) {
    return String(globalTemplate.content);
  }
  return DEFAULT_APPOINTMENT_TEMPLATE;
}

async function buildAppointmentMessage(payload) {
  const [procedure, location, patient] = await Promise.all([
    ProcedureType.findById(payload.procedureType),
    ClinicLocation.findById(payload.location),
    Patient.findById(payload.patient),
  ]);

  if (!procedure || !location) {
    throw new NotFoundError("Endereco ou procedimento nao encontrado");
  }
  if (!patient) {
    throw new NotFoundError("Paciente nao encontrado");
  }

  const procedurePriceCents = resolveProcedurePriceCents(
    procedure,
    location?._id || payload.location
  );

  const context = {
    patientName: patient.fullName || "",
    appointmentDate: formatDisplayDate(payload.startsAt),
    appointmentTime: formatDisplayTime(payload.startsAt),
    appointmentDateTime: `${formatDisplayDate(payload.startsAt)} - ${formatDisplayTime(
      payload.startsAt
    )}`,
    locationName: location.name || "",
    locationAddress: buildLocationAddress(location),
    procedureName: procedure.name || "",
    procedurePrice: formatCentsToBrl(procedurePriceCents),
    procedurePriceBrl: formatCentsToBrl(procedurePriceCents),
    preparationInfoUrl: procedure.preparationInfoUrl || "",
    notes: payload.notes || "",
  };
  const template = await resolveAppointmentTemplate(procedure);
  const message = renderTemplate(template, context);

  return {
    patient,
    location,
    procedure,
    context,
    template,
    message,
    canSend: Boolean(procedure.appointmentConfirmationEnabled),
  };
}

function buildAgendaConfirmationMessage({ appointment, patient, procedure, location }) {
  const locationName = location?.name || "a clinica";
  const procedureName = procedure?.name || "seu procedimento";
  const startsAt = appointment?.startsAt;
  return [
    "Confirmacao de agenda",
    "",
    `Ola ${patient?.fullName || "paciente"},`,
    `seu agendamento de ${procedureName} em ${formatDisplayDate(startsAt)} as ${formatDisplayTime(
      startsAt
    )} foi confirmado.`,
    `Local: ${locationName}.`,
  ].join("\n");
}

const createAppointment = asyncHandler(async (req, res) => {
  const payload = appointmentSchema.parse(req.body);
  const confirmMessage = confirmMessageSchema.parse(req.body.confirmMessage);
  assertLocationAllowedForReception(req.user, payload.location);
  if (payload.endsAt <= payload.startsAt) {
    throw new AppError("Fim deve ser maior que inicio", 400);
  }

  await ensureNoOverlap(payload);
  const calculatedPriceCents = await calculatePrice(payload.location, payload.procedureType);

  const appointment = await Appointment.create({
    ...payload,
    calculatedPriceCents,
    notificationPreviewMessage: confirmMessage?.text || "",
    notificationDecision: confirmMessage?.action || "skip",
    notificationChannel: confirmMessage?.action === "send" ? "whatsapp" : "",
    notificationStatus: confirmMessage?.action === "send" ? "pending" : "skipped",
    notificationSentAt: null,
  });

  const populated = await Appointment.findById(appointment._id).populate([
    "patient",
    "location",
    "procedureType",
  ]);

  // Integracao com Google Calendar e notificacoes ficam "best effort".
  try {
    const googleTokens = await getValidGoogleTokensForUser(req.user);
    if (!googleTokens) {
      throw new Error("google_not_connected");
    }
    const event = await createCalendarEvent({
      tokens: googleTokens,
      appointment: populated,
      patient: populated.patient,
      procedure: populated.procedureType,
      location: populated.location,
    });

    if (event?.id) {
      appointment.googleEventId = event.id;
      await appointment.save();
    }
  } catch (_err) {
    // Nao interrompe fluxo de atendimento
  }

  if (confirmMessage?.action === "send" && confirmMessage?.text) {
    try {
      const [patient, procedure] = await Promise.all([
        Patient.findById(payload.patient),
        ProcedureType.findById(payload.procedureType),
      ]);
      if (patient?.phone && procedure?.appointmentConfirmationEnabled) {
        const sent = await sendWhatsappNotification({
          phone: patient.phone,
          text: confirmMessage.text,
        }).catch(() => false);
        if (sent) {
          appointment.notificationSentAt = new Date();
          appointment.notificationStatus = "sent";
        } else {
          appointment.notificationStatus = "failed";
        }
      } else {
        appointment.notificationStatus = "skipped";
      }
      await appointment.save();
    } catch (_err) {
      appointment.notificationStatus = "failed";
      await appointment.save();
    }
  }

  res.status(201).json({ appointment: populated });
});

const previewAppointmentMessage = asyncHandler(async (req, res) => {
  const payload = appointmentSchema.parse(req.body);
  assertLocationAllowedForReception(req.user, payload.location);
  const preview = await buildAppointmentMessage(payload);

  res.json({
    canSend: preview.canSend,
    message: preview.message,
    template: preview.template,
    context: preview.context,
  });
});

const listAppointments = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.from || req.query.to) {
    query.startsAt = {};
    if (req.query.from) query.startsAt.$gte = new Date(req.query.from);
    if (req.query.to) query.startsAt.$lte = new Date(req.query.to);
  }
  if (req.query.patient) query.patient = req.query.patient;
  if (req.query.status) query.status = req.query.status;

  const allowed = normalizedAllowedLocationIds(req.user);
  if (allowed !== null) {
    if (req.query.location) {
      const loc = String(req.query.location);
      if (!allowed.includes(loc)) {
        throw new ForbiddenError("Sem permissao para este endereco");
      }
      query.location = loc;
    } else {
      query.location =
        allowed.length === 0
          ? { $in: [] }
          : { $in: allowed.map((id) => new mongoose.Types.ObjectId(id)) };
    }
  } else if (req.query.location) {
    query.location = req.query.location;
  }

  const appointments = await Appointment.find(query)
    .sort({ startsAt: 1 })
    .populate(["patient", "location", "procedureType"]);
  res.json({ appointments });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const payload = updateSchema.parse(req.body);
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) {
    throw new NotFoundError("Agendamento nao encontrado");
  }

  assertLocationAllowedForReception(req.user, appointment.location);

  const nextStartsAt = payload.startsAt || appointment.startsAt;
  const nextEndsAt = payload.endsAt || appointment.endsAt;
  const nextLocation = payload.location || appointment.location.toString();
  assertLocationAllowedForReception(req.user, nextLocation);
  if (nextEndsAt <= nextStartsAt) {
    throw new AppError("Fim deve ser maior que inicio", 400);
  }

  await ensureNoOverlap(
    { startsAt: nextStartsAt, endsAt: nextEndsAt, location: nextLocation },
    appointment._id
  );

  Object.assign(appointment, payload);

  if (payload.location || payload.procedureType) {
    appointment.calculatedPriceCents = await calculatePrice(
      appointment.location,
      appointment.procedureType
    );
  }

  await appointment.save();

  const populated = await Appointment.findById(appointment._id).populate([
    "patient",
    "location",
    "procedureType",
  ]);

  try {
    const googleTokens = await getValidGoogleTokensForUser(req.user);
    if (googleTokens) {
      if (appointment.googleEventId) {
        await updateCalendarEvent({
          tokens: googleTokens,
          eventId: appointment.googleEventId,
          appointment: populated,
          patient: populated.patient,
          procedure: populated.procedureType,
          location: populated.location,
        });
      } else {
        const event = await createCalendarEvent({
          tokens: googleTokens,
          appointment: populated,
          patient: populated.patient,
          procedure: populated.procedureType,
          location: populated.location,
        });
        if (event?.id) {
          appointment.googleEventId = event.id;
          await appointment.save();
        }
      }
    }
  } catch (_err) {
    // Nao interrompe fluxo de atendimento
  }

  res.json({ appointment: populated });
});

const resendAppointmentTemplateMessage = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id).populate([
    "patient",
    "location",
    "procedureType",
  ]);
  if (!appointment) {
    throw new NotFoundError("Agendamento nao encontrado");
  }
  assertLocationAllowedForReception(req.user, appointment.location?._id || appointment.location);

  const payload = {
    patient: appointment.patient?._id || appointment.patient,
    location: appointment.location?._id || appointment.location,
    procedureType: appointment.procedureType?._id || appointment.procedureType,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    notes: appointment.notes || "",
  };
  const preview = await buildAppointmentMessage(payload);
  if (!preview.patient?.phone) {
    throw new AppError("Paciente sem telefone para envio de mensagem.", 400);
  }
  if (!preview.canSend) {
    throw new AppError("Envio de template desativado para este procedimento.", 400);
  }

  const sent = await sendWhatsappNotification({
    phone: preview.patient.phone,
    text: preview.message,
  }).catch(() => false);

  appointment.notificationPreviewMessage = preview.message;
  appointment.notificationDecision = "resend_template";
  appointment.notificationChannel = "whatsapp";
  appointment.notificationStatus = sent ? "sent" : "failed";
  if (sent) {
    appointment.notificationSentAt = new Date();
  }
  await appointment.save();

  if (!sent) {
    return res.status(503).json({
      sent: false,
      message:
        "Nao foi possivel reenviar o template agora. Verifique a conexao do WhatsApp.",
    });
  }

  return res.json({
    sent: true,
    message: "Template de agendamento reenviado com sucesso.",
  });
});

const sendAgendaConfirmationMessage = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id).populate([
    "patient",
    "location",
    "procedureType",
  ]);
  if (!appointment) {
    throw new NotFoundError("Agendamento nao encontrado");
  }
  assertLocationAllowedForReception(req.user, appointment.location?._id || appointment.location);

  if (!appointment.patient?.phone) {
    throw new AppError("Paciente sem telefone para envio de confirmacao.", 400);
  }

  const confirmationMessage = buildAgendaConfirmationMessage({
    appointment,
    patient: appointment.patient,
    procedure: appointment.procedureType,
    location: appointment.location,
  });
  const sent = await sendWhatsappNotification({
    phone: appointment.patient.phone,
    text: confirmationMessage,
  }).catch(() => false);

  appointment.notificationPreviewMessage = confirmationMessage;
  appointment.notificationDecision = "agenda_confirmation";
  appointment.notificationChannel = "whatsapp";
  appointment.notificationStatus = sent ? "sent" : "failed";
  if (sent) {
    appointment.notificationSentAt = new Date();
    appointment.status = "confirmed";
  }
  await appointment.save();

  if (!sent) {
    return res.status(503).json({
      sent: false,
      message:
        "Nao foi possivel enviar a confirmacao da agenda agora. Verifique a conexao do WhatsApp.",
    });
  }

  return res.json({
    sent: true,
    message: "Mensagem de confirmacao enviada e agendamento confirmado.",
    appointment,
  });
});

const deleteAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) {
    throw new NotFoundError("Agendamento nao encontrado");
  }

  assertLocationAllowedForReception(req.user, appointment.location);

  await appointment.deleteOne();
  res.status(204).send();
});

module.exports = {
  createAppointment,
  previewAppointmentMessage,
  listAppointments,
  updateAppointment,
  resendAppointmentTemplateMessage,
  sendAgendaConfirmationMessage,
  deleteAppointment,
};
