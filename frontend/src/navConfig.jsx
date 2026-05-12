import {
  BarChart3,
  Calendar,
  Plug,
  Settings,
  ShieldUser,
  Stethoscope,
  Users,
} from "lucide-react";

export const mainNavItems = [
  { to: "/", label: "Agenda", icon: Calendar, roles: ["admin", "doctor", "assistant", "reception"] },
  {
    to: "/patients",
    label: "Pacientes",
    icon: Users,
    roles: ["admin", "doctor", "assistant", "reception"],
  },
  {
    to: "/encounters",
    label: "Atendimento",
    icon: Stethoscope,
    roles: ["admin", "doctor", "assistant"],
  },
  {
    to: "/reports",
    label: "Relatorios",
    icon: BarChart3,
    roles: ["admin", "doctor", "assistant"],
  },
  {
    to: "/settings",
    label: "Configuracoes",
    icon: Settings,
    roles: ["admin", "doctor", "assistant"],
  },
  {
    to: "/integrations",
    label: "Integracoes",
    icon: Plug,
    roles: ["admin", "doctor", "assistant"],
  },
  {
    to: "/access-profiles",
    label: "Perfis de acesso",
    icon: ShieldUser,
    roles: ["admin"],
  },
];

export function navItemsForRole(role) {
  return mainNavItems.filter((item) => item.roles.includes(role));
}
