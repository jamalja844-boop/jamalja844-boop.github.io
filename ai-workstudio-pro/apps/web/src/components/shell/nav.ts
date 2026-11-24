export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badgeKey?: "approvals";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Zijmenu van AI WorkStudio Pro. */
export const NAV: NavGroup[] = [
  {
    label: "Werken",
    items: [
      { href: "/chat", label: "AI Chat", icon: "MessageCircle" },
      { href: "/writing", label: "Schrijfstudio", icon: "FileText" },
      { href: "/code", label: "AI Code", icon: "Code2" },
      { href: "/cowork", label: "Cowork", icon: "Briefcase" },
    ],
  },
  {
    label: "Automatiseren",
    items: [
      { href: "/agents", label: "Agents", icon: "Bot" },
      { href: "/orchestrator", label: "Multi-Agent", icon: "Network" },
      { href: "/workflows", label: "Workflows", icon: "Workflow" },
      { href: "/office", label: "3D AI-kantoor", icon: "Building2" },
    ],
  },
  {
    label: "Kennis & koppelingen",
    items: [
      { href: "/knowledge", label: "Kennisbank", icon: "Library" },
      { href: "/tools", label: "Integraties & tools", icon: "Plug" },
      { href: "/apps", label: "App Builder", icon: "Blocks" },
      { href: "/prompts", label: "Prompt Studio", icon: "ScrollText" },
      { href: "/llm", label: "LLM Studio", icon: "MessagesSquare" },
    ],
  },
  {
    label: "Beheer",
    items: [
      { href: "", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/approvals", label: "Goedkeuringen", icon: "ShieldCheck", badgeKey: "approvals" },
      { href: "/settings", label: "Instellingen", icon: "Settings" },
    ],
  },
];
