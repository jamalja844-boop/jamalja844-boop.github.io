import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const nf = new Intl.NumberFormat("nl-NL");
export const formatNumber = (n: number | null | undefined) => (n === null || n === undefined ? "–" : nf.format(n));

export function formatUsd(n: number | string | null | undefined, digits = 4): string {
  if (n === null || n === undefined || n === "") return "onbekend";
  const v = Number(n);
  if (!Number.isFinite(v)) return "onbekend";
  return `$${v.toLocaleString("nl-NL", { minimumFractionDigits: v < 1 ? Math.min(digits, 4) : 2, maximumFractionDigits: v < 1 ? digits : 2 })}`;
}

export function formatDate(d: string | Date | null | undefined, withTime = true): string {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Amsterdam",
  });
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 45) return "zojuist";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min geleden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} uur geleden`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} dag${days === 1 ? "" : "en"} geleden`;
  return formatDate(date, false);
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export type Serialized<T> = T extends Date
  ? string
  : T extends bigint
    ? number
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

/** Zet Date/BigInt om naar JSON-veilige waarden voor client components. */
export function serialize<T>(value: T): Serialized<T> {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}
