const { z } = require("zod");
const {
  Appointment,
  ClinicLocation,
  ProcedureType,
  Patient,
} = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError, NotFoundError } = require("../utils/errors");
const {
  createCalendarEvent,
  updateCalendarEvent,
} = require("../services/googleCalendarService");
const { sendAppointmentNotification } = require("../services/notificationService");

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

const createAppointment = asyncHandler(async (req, res) => {
  const payload = appointmentSchema.parse(req.body);
  if (payload.endsAt <= payload.startsAt) {
    throw new AppError("Fim deve ser maior que inicio", 400);
  }

  await ensureNoOverlap(payload);
  const calculatedPriceCents = await calculatePrice(payload.location, payload.procedureType);

  const appointment = await Appointment.create({
    ...payload,
    calculatedPriceCents,
  });

  const populated = await Appointment.findById(appointment._id).populate([
    "patient",
    "location",
    "procedureType",
  ]);

  // Integracao com Google Calendar e notificacoes ficam "best effort".
  try {
    const event = await createCalendarEvent({
      tokens: req.body.googleTokens || null,
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

  try {
    const patient = await Patient.findById(payload.patient);
    if (patient) {
      await sendAppointmentNotification({ patient, appointment: populated });
    }
  } catch (_err) {
    // Nao interrompe fluxo
  }

  res.status(201).json({ appointment: populated });
});

const listAppointments = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.from || req.query.to) {
    query.startsAt = {};
    if (req.query.from) query.startsAt.$gte = new Date(req.query.from);
    if (req.query.to) query.startsAt.$lte = new Date(req.query.to);
  }
  if (req.query.location) query.location = req.query.location;
  if (req.query.patient) query.patient = req.query.patient;
  if (req.query.status) query.status = req.query.status;

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

  const nextStartsAt = payload.startsAt || appointment.startsAt;
  const nextEndsAt = payload.endsAt || appointment.endsAt;
  const nextLocation = payload.location || appointment.location.toString();
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
    const googleTokens = req.body.googleTokens || null;
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

const deleteAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) {
    throw new NotFoundError("Agendamento nao encontrado");
  }

  await appointment.deleteOne();
  res.status(204).send();
});

module.exports = {
  createAppointment,
  listAppointments,
  updateAppointment,
  deleteAppointment,
};
