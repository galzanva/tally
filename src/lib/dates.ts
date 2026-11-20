import { TZDate, tz } from "@date-fns/tz";
import { format } from "date-fns";

export function todayYmd(timeZone: string, now = new Date()) {
  return format(now, "yyyy-MM-dd", { in: tz(timeZone) });
}

export function chargeDateInZone(input: string | undefined, timeZone: string, now = new Date()) {
  const today = todayYmd(timeZone, now);
  const given = input?.trim() ?? "";
  if (!given) return { ymd: today, adjustedFrom: null as string | null };
  const utcToday = todayYmd("UTC", now);
  if (given === utcToday && given !== today) return { ymd: today, adjustedFrom: given };
  return { ymd: given, adjustedFrom: null as string | null };
}

export function formatInZone(date: Date, pattern: string, timeZone: string) {
  return format(date, pattern, { in: tz(timeZone) });
}

export function ymdToDate(ymd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error("Dates look like 2026-11-15.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("That date isn't on the calendar.");
  }
  return date;
}

export function dateOnlyToYmd(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function padYmd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDaysYmd(ymd: string, days: number) {
  const date = ymdToDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnlyToYmd(date);
}

export function daysBetween(from: string, to: string) {
  const ms = ymdToDate(to).getTime() - ymdToDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function startOfTodayInstant(timeZone: string) {
  const ymd = todayYmd(timeZone);
  return new TZDate(`${ymd}T00:00:00`, timeZone);
}

export function formatLongDate(ymd: string) {
  return format(ymdToDate(ymd), "MMM d, yyyy", { in: tz("UTC") });
}

export function formatMonthLabel(ymd: string) {
  return format(ymdToDate(ymd), "MMMM yyyy", { in: tz("UTC") });
}

export function formatWeekday(ymd: string) {
  return format(ymdToDate(ymd), "EEEE, MMM d", { in: tz("UTC") });
}

export type PeriodRange = {
  key: string;
  label: string;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
};

function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: padYmd(year, month, 1), to: padYmd(year, month, daysInMonth(year, month)) };
}

function quarterRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return { from: padYmd(year, startMonth, 1), to: padYmd(year, endMonth, daysInMonth(year, endMonth)) };
}

function previousOf(from: string, to: string, kind: "month" | "quarter" | "year" | "span") {
  if (kind === "month") {
    const [year, month] = from.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 2, 1));
    return monthRange(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }
  if (kind === "quarter") {
    const [year, month] = from.split("-").map(Number);
    const quarter = Math.floor((month! - 1) / 3) + 1;
    const prevQuarter = quarter === 1 ? 4 : quarter - 1;
    const prevYear = quarter === 1 ? year! - 1 : year!;
    return quarterRange(prevYear, prevQuarter);
  }
  if (kind === "year") {
    const year = Number(from.slice(0, 4)) - 1;
    return { from: padYmd(year, 1, 1), to: padYmd(year, 12, 31) };
  }
  const length = daysBetween(from, to) + 1;
  return { from: addDaysYmd(from, -length), to: addDaysYmd(to, -length) };
}

export function resolvePeriod(
  input: { period?: string; from?: string; to?: string },
  timeZone: string,
): PeriodRange {
  const today = todayYmd(timeZone);
  const [year, month] = today.split("-").map(Number);
  const period = input.period?.trim();

  if (input.from || input.to || period === "custom") {
    const from = input.from ?? padYmd(year!, month!, 1);
    const to = input.to ?? today;
    if (from > to) throw new Error("The start date needs to be on or before the end date.");
    const previous = previousOf(from, to, "span");
    return { key: "custom", label: `${formatLongDate(from)} – ${formatLongDate(to)}`, from, to, previousFrom: previous.from, previousTo: previous.to };
  }

  const named = period || "this_month";
  if (named === "this_month" || named === "last_month") {
    const base = named === "this_month" ? { y: year!, m: month! } : (() => {
      const date = new Date(Date.UTC(year!, month! - 2, 1));
      return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1 };
    })();
    const current = monthRange(base.y, base.m);
    const previous = previousOf(current.from, current.to, "month");
    return { key: named, label: formatMonthLabel(current.from), ...current, previousFrom: previous.from, previousTo: previous.to };
  }

  if (named === "this_quarter" || named === "last_quarter") {
    const quarter = Math.floor((month! - 1) / 3) + 1;
    const currentQuarter = named === "this_quarter" ? quarter : quarter === 1 ? 4 : quarter - 1;
    const currentYear = named === "this_quarter" ? year! : quarter === 1 ? year! - 1 : year!;
    const current = quarterRange(currentYear, currentQuarter);
    const previous = previousOf(current.from, current.to, "quarter");
    return {
      key: named,
      label: `Q${currentQuarter} ${currentYear}`,
      ...current,
      previousFrom: previous.from,
      previousTo: previous.to,
    };
  }

  if (named === "ytd") {
    const from = padYmd(year!, 1, 1);
    const previousFrom = padYmd(year! - 1, 1, 1);
    const previousTo = addDaysYmd(today, -daysBetween(padYmd(year! - 1, 1, 1), from));
    const lastYearSameDay = padYmd(year! - 1, month!, Math.min(Number(today.slice(8)), daysInMonth(year! - 1, month!)));
    return {
      key: "ytd",
      label: `Year to date ${year}`,
      from,
      to: today,
      previousFrom,
      previousTo: lastYearSameDay,
    };
  }

  if (named === "last_year") {
    const current = { from: padYmd(year! - 1, 1, 1), to: padYmd(year! - 1, 12, 31) };
    const previous = { from: padYmd(year! - 2, 1, 1), to: padYmd(year! - 2, 12, 31) };
    return { key: "last_year", label: String(year! - 1), ...current, previousFrom: previous.from, previousTo: previous.to };
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(named);
  if (monthMatch) {
    const current = monthRange(Number(monthMatch[1]), Number(monthMatch[2]));
    const previous = previousOf(current.from, current.to, "month");
    return { key: named, label: formatMonthLabel(current.from), ...current, previousFrom: previous.from, previousTo: previous.to };
  }

  const quarterMatch = /^(\d{4})-Q([1-4])$/i.exec(named);
  if (quarterMatch) {
    const current = quarterRange(Number(quarterMatch[1]), Number(quarterMatch[2]));
    const previous = previousOf(current.from, current.to, "quarter");
    return {
      key: `${quarterMatch[1]}-Q${quarterMatch[2]}`,
      label: `Q${quarterMatch[2]} ${quarterMatch[1]}`,
      ...current,
      previousFrom: previous.from,
      previousTo: previous.to,
    };
  }

  if (/^\d{4}$/.test(named)) {
    const y = Number(named);
    const current = { from: padYmd(y, 1, 1), to: padYmd(y, 12, 31) };
    const previous = { from: padYmd(y - 1, 1, 1), to: padYmd(y - 1, 12, 31) };
    return { key: named, label: named, ...current, previousFrom: previous.from, previousTo: previous.to };
  }

  if (named === "all") {
    return {
      key: "all",
      label: "All time",
      from: "2000-01-01",
      to: "2100-01-01",
      previousFrom: "1999-01-01",
      previousTo: "1999-12-31",
    };
  }

  throw new Error("Use a period like this_month, last_month, 2026-10, 2026-Q3, or 2026.");
}

export function monthKey(ymd: string) {
  return ymd.slice(0, 7);
}

export function yearKey(ymd: string) {
  return ymd.slice(0, 4);
}

export function lastCompleteMonth(timeZone: string) {
  const today = todayYmd(timeZone);
  const [year, month] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 2, 1));
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return resolvePeriod({ period: key }, timeZone);
}

export function trailingMonths(timeZone: string, count: number) {
  const today = todayYmd(timeZone);
  const [year, month] = today.split("-").map(Number);
  const months: { key: string; label: string; from: string; to: string }[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(Date.UTC(year!, month! - 1 - offset, 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const range = monthRange(y, m);
    months.push({ key: `${y}-${String(m).padStart(2, "0")}`, label: format(ymdToDate(range.from), "MMM", { in: tz("UTC") }), ...range });
  }
  return months;
}
