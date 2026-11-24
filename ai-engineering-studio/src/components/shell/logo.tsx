import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6EBEEB" />
          <stop offset="1" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#0B1F3A" stroke="url(#lg-a)" strokeOpacity="0.6" />
      <path d="M20 8.5 30 14.25v11.5L20 31.5 10 25.75v-11.5Z" fill="none" stroke="url(#lg-a)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="3.4" fill="#2DD4BF" />
      <path d="M20 8.5V16.6M30 25.75l-7-4.05M10 25.75l7-4.05" stroke="#6EBEEB" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <div className="leading-tight">
          <p className="text-[15px] font-bold tracking-tight text-white">AI Engineering</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-turq-300">Studio</p>
        </div>
      )}
    </div>
  );
}
