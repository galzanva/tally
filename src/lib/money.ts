export function parseDollarsToCents(input: number | string): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Amount should be a number of dollars, like 23.40.");
    const cents = Math.round(input * 100);
    if (Math.abs(input * 100 - cents) > 0.000001) {
      throw new Error("Amount should be a number of dollars, like 23.40.");
    }
    return cents;
  }

  const cleaned = input.trim().replace(/[$,\s]/g, "");
  const match = cleaned.match(/^(-)?(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Amount should be a number of dollars, like 23.40.");
  const sign = match[1] ? -1 : 1;
  const dollars = Number(match[2]);
  const fraction = (match[3] ?? "").padEnd(2, "0");
  return sign * (dollars * 100 + Number(fraction));
}

export function formatMoney(cents: number, currency = "USD") {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return cents < 0 ? `+${formatted}` : formatted;
}

export function dollarsNumber(cents: number) {
  return cents / 100;
}
