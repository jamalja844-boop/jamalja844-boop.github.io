import { Bot, Network, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/shell/logo";

export function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="dark grid min-h-dvh bg-navy-950 text-[#e8f0fa] lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between p-12">
        <div className="grid-bg absolute inset-0 opacity-40" />
        <div className="absolute -left-32 top-24 size-[480px] rounded-full bg-brand-sky/20 blur-[120px]" />
        <div className="absolute -bottom-24 right-0 size-[420px] rounded-full bg-turq-400/15 blur-[120px]" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-lg">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Bouw AI-medewerkers die <span className="text-gradient">echt samenwerken</span>.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-navy-200">
            Eén platform voor taalmodellen, prompts, tools, kennisbanken, agents en multi-agent workflows — veilig gescheiden per organisatie.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-navy-100">
            {[
              { icon: Sparkles, text: "LLM Studio met Claude en OpenAI, streaming en kostenregistratie" },
              { icon: Bot, text: "Agents met gecontroleerde cyclus, limieten en logging" },
              { icon: Network, text: "Orchestrator en visuele workflows met goedkeuringen" },
              { icon: ShieldCheck, text: "Row Level Security, versleutelde sleutels en auditlog" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-turq-300">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-navy-300">© {new Date().getFullYear()} AI Engineering Studio</p>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-10 bg-[#071629]">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-navy-200">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
