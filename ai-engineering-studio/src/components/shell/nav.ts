export interface NavItem {
  href: string;
  label: string;
  icon: string;
  module?: number;
  badgeKey?: "approvals";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Zijmenu: de acht hoofdmodules plus workflows, 3D-kantoor en beheer. */
export const NAV: NavGroup[] = [
  {
    label: "Overzicht",
    items: [{ href: "", label: "Engineering Dashboard", icon: "LayoutDashboard", module: 8 }],
  },
  {
    label: "Bouwen",
    items: [
      { href: "/llm", label: "LLM Studio", icon: "MessagesSquare", module: 1 },
      { href: "/prompts", label: "Prompt Studio", icon: "ScrollText", module: 2 },
      { href: "/apps", label: "App Builder", icon: "Blocks", module: 3 },
      { href: "/agents", label: "Agent Builder", icon: "Bot", module: 6 },
    ],
  },
  {
    label: "Verbinden",
    items: [
      { href: "/tools", label: "Tools & Integraties", icon: "Plug", module: 4 },
      { href: "/knowledge", label: "Kennisbank (RAG)", icon: "Library", module: 5 },
    ],
  },
  {
    label: "Samenwerken",
    items: [
      { href: "/orchestrator", label: "Multi-Agent", icon: "Network", module: 7 },
      { href: "/workflows", label: "Workflows", icon: "Workflow" },
      { href: "/office", label: "3D AI-kantoor", icon: "Building2" },
    ],
  },
  {
    label: "Beheer",
    items: [
      { href: "/approvals", label: "Goedkeuringen", icon: "ShieldCheck", badgeKey: "approvals" },
      { href: "/settings", label: "Instellingen", icon: "Settings" },
    ],
  },
];
