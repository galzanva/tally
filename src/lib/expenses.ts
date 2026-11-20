import type { Actor, Expense, Prisma, TaxTag } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { categorizeWithLlm } from "@/lib/categorize";
import { chargeDateInZone, dateOnlyToYmd, daysBetween, resolvePeriod, todayYmd, ymdToDate } from "@/lib/dates";
import { forUser, isUniqueConflict, prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatMoney, parseDollarsToCents } from "@/lib/money";
import { dateOnlyRate } from "@/lib/recurring/schedule";
import { keywordCategory } from "@/lib/seed";
import { canonicalMerchantName, maskCardNumbers, matchCategoryName, normalizeMerchant } from "@/lib/text";

const include = {
  merchant: true,
  category: true,
  paymentMethod: true,
  entity: true,
  receipts: { select: { id: true, contentType: true, sizeBytes: true, createdAt: true } },
  recurring: { include: { rates: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof include }>;

export type ExpenseDTO = {
  id: string;
  occurredOn: string;
  amountCents: number;
  amountFormatted: string;
  currency: string;
  description: string;
  merchant: string | null;
  merchantId: string | null;
  category: string;
  categoryId: string;
  paymentMethod: string | null;
  paymentMethodId: string | null;
  entity: string;
  entityId: string;
  taxTag: TaxTag;
  essential: boolean | null;
  notes: string | null;
  source: Expense["source"];
  status: Expense["status"];
  recurringId: string | null;
  periodKey: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  receiptIds: string[];
  deletedAt: string | null;
};

export function toExpenseDTO(row: ExpenseRow, currency: string): ExpenseDTO {
  return {
    id: row.id,
    occurredOn: dateOnlyToYmd(row.occurredOn),
    amountCents: row.amountCents,
    amountFormatted: formatMoney(row.amountCents, currency),
    currency: row.currency,
    description: row.description,
    merchant: row.merchant?.name ?? null,
    merchantId: row.merchantId,
    category: row.category.name,
    categoryId: row.categoryId,
    paymentMethod: row.paymentMethod?.name ?? null,
    paymentMethodId: row.paymentMethodId,
    entity: row.entity.name,
    entityId: row.entityId,
    taxTag: row.taxTag,
    essential: row.essential,
    notes: row.notes,
    source: row.source,
    status: row.status,
    recurringId: row.recurringId,
    periodKey: row.periodKey,
    needsReview: row.needsReview,
    reviewReason: row.reviewReason,
    receiptIds: row.receipts.map((receipt) => receipt.id),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

export type ExpenseWrite = {
  amount?: number | string;
  date?: string;
  merchant?: string | null;
  description?: string;
  category?: string;
  paymentMethod?: string | null;
  entity?: string;
  taxTag?: TaxTag;
  essential?: boolean | null;
  notes?: string | null;
  receiptIds?: string[];
  confirmLarge?: boolean;
  applyAsNewRate?: boolean;
};

async function loadContext(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const [categories, paymentMethods, entities, merchants] = await Promise.all([
    db.category.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    db.entity.findMany({ orderBy: { name: "asc" } }),
    db.merchant.findMany(),
  ]);
  return { user, db, categories, paymentMethods, entities, merchants };
}

function largeMessage(cents: number, threshold: number, currency: string) {
  return `This is ${formatMoney(cents, currency)}, which is at or above your ${formatMoney(threshold, currency)} confirmation line. Ask G before saving it, then send the same request with confirmLarge set to true.`;
}

async function attachReceipts(userId: string, expenseId: string, receiptIds: string[] | undefined) {
  if (!receiptIds?.length) return;
  const db = forUser(userId);
  for (const receiptId of receiptIds) {
    const receipt = await db.receipt.findFirst({ where: { id: receiptId } });
    if (!receipt) throw new AppError(404, "not_found", "That receipt doesn't exist.");
    if (receipt.expenseId && receipt.expenseId !== expenseId) {
      throw new AppError(400, "validation", "That receipt is already attached to another expense.");
    }
    if (receipt.expenseId !== expenseId) {
      await db.receipt.update({ where: { id: receipt.id }, data: { expenseId } });
    }
  }
}

export async function getExpense(userId: string, id: string, includeDeleted = false) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const row = await db.expense.findFirst({
    where: includeDeleted ? { id, deletedAt: { not: null } } : { id },
    include,
  });
  if (!row) throw new AppError(404, "not_found", "That expense doesn't exist.");
  return toExpenseDTO(row, user.currency);
}

export async function listExpenses(userId: string, filters: {
  period?: string;
  from?: string;
  to?: string;
  category?: string;
  merchant?: string;
  entity?: string;
  paymentMethod?: string;
  taxTag?: string;
  q?: string;
  hasReceipt?: boolean;
  source?: Expense["source"];
  needsReview?: boolean;
  status?: Expense["status"];
  limit?: number;
  cap?: number;
  cursor?: string;
  page?: number;
  pageSize?: number;
}) {
  const { user, db, categories, merchants, entities, paymentMethods } = await loadContext(userId);
  const range = filters.period === "all" && !filters.from && !filters.to
    ? null
    : resolvePeriod({ period: filters.period, from: filters.from, to: filters.to }, user.timezone);
  const category = filters.category
    ? categories.find((item) => item.id === filters.category || item.name.toLowerCase() === filters.category!.toLowerCase())
    : undefined;
  const merchant = filters.merchant
    ? merchants.find((item) => item.id === filters.merchant || item.name.toLowerCase() === filters.merchant!.toLowerCase() || item.aliases.includes(normalizeMerchant(filters.merchant!)))
    : undefined;
  const entity = filters.entity
    ? entities.find((item) => item.id === filters.entity || item.name.toLowerCase() === filters.entity!.toLowerCase())
    : undefined;
  const paymentMethod = filters.paymentMethod
    ? paymentMethods.find((item) => item.id === filters.paymentMethod || item.name.toLowerCase() === filters.paymentMethod!.toLowerCase())
    : undefined;
  const cap = Math.min(filters.cap ?? 100, 2000);
  const limit = Math.min(Math.max(filters.limit ?? cap, 1), cap);
  const where: Prisma.ExpenseWhereInput = {
    ...(range ? { occurredOn: { gte: ymdToDate(range.from), lte: ymdToDate(range.to) } } : {}),
    ...(category ? { categoryId: category.id } : {}),
    ...(merchant ? { merchantId: merchant.id } : {}),
    ...(entity ? { entityId: entity.id } : {}),
    ...(paymentMethod ? { paymentMethodId: paymentMethod.id } : {}),
    ...(filters.taxTag ? { taxTag: filters.taxTag as TaxTag } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.needsReview ? { needsReview: true } : {}),
    ...(filters.hasReceipt === true ? { receipts: { some: {} } } : {}),
    ...(filters.hasReceipt === false ? { receipts: { none: {} } } : {}),
    ...(filters.q
      ? {
          OR: [
            { description: { contains: filters.q, mode: "insensitive" } },
            { notes: { contains: filters.q, mode: "insensitive" } },
            { merchant: { name: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const orderBy = [{ occurredOn: "desc" as const }, { createdAt: "desc" as const }];
  if (filters.page) {
    const pageSize = Math.min(Math.max(filters.pageSize ?? 40, 1), 100);
    const total = await db.expense.count({ where });
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(filters.page, 1), pages);
    const rows = await db.expense.findMany({
      where,
      include,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { expenses: rows.map((row) => toExpenseDTO(row, user.currency)), nextCursor: null, range, total, page, pageSize };
  }
  const rows = await db.expense.findMany({
    where,
    include,
    orderBy,
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page[page.length - 1]?.id ?? null : null;
  return { expenses: page.map((row) => toExpenseDTO(row, user.currency)), nextCursor, range, total: page.length, page: 1, pageSize: limit };
}

async function resolveMerchant(ctx: Awaited<ReturnType<typeof loadContext>>, raw?: string | null) {
  if (!raw?.trim()) return null;
  const canonical = canonicalMerchantName(raw);
  const normalized = normalizeMerchant(canonical);
  const existing = ctx.merchants.find(
    (merchant) => merchant.aliases.includes(normalized) || normalizeMerchant(merchant.name) === normalized || merchant.name.toLowerCase() === canonical.toLowerCase(),
  );
  if (existing) return existing;
  const created = await ctx.db.merchant.create({
    data: { name: canonical, aliases: Array.from(new Set([normalized, normalizeMerchant(raw)].filter(Boolean))) },
  });
  ctx.merchants.push(created);
  return created;
}

export async function createExpense(options: {
  userId: string;
  actor: Actor;
  apiKeyId?: string | null;
  source: Expense["source"];
  idempotencyKey?: string | null;
  input: ExpenseWrite;
}) {
  const ctx = await loadContext(options.userId);
  const warnings: string[] = [];
  if (options.idempotencyKey) {
    const replay = await ctx.db.expense.findFirst({ where: { idempotencyKey: options.idempotencyKey }, include });
    if (replay) {
      return { expense: toExpenseDTO(replay, ctx.user.currency), warnings: ["duplicate request, returned the original"], action: "created" as const };
    }
  }
  if (options.input.amount == null || options.input.amount === "") {
    throw new AppError(400, "validation", "Add an amount in dollars, like 23.40.");
  }
  let amountCents: number;
  try {
    amountCents = parseDollarsToCents(options.input.amount);
  } catch (error) {
    throw new AppError(400, "validation", error instanceof Error ? error.message : "Add an amount in dollars, like 23.40.");
  }
  if (Math.abs(amountCents) >= ctx.user.largeAmountCents && options.input.confirmLarge !== true) {
    throw new AppError(422, "confirm_large_amount", largeMessage(amountCents, ctx.user.largeAmountCents, ctx.user.currency));
  }
  const settled = options.source === "API"
    ? chargeDateInZone(options.input.date, ctx.user.timezone)
    : { ymd: options.input.date?.trim() || todayYmd(ctx.user.timezone), adjustedFrom: null as string | null };
  const occurredOn = settled.ymd;
  ymdToDate(occurredOn);
  if (settled.adjustedFrom) warnings.push(`Saved as ${occurredOn}. ${settled.adjustedFrom} is the UTC date, and it is still ${occurredOn} in your timezone.`);
  const merchant = await resolveMerchant(ctx, options.input.merchant);
  const description = (options.input.description?.trim() || merchant?.name || "").slice(0, 200);
  if (!description) throw new AppError(400, "validation", "Add a description or a merchant.");
  const notes = options.input.notes?.trim() ? maskCardNumbers(options.input.notes.trim()).slice(0, 4000) : null;

  let category = options.input.category ? ctx.categories.find((item) => item.name === matchCategoryName(options.input.category!, ctx.categories.map((c) => c.name))) : undefined;
  let essential = options.input.essential;
  let taxTag = options.input.taxTag;
  let needsReview = false;
  let reviewReason: string | null = null;
  let cacheDefault = Boolean(options.input.category && category);

  if (!category && merchant?.defaultCategoryId) {
    category = ctx.categories.find((item) => item.id === merchant.defaultCategoryId);
  }
  if (!category) {
    const keyword = keywordCategory(`${description} ${merchant?.name ?? ""}`);
    if (keyword) {
      category = ctx.categories.find((item) => item.name === keyword);
      cacheDefault = Boolean(category && merchant);
    }
  }
  if (!category) {
    try {
      const guess = await categorizeWithLlm({
        userId: options.userId,
        timeZone: ctx.user.timezone,
        cap: ctx.user.aiDailyTokenCap,
        description,
        merchant: merchant?.name ?? null,
        categories: ctx.categories.map((item) => item.name),
      });
      if (guess) {
        category = ctx.categories.find((item) => item.name === guess.category);
        if (essential == null && guess.essential != null) essential = guess.essential;
        if (!taxTag && guess.taxTag) taxTag = guess.taxTag;
        if (guess.confidence < 0.7) {
          needsReview = true;
          reviewReason = "The category guess was uncertain.";
        }
      }
    } catch (error) {
      if (error instanceof AppError && error.code === "ai_cap") warnings.push(error.message);
    }
  }
  if (!category) {
    category = ctx.categories.find((item) => item.name === "Other");
    needsReview = true;
    reviewReason = reviewReason ?? "Couldn't pick a category, so this is filed under Other.";
  }
  if (!category) throw new AppError(500, "server", "The Other category is missing. Recreate the account defaults.");
  if (essential == null) essential = category.essentialDefault;
  if (!taxTag) taxTag = category.taxTagDefault ?? "UNREVIEWED";

  const entity = options.input.entity
    ? ctx.entities.find((item) => item.name.toLowerCase() === options.input.entity!.trim().toLowerCase() || item.id === options.input.entity)
    : ctx.entities.find((item) => item.isDefault) ?? ctx.entities[0];
  if (!entity) throw new AppError(400, "validation", "Pick an entity. Personal is the usual one.");
  const paymentMethod = options.input.paymentMethod
    ? ctx.paymentMethods.find((item) => item.name.toLowerCase() === options.input.paymentMethod!.trim().toLowerCase() || item.id === options.input.paymentMethod)
    : null;
  if (options.input.paymentMethod && !paymentMethod) {
    throw new AppError(400, "validation", "That payment method isn't on the account. Use a name from the payment methods list.");
  }

  if (merchant) {
    const candidates = await ctx.db.expense.findMany({
      where: {
        merchantId: merchant.id,
        source: "RECURRING",
        recurring: { status: "ACTIVE" },
        OR: [{ periodKey: occurredOn.slice(0, 7) }, { periodKey: occurredOn.slice(0, 4) }],
      },
      include,
    });
    for (const candidate of candidates) {
      if (Math.abs(daysBetween(dateOnlyToYmd(candidate.occurredOn), occurredOn)) > 5) continue;
      const human = await ctx.db.auditLog.findFirst({
        where: { targetType: "expense", targetId: candidate.id, action: "expense.update", actor: { in: ["WEB", "API_KEY"] } },
      });
      if (human) continue;
      if (candidate.recurring?.amountType === "FIXED") {
        const rate = dateOnlyRate(candidate.recurring.rates, occurredOn);
        if (rate && rate.amountCents !== amountCents) {
          warnings.push(
            `${candidate.recurring.name} is set to ${formatMoney(rate.amountCents, ctx.user.currency)} but this was ${formatMoney(amountCents, ctx.user.currency)}. Say 'new rate' to use ${formatMoney(amountCents, ctx.user.currency)} from this month on.`,
          );
        }
      }
      const updated = await ctx.db.expense.update({
        where: { id: candidate.id },
        data: {
          amountCents,
          description,
          notes,
          status: "POSTED",
          paymentMethodId: paymentMethod?.id ?? candidate.paymentMethodId,
          idempotencyKey: candidate.idempotencyKey ?? options.idempotencyKey ?? null,
          needsReview: false,
        },
        include,
      });
      await attachReceipts(options.userId, updated.id, options.input.receiptIds);
      await writeAudit(options.userId, {
        actor: options.actor,
        apiKeyId: options.apiKeyId,
        action: "expense.match_recurring",
        targetType: "expense",
        targetId: updated.id,
        diff: { amountCents, recurringId: candidate.recurringId },
      });
      const fresh = await ctx.db.expense.findFirst({ where: { id: updated.id }, include });
      return { expense: toExpenseDTO(fresh ?? updated, ctx.user.currency), warnings, action: "matched_recurring" as const };
    }
  }

  if (cacheDefault && merchant && category) {
    await ctx.db.merchant.update({ where: { id: merchant.id }, data: { defaultCategoryId: category.id } });
  }

  try {
    const created = await ctx.db.expense.create({
      data: {
        occurredOn: ymdToDate(occurredOn),
        amountCents,
        currency: ctx.user.currency,
        description,
        merchantId: merchant?.id ?? null,
        categoryId: category.id,
        paymentMethodId: paymentMethod?.id ?? null,
        entityId: entity.id,
        taxTag,
        essential: essential ?? null,
        notes,
        source: options.source,
        status: "POSTED",
        apiKeyId: options.apiKeyId ?? null,
        idempotencyKey: options.idempotencyKey ?? null,
        needsReview,
        reviewReason,
      },
      include,
    });
    await attachReceipts(options.userId, created.id, options.input.receiptIds);
    await writeAudit(options.userId, {
      actor: options.actor,
      apiKeyId: options.apiKeyId,
      action: "expense.create",
      targetType: "expense",
      targetId: created.id,
      diff: { amountCents, description, category: category.name, source: options.source },
    });
    const fresh = await ctx.db.expense.findFirst({ where: { id: created.id }, include });
    return { expense: toExpenseDTO(fresh ?? created, ctx.user.currency), warnings, action: "created" as const };
  } catch (error) {
    if (options.idempotencyKey && isUniqueConflict(error)) {
      const replay = await ctx.db.expense.findFirst({ where: { idempotencyKey: options.idempotencyKey }, include });
      if (replay) {
        return { expense: toExpenseDTO(replay, ctx.user.currency), warnings: ["duplicate request, returned the original"], action: "created" as const };
      }
    }
    throw error;
  }
}

export async function updateExpense(options: { userId: string; actor: Actor; apiKeyId?: string | null; id: string; input: ExpenseWrite }) {
  const ctx = await loadContext(options.userId);
  const existing = await ctx.db.expense.findFirst({ where: { id: options.id }, include });
  if (!existing) throw new AppError(404, "not_found", "That expense doesn't exist.");
  const data: Prisma.ExpenseUpdateInput = {};
  if (options.input.amount != null && options.input.amount !== "") {
    const amountCents = parseDollarsToCents(options.input.amount);
    if (Math.abs(amountCents) >= ctx.user.largeAmountCents && options.input.confirmLarge !== true) {
      throw new AppError(422, "confirm_large_amount", largeMessage(amountCents, ctx.user.largeAmountCents, ctx.user.currency));
    }
    data.amountCents = amountCents;
  }
  if (options.input.date) data.occurredOn = ymdToDate(options.input.date);
  if (options.input.description != null) data.description = options.input.description.trim().slice(0, 200);
  if (options.input.notes !== undefined) data.notes = options.input.notes?.trim() ? maskCardNumbers(options.input.notes.trim()).slice(0, 4000) : null;
  if (options.input.essential !== undefined) data.essential = options.input.essential;
  if (options.input.taxTag) data.taxTag = options.input.taxTag;
  if (options.input.merchant !== undefined) {
    const merchant = await resolveMerchant(ctx, options.input.merchant);
    if (merchant) data.merchant = { connect: { id: merchant.id } };
    else if (existing.merchantId) data.merchant = { disconnect: true };
  }
  if (options.input.category) {
    const name = matchCategoryName(options.input.category, ctx.categories.map((item) => item.name));
    const category = ctx.categories.find((item) => item.name === name);
    if (!category) throw new AppError(400, "validation", "That category isn't on the account.");
    data.category = { connect: { id: category.id } };
    data.needsReview = false;
    data.reviewReason = null;
    const merchantId = existing.merchantId;
    if (merchantId) await ctx.db.merchant.update({ where: { id: merchantId }, data: { defaultCategoryId: category.id } });
  }
  if (options.input.entity) {
    const entity = ctx.entities.find((item) => item.id === options.input.entity || item.name.toLowerCase() === options.input.entity!.toLowerCase());
    if (!entity) throw new AppError(400, "validation", "That entity isn't on the account.");
    data.entity = { connect: { id: entity.id } };
  }
  if (options.input.paymentMethod !== undefined) {
    if (!options.input.paymentMethod) {
      if (existing.paymentMethodId) data.paymentMethod = { disconnect: true };
    } else {
      const method = ctx.paymentMethods.find((item) => item.id === options.input.paymentMethod || item.name.toLowerCase() === options.input.paymentMethod!.toLowerCase());
      if (!method) throw new AppError(400, "validation", "That payment method isn't on the account.");
      data.paymentMethod = { connect: { id: method.id } };
    }
  }
  if (options.input.applyAsNewRate && existing.recurringId) {
    const amountCents = typeof data.amountCents === "number" ? data.amountCents : existing.amountCents;
    const effectiveFrom = options.input.date ? ymdToDate(options.input.date) : existing.occurredOn;
    const ymd = dateOnlyToYmd(effectiveFrom);
    const current = await ctx.db.recurringRate.findFirst({ where: { recurringId: existing.recurringId, effectiveFrom } });
    if (current) await ctx.db.recurringRate.update({ where: { id: current.id }, data: { amountCents } });
    else await ctx.db.recurringRate.create({ data: { recurringId: existing.recurringId, amountCents, effectiveFrom } });
    await writeAudit(options.userId, {
      actor: options.actor,
      apiKeyId: options.apiKeyId,
      action: "recurring.rate.add",
      targetType: "recurring",
      targetId: existing.recurringId,
      diff: { amountCents, effectiveFrom: ymd },
    });
  }
  const updated = await ctx.db.expense.update({ where: { id: existing.id }, data, include });
  await attachReceipts(options.userId, updated.id, options.input.receiptIds);
  await writeAudit(options.userId, {
    actor: options.actor,
    apiKeyId: options.apiKeyId,
    action: "expense.update",
    targetType: "expense",
    targetId: updated.id,
    diff: { fields: Object.keys(options.input) },
  });
  const fresh = await ctx.db.expense.findFirst({ where: { id: updated.id }, include });
  return toExpenseDTO(fresh ?? updated, ctx.user.currency);
}

export async function softDeleteExpense(userId: string, id: string, actor: Actor, apiKeyId?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const existing = await db.expense.findFirst({ where: { id } });
  if (!existing) throw new AppError(404, "not_found", "That expense doesn't exist.");
  await db.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(userId, { actor, apiKeyId, action: "expense.delete", targetType: "expense", targetId: id });
}

export async function restoreExpense(userId: string, id: string, actor: Actor, apiKeyId?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const db = forUser(userId);
  const existing = await db.expense.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!existing) throw new AppError(404, "not_found", "That expense isn't in the trash.");
  if (existing.deletedAt && Date.now() - existing.deletedAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
    throw new AppError(400, "validation", "That expense was deleted more than 30 days ago.");
  }
  await db.expense.update({ where: { id }, data: { deletedAt: null } });
  await writeAudit(userId, { actor, apiKeyId, action: "expense.restore", targetType: "expense", targetId: id });
  return getExpense(userId, id);
}

export async function bulkPatchExpenses(userId: string, ids: string[], patch: { categoryId?: string; entityId?: string; taxTag?: TaxTag }) {
  const db = forUser(userId);
  const data: Record<string, unknown> = {};
  if (patch.categoryId) data.categoryId = patch.categoryId;
  if (patch.entityId) data.entityId = patch.entityId;
  if (patch.taxTag) data.taxTag = patch.taxTag;
  const result = await db.expense.updateMany({ where: { id: { in: ids } }, data });
  await writeAudit(userId, { actor: "WEB", action: "expense.bulk_update", targetType: "expense", targetId: ids[0] ?? "bulk", diff: { ids, patch } });
  return result.count;
}
