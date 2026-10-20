export const SCOPE_OPTIONS = [
  { value: "patients:read", label: "Pacientes: consultar" },
  { value: "patients:write", label: "Pacientes: cadastrar e editar" },
  { value: "patients:delete", label: "Pacientes: excluir" },
  { value: "appointments:read", label: "Agenda: consultar" },
  { value: "appointments:write", label: "Agenda: criar, remarcar e cancelar" },
  { value: "appointments:delete", label: "Agenda: excluir agendamentos" },
  { value: "appointments:notify", label: "Agenda: enviar confirmacao por WhatsApp" },
  { value: "catalog:read", label: "Enderecos e procedimentos: consultar" },
];

export const AGENT_SCOPES = [
  "patients:read",
  "patients:write",
  "appointments:read",
  "appointments:write",
  "catalog:read",
];

export const EXPIRATION_OPTIONS = [
  { value: "", label: "Sem expiracao" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "180", label: "180 dias" },
  { value: "365", label: "1 ano" },
];

export function apiKeyStatus(apiKey, now = new Date()) {
  if (apiKey.revokedAt) return "revoked";
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) <= now) return "expired";
  return "active";
}

export const STATUS_LABELS = {
  active: "Ativa",
  revoked: "Revogada",
  expired: "Expirada",
};
