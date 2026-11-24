/**
 * Berekening van het volgende uitvoertijdstip voor geplande taken, in de tijdzone van de
 * gebruiker (standaard Europe/Amsterdam), inclusief zomer-/wintertijd. Zuivere functies.
 */
export type Frequency = "once" | "daily" | "weekdays" | "weekly" | "monthly";

export interface ScheduleSpec {
  frequency: Frequency;
  timeOfDay: string; // "HH:MM"
  weekday?: number | null; // ISO: 1 = maandag … 7 = zondag
  dayOfMonth?: number | null; // 1–31 (korter maand → laatste dag)
  runOnceAt?: Date | null;
  timezone?: string;
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  once: "Eenmalig", daily: "Elke dag", weekdays: "Elke werkdag", weekly: "Elke week", monthly: "Elke maand",
};
export const WEEKDAY_LABEL = ["", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];

function parts(date: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { y: +get("year"), m: +get("month"), d: +get("day"), hh: +get("hour"), mm: +get("minute"), ss: +get("second"), wd };
}

/** Verschil lokale tijd − UTC in minuten op een bepaald moment. */
export function tzOffsetMinutes(date: Date, tz: string) {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Lokale datum + tijd in een tijdzone → UTC-moment. */
export function zonedTime(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - tzOffsetMinutes(new Date(guess), tz) * 60000;
  const off2 = tzOffsetMinutes(new Date(ts), tz);
  ts = guess - off2 * 60000;
  return new Date(ts);
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Eerstvolgende uitvoering strikt ná `after`, of null (eenmalig en verstreken). */
export function nextRunAt(spec: ScheduleSpec, after: Date = new Date()): Date | null {
  const tz = spec.timezone ?? "Europe/Amsterdam";
  if (spec.frequency === "once") return spec.runOnceAt && spec.runOnceAt > after ? spec.runOnceAt : null;
  const [hh, mm] = spec.timeOfDay.split(":").map(Number);
  const start = parts(after, tz);
  for (let i = 0; i < 400; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const wd = ((day.getUTCDay() + 6) % 7) + 1;
    let match = false;
    switch (spec.frequency) {
      case "daily": match = true; break;
      case "weekdays": match = wd <= 5; break;
      case "weekly": match = wd === (spec.weekday ?? 1); break;
      case "monthly": match = d === Math.min(spec.dayOfMonth ?? 1, daysInMonth(y, m)); break;
    }
    if (!match) continue;
    const candidate = zonedTime(y, m, d, hh, mm, tz);
    if (candidate > after) return candidate;
  }
  return null;
}

export function describeSchedule(spec: ScheduleSpec) {
  const t = spec.timeOfDay;
  switch (spec.frequency) {
    case "once": return spec.runOnceAt ? `Eenmalig op ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: spec.timezone ?? "Europe/Amsterdam" }).format(spec.runOnceAt)}` : "Eenmalig";
    case "daily": return `Elke dag om ${t}`;
    case "weekdays": return `Elke werkdag om ${t}`;
    case "weekly": return `Elke ${WEEKDAY_LABEL[spec.weekday ?? 1]} om ${t}`;
    case "monthly": return `Elke maand op dag ${spec.dayOfMonth ?? 1} om ${t}`;
  }
}
