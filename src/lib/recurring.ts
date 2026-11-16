import type { Actor, AmountType, Frequency, Prisma, TaxTag } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { dateOnlyToYmd, todayYmd, ymdToDate } from "@/lib/dates";
import { forUser, isUniqueConflict, prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatMoney, parseDollarsToCents } from "@/lib/money";
import { advanceRun, assertDayOfMonth, dateOnlyRate, firstRunOn, periodKeyFor, rateForDate } from "@/lib/recurring/schedule";
import { canonicalMerchantName, normalizeMerchant } from "@/lib/text";

const include = { rates: { orderBy: { effectiveFrom: "asc" as const } }, merchant: true, category: true, paymentMethod: true, entity: true };

export async function listRecurring(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const items = await db.recurringExpense.findMany({ include, orderBy: { name: "asc" } });
  const today = todayYmd(user.timezone);
  return items.map((item) => serializeRecurring(item, user.currency, today));
}

function serializeRecurring(item: Prisma.RecurringExpenseGetPayload<{ include: typeof include }>, currency: string, today: string) {
  const rate = dateOnlyRate(item.rates, today) ?? dateOnlyRate(item.rates, "9999-12-31");
  return {
    id: item.id,
    name: item.name,
    merchant: item.merchant?.name ?? null,
    merchantId: item.merchantId,
    category: item.category.name,
    categoryId: item.categoryId,
    paymentMethod: item.paymentMethod?.name ?? null,
    paymentMethodId: item.paymentMethodId,
    entity: item.entity.name,
    entityId: item.entityId,
    taxTag: item.taxTag,
    essential: item.essential,
    frequency: item.frequency,
    dayOfMonth: item.dayOfMonth,
    monthOfYear: item.monthOfYear,
    amountType: item.amountType,
    status: item.status,
    startOn: dateOnlyToYmd(item.startOn),
    endOn: item.endOn ? dateOnlyToYmd(item.endOn) : null,
    nextRunOn: dateOnlyToYmd(item.nextRunOn),
    amountCents: rate?.amountCents ?? 0,
    amountFormatted: formatMoney(rate?.amountCents ?? 0, currency),
    rates: item.rates.map((entry) => ({
      id: entry.id,
      amountCents: entry.amountCents,
      amountFormatted: formatMoney(entry.amountCents, currency),
      effectiveFrom: dateOnlyToYmd(entry.effectiveFrom),
    })),
  };
}

export function committedTotals(items: { status: string; frequency: Frequency; amountCents: number }[]) {
  let monthlyCents = 0;
  let yearlyCents = 0;
  for (const item of items) {
    if (item.status !== "ACTIVE") continue;
    if (item.frequency === "MONTHLY") {
      monthlyCents += item.amountCents;
      yearlyCents += item.amountCents * 12;
    } else if (item.frequency === "SEMIANNUAL") {
      yearlyCents += item.amountCents * 2;
      monthlyCents += Math.round(item.amountCents / 6);
    } else {
      yearlyCents += item.amountCents;
      monthlyCents += Math.round(item.amountCents / 12);
    }
  }
  return { monthlyCents, yearlyCents };
}

export async function createRecurring(userId: string, actor: Actor, input: {
  name: string;
  amount: number | string;
  frequency: Frequency;
  dayOfMonth: number;
  monthOfYear?: number | null;
  amountType: AmountType;
  startOn?: string;
  category: string;
  merchant?: string | null;
  paymentMethod?: string | null;
  entity?: string;
  taxTag?: TaxTag;
  essential?: boolean | null;
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  assertDayOfMonth(input.dayOfMonth);
  if (input.frequency === "YEARLY" && (input.monthOfYear == null || input.monthOfYear < 1 || input.monthOfYear > 12)) {
    throw new AppError(400, "validation", "A yearly bill needs a month from 1 to 12.");
  }
  const amountCents = parseDollarsToCents(input.amount);
  const categories = await db.category.findMany({ where: { archivedAt: null } });
  const category = categories.find((item) => item.id === input.category || item.name.toLowerCase() === input.category.toLowerCase());
  if (!category) throw new AppError(400, "validation", "That category isn't on the account.");
  const entities = await db.entity.findMany();
  const entity = input.entity
    ? entities.find((item) => item.id === input.entity || item.name.toLowerCase() === input.entity!.toLowerCase())
    : entities.find((item) => item.isDefault);
  if (!entity) throw new AppError(400, "validation", "Pick an entity.");
  const methods = await db.paymentMethod.findMany();
  const paymentMethod = input.paymentMethod
    ? methods.find((item) => item.id === input.paymentMethod || item.name.toLowerCase() === input.paymentMethod!.toLowerCase())
    : null;
  let merchantId: string | null = null;
  if (input.merchant?.trim()) {
    const name = canonicalMerchantName(input.merchant);
    const normalized = normalizeMerchant(name);
    const merchants = await db.merchant.findMany();
    const existing = merchants.find((item) => item.aliases.includes(normalized) || item.name.toLowerCase() === name.toLowerCase());
    merchantId = existing?.id ?? (await db.merchant.create({ data: { name, aliases: [normalized] } })).id;
  }
  const startOn = input.startOn ?? todayYmd(user.timezone);
  const nextRunOn = firstRunOn(startOn, input.frequency, input.dayOfMonth, input.monthOfYear);
  const created = await db.recurringExpense.create({
    data: {
      name: input.name.trim(),
      merchantId,
      categoryId: category.id,
      paymentMethodId: paymentMethod?.id ?? null,
      entityId: entity.id,
      taxTag: input.taxTag ?? category.taxTagDefault ?? "UNREVIEWED",
      essential: input.essential === undefined ? category.essentialDefault : input.essential,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth,
      monthOfYear: input.frequency === "YEARLY" ? input.monthOfYear ?? null : null,
      amountType: input.amountType,
      startOn: ymdToDate(startOn),
      nextRunOn: ymdToDate(nextRunOn),
      rates: { create: { amountCents, effectiveFrom: ymdToDate(startOn) } },
    },
    include,
  });
  await writeAudit(userId, { actor, action: "recurring.create", targetType: "recurring", targetId: created.id, diff: { name: created.name, amountCents } });
  return serializeRecurring(created, user.currency, todayYmd(user.timezone));
}

export async function updateRecurring(userId: string, actor: Actor, id: string, input: {
  name?: string;
  category?: string;
  paymentMethod?: string | null;
  entity?: string;
  taxTag?: TaxTag;
  essential?: boolean | null;
  dayOfMonth?: number;
  monthOfYear?: number | null;
  amountType?: AmountType;
  frequency?: Frequency;
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const existing = await db.recurringExpense.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, "not_found", "That recurring item doesn't exist.");
  const data: Prisma.RecurringExpenseUpdateInput = {};
  if (input.name) data.name = input.name.trim();
  if (input.taxTag) data.taxTag = input.taxTag;
  if (input.essential !== undefined) data.essential = input.essential;
  if (input.amountType) data.amountType = input.amountType;
  if (input.frequency) data.frequency = input.frequency;
  if (input.dayOfMonth) {
    assertDayOfMonth(input.dayOfMonth);
    data.dayOfMonth = input.dayOfMonth;
  }
  if (input.monthOfYear !== undefined) data.monthOfYear = input.monthOfYear;
  if (input.category) {
    const categories = await db.category.findMany({ where: { archivedAt: null } });
    const category = categories.find((item) => item.id === input.category || item.name.toLowerCase() === input.category!.toLowerCase());
    if (!category) throw new AppError(400, "validation", "That category isn't on the account.");
    data.category = { connect: { id: category.id } };
  }
  if (input.entity) {
    const entities = await db.entity.findMany();
    const entity = entities.find((item) => item.id === input.entity || item.name.toLowerCase() === input.entity!.toLowerCase());
    if (!entity) throw new AppError(400, "validation", "That entity isn't on the account.");
    data.entity = { connect: { id: entity.id } };
  }
  if (input.paymentMethod !== undefined) {
    if (!input.paymentMethod) data.paymentMethod = { disconnect: true };
    else {
      const methods = await db.paymentMethod.findMany();
      const method = methods.find((item) => item.id === input.paymentMethod || item.name.toLowerCase() === input.paymentMethod!.toLowerCase());
      if (!method) throw new AppError(400, "validation", "That payment method isn't on the account.");
      data.paymentMethod = { connect: { id: method.id } };
    }
  }
  const updated = await db.recurringExpense.update({ where: { id }, data, include });
  await writeAudit(userId, { actor, action: "recurring.update", targetType: "recurring", targetId: id, diff: { fields: Object.keys(input) } });
  return serializeRecurring(updated, user.currency, todayYmd(user.timezone));
}

export async function addRate(userId: string, actor: Actor, id: string, input: { amount: number | string; effectiveFrom: string; applyToPosted?: boolean }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const item = await db.recurringExpense.findFirst({ where: { id } });
  if (!item) throw new AppError(404, "not_found", "That recurring item doesn't exist.");
  const amountCents = parseDollarsToCents(input.amount);
  const effectiveFrom = ymdToDate(input.effectiveFrom);
  const existing = await db.recurringRate.findFirst({ where: { recurringId: id, effectiveFrom } });
  if (existing) await db.recurringRate.update({ where: { id: existing.id }, data: { amountCents } });
  else await db.recurringRate.create({ data: { recurringId: id, amountCents, effectiveFrom } });
  if (input.applyToPosted) {
    await db.expense.updateMany({
      where: { recurringId: id, occurredOn: { gte: effectiveFrom }, deletedAt: null },
      data: { amountCents },
    });
  }
  await writeAudit(userId, { actor, action: "recurring.rate.add", targetType: "recurring", targetId: id, diff: { amountCents, effectiveFrom: input.effectiveFrom, applyToPosted: Boolean(input.applyToPosted) } });
}

export async function pauseRecurring(userId: string, actor: Actor, id: string) {
  const db = forUser(userId);
  const item = await db.recurringExpense.findFirst({ where: { id } });
  if (!item) throw new AppError(404, "not_found", "That recurring item doesn't exist.");
  await db.recurringExpense.update({ where: { id }, data: { status: "PAUSED" } });
  await writeAudit(userId, { actor, action: "recurring.pause", targetType: "recurring", targetId: id });
}

export async function resumeRecurring(userId: string, actor: Actor, id: string, backfill = false) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const item = await db.recurringExpense.findFirst({ where: { id }, include: { rates: true } });
  if (!item) throw new AppError(404, "not_found", "That recurring item doesn't exist.");
  const today = todayYmd(user.timezone);
  const next = backfill ? dateOnlyToYmd(item.nextRunOn) : firstRunOn(today, item.frequency, item.dayOfMonth, item.monthOfYear);
  await db.recurringExpense.update({ where: { id }, data: { status: "ACTIVE", nextRunOn: ymdToDate(next) } });
  await writeAudit(userId, { actor, action: "recurring.resume", targetType: "recurring", targetId: id, diff: { backfill, nextRunOn: next } });
  if (backfill) await runDueRecurring(userId, actor);
}

export async function deleteRecurring(userId: string, actor: Actor, id: string) {
  const db = forUser(userId);
  const item = await db.recurringExpense.findFirst({ where: { id } });
  if (!item) throw new AppError(404, "not_found", "That recurring item doesn't exist.");
  await db.recurringExpense.delete({ where: { id } });
  await writeAudit(userId, { actor, action: "recurring.delete", targetType: "recurring", targetId: id, diff: { name: item.name } });
}

export async function endRecurring(userId: string, actor: Actor, id: string, endOn?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const item = await db.recurringExpense.findFirst({ where: { id } });
  if (!item) throw new AppError(404, "not_found", "That recurring item doesn't exist.");
  const date = endOn ?? todayYmd(user.timezone);
  await db.recurringExpense.update({ where: { id }, data: { status: "ENDED", endOn: ymdToDate(date) } });
  await writeAudit(userId, { actor, action: "recurring.end", targetType: "recurring", targetId: id, diff: { endOn: date } });
}

export async function runDueRecurring(userId: string, actor: Actor = "CRON") {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { posted: 0 };
  const today = todayYmd(user.timezone);
  const db = forUser(userId);
  const items = await db.recurringExpense.findMany({
    where: { status: "ACTIVE", nextRunOn: { lte: ymdToDate(today) } },
    include: { rates: true },
  });
  let posted = 0;
  for (const item of items) {
    let next = dateOnlyToYmd(item.nextRunOn);
    for (let guard = 0; guard < 36 && next <= today; guard++) {
      if (item.endOn && next > dateOnlyToYmd(item.endOn)) {
        await db.recurringExpense.update({ where: { id: item.id }, data: { status: "ENDED" } });
        break;
      }
      const rates = item.rates.map((rate) => ({ amountCents: rate.amountCents, effectiveFrom: dateOnlyToYmd(rate.effectiveFrom) }));
      const rate = rateForDate(rates, next);
      if (!rate) break;
      const periodKey = periodKeyFor(item.frequency, next);
      try {
        const expense = await db.expense.create({
          data: {
            occurredOn: ymdToDate(next),
            amountCents: rate.amountCents,
            currency: user.currency,
            description: item.name,
            merchantId: item.merchantId,
            categoryId: item.categoryId,
            paymentMethodId: item.paymentMethodId,
            entityId: item.entityId,
            taxTag: item.taxTag,
            essential: item.essential,
            source: "RECURRING",
            status: item.amountType === "VARIABLE" ? "PENDING_CONFIRM" : "POSTED",
            recurringId: item.id,
            periodKey,
          },
        });
        await writeAudit(userId, { actor, action: "expense.create", targetType: "expense", targetId: expense.id, diff: { recurringId: item.id, periodKey, amountCents: rate.amountCents } });
        posted += 1;
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
      next = advanceRun(next, item.frequency, item.dayOfMonth, item.monthOfYear);
      await db.recurringExpense.update({ where: { id: item.id }, data: { nextRunOn: ymdToDate(next) } });
    }
  }
  return { posted };
}

export async function upcomingRecurring(userId: string, days: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  const today = todayYmd(user.timezone);
  const until = ymdToDate(today);
  until.setUTCDate(until.getUTCDate() + days);
  const db = forUser(userId);
  const items = await db.recurringExpense.findMany({
    where: { status: "ACTIVE", nextRunOn: { gte: ymdToDate(today), lte: until } },
    include,
    orderBy: { nextRunOn: "asc" },
  });
  return items.map((item) => serializeRecurring(item, user.currency, today));
}

export async function postMissedCharge(userId: string, actor: Actor, recurringId: string, input: { date: string; amount: number | string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const item = await db.recurringExpense.findFirst({ where: { id: recurringId } });
  if (!item) throw new AppError(404, "not_found", "That recurring item doesn't exist.");
  const occurredOn = input.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) throw new AppError(400, "validation", "Pick the date the charge posted.");
  const amountCents = parseDollarsToCents(input.amount);
  const periodKey = periodKeyFor(item.frequency, occurredOn);
  try {
    const expense = await db.expense.create({
      data: {
        occurredOn: ymdToDate(occurredOn),
        amountCents,
        currency: user.currency,
        description: item.name,
        merchantId: item.merchantId,
        categoryId: item.categoryId,
        paymentMethodId: item.paymentMethodId,
        entityId: item.entityId,
        taxTag: item.taxTag,
        essential: item.essential,
        source: "WEB",
        status: "POSTED",
        recurringId: item.id,
        periodKey,
      },
    });
    if (occurredOn >= dateOnlyToYmd(item.nextRunOn) && item.status === "ACTIVE") {
      const next = advanceRun(occurredOn, item.frequency, item.dayOfMonth, item.monthOfYear);
      await db.recurringExpense.update({ where: { id: item.id }, data: { nextRunOn: ymdToDate(next) } });
    }
    await writeAudit(userId, { actor, action: "expense.create", targetType: "expense", targetId: expense.id, diff: { recurringId: item.id, periodKey, amountCents, missed: true } });
    return expense.id;
  } catch (error) {
    if (isUniqueConflict(error)) throw new AppError(409, "conflict", "That period already has a charge on this bill.");
    throw error;
  }
}

export async function linkExpenseToRecurring(userId: string, actor: Actor, recurringId: string, expenseId: string) {
  const db = forUser(userId);
  const item = await db.recurringExpense.findFirst({ where: { id: recurringId } });
  if (!item) throw new AppError(404, "not_found", "That recurring item doesn't exist.");
  const expense = await db.expense.findFirst({ where: { id: expenseId } });
  if (!expense) throw new AppError(404, "not_found", "That expense doesn't exist.");
  const periodKey = periodKeyFor(item.frequency, dateOnlyToYmd(expense.occurredOn));
  const taken = await db.expense.findFirst({ where: { recurringId: item.id, periodKey, NOT: { id: expense.id } } });
  if (taken) throw new AppError(409, "conflict", "That period already has a charge on this bill.");
  await db.expense.update({ where: { id: expense.id }, data: { recurringId: item.id, periodKey } });
  await writeAudit(userId, { actor, action: "expense.update", targetType: "expense", targetId: expense.id, diff: { recurringId: item.id, periodKey, linked: true } });
}

export async function unlinkExpenseFromRecurring(userId: string, actor: Actor, expenseId: string) {
  const db = forUser(userId);
  const expense = await db.expense.findFirst({ where: { id: expenseId } });
  if (!expense) throw new AppError(404, "not_found", "That expense doesn't exist.");
  if (!expense.recurringId) return;
  await db.expense.update({ where: { id: expense.id }, data: { recurringId: null, periodKey: null } });
  await writeAudit(userId, { actor, action: "expense.update", targetType: "expense", targetId: expense.id, diff: { recurringId: null, linked: false } });
}

export async function createRecurringFromExpense(userId: string, actor: Actor, expenseId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const expense = await db.expense.findFirst({ where: { id: expenseId }, include: { merchant: true, category: true, paymentMethod: true, entity: true } });
  if (!expense) throw new AppError(404, "not_found", "That expense doesn't exist.");
  if (expense.recurringId) throw new AppError(409, "conflict", "This expense is already on a recurring bill.");
  const occurredOn = dateOnlyToYmd(expense.occurredOn);
  const day = Number(occurredOn.slice(8, 10));
  const name = (expense.merchant?.name || expense.description || "Recurring").trim().slice(0, 80);
  const created = await createRecurring(userId, actor, {
    name,
    amount: (expense.amountCents / 100).toFixed(2),
    frequency: "MONTHLY",
    dayOfMonth: day,
    amountType: "FIXED",
    startOn: occurredOn,
    category: expense.category.name,
    merchant: expense.merchant?.name,
    paymentMethod: expense.paymentMethod?.name,
    entity: expense.entity.name,
    taxTag: expense.taxTag,
    essential: expense.essential,
  });
  const today = todayYmd(user.timezone);
  let next = created.nextRunOn;
  while (next <= today) next = advanceRun(next, "MONTHLY", day, null);
  if (next !== created.nextRunOn) {
    await db.recurringExpense.update({ where: { id: created.id }, data: { nextRunOn: ymdToDate(next) } });
  }
  await linkExpenseToRecurring(userId, actor, created.id, expense.id);
  return { id: created.id, name: created.name, amountFormatted: created.amountFormatted, nextRunOn: next };
}

export async function searchExpensesToLink(userId: string, query: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const db = forUser(userId);
  const rows = await db.expense.findMany({
    where: {
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { merchant: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: { merchant: true },
    orderBy: { occurredOn: "desc" },
    take: 8,
  });
  return rows.map((row) => ({
    id: row.id,
    occurredOn: dateOnlyToYmd(row.occurredOn),
    amountFormatted: formatMoney(row.amountCents, user.currency),
    description: row.description,
    merchant: row.merchant?.name ?? null,
    recurringId: row.recurringId,
  }));
}

export async function recurringPostings(userId: string, recurringId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  const db = forUser(userId);
  const rows = await db.expense.findMany({
    where: { recurringId },
    orderBy: { occurredOn: "desc" },
    select: { id: true, occurredOn: true, amountCents: true, status: true, description: true },
  });
  return rows.map((row) => ({
    id: row.id,
    occurredOn: dateOnlyToYmd(row.occurredOn),
    amountCents: row.amountCents,
    amountFormatted: formatMoney(row.amountCents, user.currency),
    status: row.status,
    description: row.description,
  }));
}
