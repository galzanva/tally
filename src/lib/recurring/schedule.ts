import { dateOnlyToYmd, daysInMonth, padYmd, ymdToDate } from "@/lib/dates";

export type FrequencyName = "MONTHLY" | "YEARLY";

export function scheduledYmd(year: number, month: number, dayOfMonth: number) {
  const day = Math.min(Math.max(dayOfMonth, 1), daysInMonth(year, month));
  return padYmd(year, month, day);
}

export function advanceRun(currentYmd: string, frequency: FrequencyName, dayOfMonth: number, monthOfYear?: number | null) {
  const [year, month] = currentYmd.split("-").map(Number);
  if (frequency === "YEARLY") {
    return scheduledYmd(year! + 1, monthOfYear ?? month!, dayOfMonth);
  }
  const next = new Date(Date.UTC(year!, month!, 1));
  return scheduledYmd(next.getUTCFullYear(), next.getUTCMonth() + 1, dayOfMonth);
}

export function firstRunOn(startOn: string, frequency: FrequencyName, dayOfMonth: number, monthOfYear?: number | null) {
  const [year, month] = startOn.split("-").map(Number);
  if (frequency === "YEARLY") {
    const targetMonth = monthOfYear ?? month!;
    let candidate = scheduledYmd(year!, targetMonth, dayOfMonth);
    if (candidate < startOn) candidate = scheduledYmd(year! + 1, targetMonth, dayOfMonth);
    return candidate;
  }
  let candidate = scheduledYmd(year!, month!, dayOfMonth);
  if (candidate < startOn) candidate = advanceRun(candidate, "MONTHLY", dayOfMonth, null);
  return candidate;
}

export function periodKeyFor(frequency: FrequencyName, ymd: string) {
  return frequency === "YEARLY" ? ymd.slice(0, 4) : ymd.slice(0, 7);
}

export function rateForDate<T extends { amountCents: number; effectiveFrom: string }>(rates: T[], ymd: string) {
  let best: T | null = null;
  for (const rate of rates) {
    if (rate.effectiveFrom <= ymd && (!best || rate.effectiveFrom > best.effectiveFrom)) best = rate;
  }
  return best;
}

export function dateOnlyRate<T extends { amountCents: number; effectiveFrom: Date }>(rates: T[], ymd: string) {
  return rateForDate(
    rates.map((rate) => ({ ...rate, effectiveFrom: dateOnlyToYmd(rate.effectiveFrom) })),
    ymd,
  );
}

export function assertDayOfMonth(day: number) {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("Pick a day of the month from 1 to 31.");
}

export function asDate(ymd: string) {
  return ymdToDate(ymd);
}
