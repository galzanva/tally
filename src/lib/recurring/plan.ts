import { advanceRun, type FrequencyName } from "@/lib/recurring/schedule";

export type RecurringCharge = {
  occurredOn: string;
  amountCents: number;
  description: string;
  merchantName: string;
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  entityId: string;
  entityName: string;
  paymentMethodId: string | null;
  essential: boolean | null;
};

export type RecurringPlan = {
  name: string;
  merchantKey: string;
  merchantName: string;
  categoryId: string;
  entityId: string;
  paymentMethodId: string | null;
  essential: boolean | null;
  frequency: FrequencyName;
  dayOfMonth: number;
  monthOfYear: number | null;
  amountType: "FIXED" | "VARIABLE";
  status: "ACTIVE" | "ENDED";
  startOn: string;
  endOn: string | null;
  nextRunOn: string;
  rates: { amountCents: number; effectiveFrom: string }[];
};

type Spec = {
  name: string;
  frequency: FrequencyName;
  amountType: "FIXED" | "VARIABLE";
  status: "ACTIVE" | "ENDED";
  keepAll: boolean;
  match: (charge: RecurringCharge) => boolean;
};

function text(charge: RecurringCharge) {
  return `${charge.merchantKey} ${charge.merchantName} ${charge.description}`.toLowerCase();
}

const CATALOG: Spec[] = [
  { name: "Netflix", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey === "netflix" },
  { name: "YouTube Premium", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.includes("youtube") },
  { name: "Cursor", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey === "cursor" },
  { name: "Anthropic", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.includes("anthropic") && !/token|one-time|one time/.test(c.description) },
  { name: "Paramount+", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.startsWith("paramount") },
  { name: "Peacock", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.startsWith("peacock") },
  { name: "Tesla lease", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey === "tesla finance" || /\blease\b/i.test(c.description) },
  { name: "Tesla connectivity", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey === "tesla" && (c.amountCents === 999 || /connectivity|subscription|internet/i.test(c.description)) },
  { name: "Sling TV", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey === "sling" || c.merchantKey.startsWith("sling") },
  { name: "Webull Level 2", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.startsWith("webull") },
  { name: "DigitalOcean", frequency: "MONTHLY", amountType: "VARIABLE", status: "ACTIVE", keepAll: true, match: (c) => c.merchantKey.startsWith("digitalocean") },
  { name: "Cox Communications", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.startsWith("cox") },
  { name: "Boost Mobile", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.startsWith("boost") },
  { name: "Audible", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.startsWith("audible") },
  { name: "ESPN", frequency: "MONTHLY", amountType: "FIXED", status: "ENDED", keepAll: false, match: (c) => c.merchantKey === "espn" },
  { name: "Polygon.io", frequency: "MONTHLY", amountType: "FIXED", status: "ENDED", keepAll: false, match: (c) => c.merchantKey.startsWith("polygon") },
  { name: "ChatGPT", frequency: "MONTHLY", amountType: "FIXED", status: "ENDED", keepAll: false, match: (c) => c.merchantKey.includes("openai") && /chatgpt/i.test(c.description) },
  { name: "AT&T", frequency: "MONTHLY", amountType: "FIXED", status: "ENDED", keepAll: false, match: (c) => c.merchantKey === "att" || c.merchantKey.startsWith("at t") },
  { name: "GoDaddy", frequency: "MONTHLY", amountType: "FIXED", status: "ENDED", keepAll: false, match: (c) => c.merchantKey.startsWith("godaddy") && /hosting/i.test(c.description) },
  { name: "Rent", frequency: "MONTHLY", amountType: "VARIABLE", status: "ACTIVE", keepAll: true, match: (c) => c.merchantKey === "bilt" || c.merchantKey.startsWith("bilt ") },
  { name: "Car insurance", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.startsWith("progressive") },
  { name: "Electricity", frequency: "MONTHLY", amountType: "VARIABLE", status: "ACTIVE", keepAll: true, match: (c) => c.merchantKey === "novec" || c.merchantKey.includes("novec") },
  { name: "Amazon Prime", frequency: "YEARLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey === "amazon prime" || /annual membership/i.test(c.description) },
  { name: "MUTV", frequency: "YEARLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey === "mutv" },
  { name: "Teeth cleaning", frequency: "SEMIANNUAL", amountType: "FIXED", status: "ACTIVE", keepAll: true, match: (c) => c.merchantKey.includes("soft dentistry") && c.amountCents === 10399 },
  { name: "Haircut", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: true, match: (c) => c.merchantKey.includes("vivi") },
  { name: "Upstart loan", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: false, match: (c) => c.merchantKey.startsWith("upstart") },
  { name: "Chiropractor", frequency: "MONTHLY", amountType: "FIXED", status: "ACTIVE", keepAll: true, match: (c) => /chiropract|chiropractor|nova knee/.test(text(c)) },
  { name: "TradeZella", frequency: "MONTHLY", amountType: "FIXED", status: "ENDED", keepAll: false, match: (c) => c.merchantKey.includes("tradezella") },
  { name: "4Life supplements", frequency: "MONTHLY", amountType: "VARIABLE", status: "ACTIVE", keepAll: true, match: (c) => c.merchantKey.includes("4life") },
];

function latestPerMonth(rows: RecurringCharge[]) {
  const byMonth = new Map<string, RecurringCharge>();
  for (const charge of rows) {
    const month = charge.occurredOn.slice(0, 7);
    const current = byMonth.get(month);
    if (!current || charge.occurredOn > current.occurredOn || (charge.occurredOn === current.occurredOn && charge.amountCents > current.amountCents)) {
      byMonth.set(month, charge);
    }
  }
  return [...byMonth.values()];
}

function ratesFrom(rows: RecurringCharge[], keepAll: boolean) {
  const ordered = [...rows].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.amountCents - b.amountCents);
  const picked = keepAll ? ordered : latestPerMonth(ordered);
  const byDate = new Map<string, number>();
  for (const charge of picked) {
    const current = byDate.get(charge.occurredOn);
    if (current == null || charge.amountCents > current) byDate.set(charge.occurredOn, charge.amountCents);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([effectiveFrom, amountCents]) => ({ amountCents, effectiveFrom }));
}

function nextRun(latest: string, day: number, today: string, status: "ACTIVE" | "ENDED", frequency: FrequencyName) {
  if (status === "ENDED") return latest;
  const month = Number(latest.slice(5, 7));
  let next = advanceRun(latest, frequency, day, month);
  while (next <= today) next = advanceRun(next, frequency, day, month);
  return next;
}

function planFrom(spec: Spec, rows: RecurringCharge[], today: string): RecurringPlan {
  const ordered = [...rows].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  const latest = ordered.at(-1)!;
  const first = ordered[0]!;
  const day = Number(latest.occurredOn.slice(8, 10));
  const month = Number(latest.occurredOn.slice(5, 7));
  return {
    name: spec.name,
    merchantKey: latest.merchantKey,
    merchantName: latest.merchantName,
    categoryId: latest.categoryId,
    entityId: latest.entityId,
    paymentMethodId: latest.paymentMethodId,
    essential: latest.essential,
    frequency: spec.frequency,
    dayOfMonth: day,
    monthOfYear: spec.frequency === "MONTHLY" ? null : month,
    amountType: spec.amountType,
    status: spec.status,
    startOn: first.occurredOn,
    endOn: spec.status === "ENDED" ? latest.occurredOn : null,
    nextRunOn: nextRun(latest.occurredOn, day, today, spec.status, spec.frequency),
    rates: ratesFrom(ordered, spec.keepAll),
  };
}

export function planRecurring(charges: RecurringCharge[], today: string): RecurringPlan[] {
  const usable = charges.filter((charge) => charge.amountCents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(charge.occurredOn));
  const claimed = new Set<RecurringCharge>();
  const plans: RecurringPlan[] = [];
  for (const spec of CATALOG) {
    const rows = usable.filter((charge) => !claimed.has(charge) && spec.match(charge));
    if (!rows.length) continue;
    for (const charge of rows) claimed.add(charge);
    plans.push(planFrom(spec, rows, today));
  }
  return plans;
}
