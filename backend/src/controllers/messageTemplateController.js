const { z } = require("zod");
const { MessageTemplate } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");

const CONSULTATION_REMINDER_KEY = "consultation_reminder_1_day_before";

const DEFAULT_CONSULTATION_REMINDER = `Confirmado agendamento

Agendamento: {{appointmentDate}} - {{appointmentTime}}
{{locationName}} - {{procedureName}}
{{locationAddress}}

As informacoes de preparo e orientacoes sobre o exame podem ser encontradas nesse link:

{{preparationInfoUrl}}

A nao realizacao correta do preparo, conforme orientado, pode acarretar a nao
realizacao do exame.`;

const upsertTemplatesSchema = z.object({
  consultationReminder1Day: z.string().min(1),
});

const responseTemplateSchema = z.object({
  key: z.string(),
  title: z.string(),
  channel: z.enum(["whatsapp", "email", "sms", "system"]),
  enabled: z.boolean(),
  content: z.string(),
});

async function ensureDefaultTemplates() {
  await MessageTemplate.findOneAndUpdate(
    { key: CONSULTATION_REMINDER_KEY },
    {
      $setOnInsert: {
        key: CONSULTATION_REMINDER_KEY,
        title: "Mensagem de confirmacao de consulta 1 dia antes",
        channel: "whatsapp",
        enabled: true,
        content: DEFAULT_CONSULTATION_REMINDER,
      },
    },
    { upsert: true, new: true }
  );
}

function mapTemplatesResponse(byKey) {
  const consultationReminder1Day = byKey.get(CONSULTATION_REMINDER_KEY);
  return {
    consultationReminder1Day: responseTemplateSchema.parse(
      consultationReminder1Day || {
        key: CONSULTATION_REMINDER_KEY,
        title: "Mensagem de confirmacao de consulta 1 dia antes",
        channel: "whatsapp",
        enabled: true,
        content: DEFAULT_CONSULTATION_REMINDER,
      }
    ),
  };
}

const listMessageTemplates = asyncHandler(async (_req, res) => {
  await ensureDefaultTemplates();
  const templates = await MessageTemplate.find({
    key: { $in: [CONSULTATION_REMINDER_KEY] },
  }).lean();
  const byKey = new Map(templates.map((template) => [template.key, template]));
  return res.json({ templates: mapTemplatesResponse(byKey) });
});

const upsertMessageTemplates = asyncHandler(async (req, res) => {
  const payload = upsertTemplatesSchema.parse(req.body);

  await MessageTemplate.findOneAndUpdate(
    { key: CONSULTATION_REMINDER_KEY },
    {
      $set: {
        key: CONSULTATION_REMINDER_KEY,
        title: "Mensagem de confirmacao de consulta 1 dia antes",
        channel: "whatsapp",
        enabled: true,
        content: payload.consultationReminder1Day,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  const templates = await MessageTemplate.find({
    key: { $in: [CONSULTATION_REMINDER_KEY] },
  }).lean();
  const byKey = new Map(templates.map((template) => [template.key, template]));
  return res.json({ templates: mapTemplatesResponse(byKey) });
});

module.exports = {
  CONSULTATION_REMINDER_KEY,
  DEFAULT_CONSULTATION_REMINDER,
  listMessageTemplates,
  upsertMessageTemplates,
};
