import type { Prisma } from "@prisma/client";
import { dateOnlyToYmd, resolvePeriod, ymdToDate } from "@/lib/dates";
import { forUser, prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";

const postedSelect = {
  occurredOn: true,
  amountCents: true,
  categoryId: true,
  merchantId: true,
  entityId: true,
  taxTag: true,
  paymentMethodId: true,
  essential: true,
  category: { select: { name: true } },
  merchant: { select: { name: true } },
  entity: { select: { name: true } },
  paymentMethod: { select: { name: true } },
} satisfies Prisma.ExpenseSelect;

export async function getSummary(userId: string, input: { period?: string; from?: string; to?: string; groupBy?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("That account doesn't exist.");
  const range = resolvePeriod(input, user.timezone);
  const previous = resolvePeriod({ from: range.previousFrom, to: range.previousTo }, user.timezone);
  const db = forUser(userId);
  const where = {
    status: "POSTED" as const,
    occurredOn: { gte: ymdToDate(range.from), lte: ymdToDate(range.to) },
  };
  const previousWhere = {
    status: "POSTED" as const,
    occurredOn: { gte: ymdToDate(range.previousFrom), lte: ymdToDate(range.previousTo) },
  };
  const [rows, previousRows, pending] = await Promise.all([
    db.expense.findMany({ where, select: postedSelect }),
    db.expense.findMany({ where: previousWhere, select: { amountCents: true } }),
    db.expense.findMany({
      where: { status: "PENDING_CONFIRM", occurredOn: { gte: ymdToDate(range.from), lte: ymdToDate(range.to) } },
      select: { id: true, description: true, amountCents: true, occurredOn: true },
    }),
  ]);
  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const previousTotalCents = previousRows.reduce((sum, row) => sum + row.amountCents, 0);
  const deltaPercent = previousTotalCents === 0 ? null : Math.round(((totalCents - previousTotalCents) / Math.abs(previousTotalCents)) * 1000) / 10;
  const groupBy = input.groupBy || "category";
  const groups = new Map<string, { label: string; totalCents: number; count: number }>();
  for (const row of rows) {
    let key = "none";
    let label = "None";
    if (groupBy === "merchant") {
      key = row.merchantId ?? "none";
      label = row.merchant?.name ?? "No merchant";
    } else if (groupBy === "entity") {
      key = row.entityId;
      label = row.entity?.name ?? "Entity";
    } else if (groupBy === "taxTag") {
      key = row.taxTag;
      label = row.taxTag;
    } else if (groupBy === "paymentMethod") {
      key = row.paymentMethodId ?? "none";
      label = row.paymentMethod?.name ?? "No payment method";
    } else if (groupBy === "month") {
      key = dateOnlyToYmd(row.occurredOn).slice(0, 7);
      label = key;
    } else {
      key = row.categoryId;
      label = row.category?.name ?? "Category";
    }
    const current = groups.get(key) ?? { label, totalCents: 0, count: 0 };
    current.totalCents += row.amountCents;
    current.count += 1;
    groups.set(key, current);
  }
  const essentialCents = rows.filter((row) => row.essential === true).reduce((sum, row) => sum + row.amountCents, 0);
  const discretionaryCents = rows.filter((row) => row.essential === false).reduce((sum, row) => sum + row.amountCents, 0);
  const untaggedCents = totalCents - essentialCents - discretionaryCents;
  return {
    period: { key: range.key, label: range.label, from: range.from, to: range.to },
    previousPeriod: { label: previous.label, from: range.previousFrom, to: range.previousTo },
    totalCents,
    totalFormatted: formatMoney(totalCents, user.currency),
    count: rows.length,
    previousTotalCents,
    previousTotalFormatted: formatMoney(previousTotalCents, user.currency),
    deltaPercent,
    currency: user.currency,
    essentialCents,
    discretionaryCents,
    untaggedCents,
    groups: [...groups.entries()]
      .map(([key, value]) => ({
        key,
        label: value.label,
        totalCents: value.totalCents,
        totalFormatted: formatMoney(value.totalCents, user.currency),
        count: value.count,
      }))
      .sort((a, b) => b.totalCents - a.totalCents),
    pending: pending.map((row) => ({
      id: row.id,
      name: row.description,
      occurredOn: dateOnlyToYmd(row.occurredOn),
      totalCents: row.amountCents,
      totalFormatted: formatMoney(row.amountCents, user.currency),
    })),
  };
}
