import { ZodError } from "zod";
import { todayYmd } from "@/lib/dates";
import { askQuestion } from "@/lib/ai";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { forUser } from "@/lib/db";
import { createExpense, getExpense, listExpenses, restoreExpense, softDeleteExpense, updateExpense } from "@/lib/expenses";
import { hmacSecret } from "@/lib/keys";
import { redeemPairingCode } from "@/lib/keys";
import { openApiDocument, AskSchema, CreateExpenseSchema, PairSchema, PatchExpenseSchema, RateSchema, RecurringCreateSchema } from "@/lib/api/openapi";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import { assertReceiptFile, openStored, saveReceipt } from "@/lib/receipts";
import { addRate, createRecurring, endRecurring, listRecurring, pauseRecurring, resumeRecurring, updateRecurring } from "@/lib/recurring";
import type { Scope } from "@/lib/seed";
import { getSummary } from "@/lib/summary";

function ok(data: unknown, warnings: string[] = [], status = 200) {
  return Response.json({ data, warnings }, { status });
}

function failure(error: unknown) {
  if (error instanceof AppError) {
    const headers = new Headers();
    if (error.extra?.retryAfter) headers.set("Retry-After", String(error.extra.retryAfter));
    return Response.json({ error: { code: error.code, message: error.message, ...(error.extra ?? {}) } }, { status: error.status, headers });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: { code: "validation", message: error.issues[0]?.message ?? "That request wasn't valid." } }, { status: 400 });
  }
  console.error(error);
  return Response.json({ error: { code: "server", message: "Something went wrong on Tally's side." } }, { status: 500 });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "validation", "The body needs to be JSON.");
  }
}

async function authed(request: Request, scope?: Scope) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(tly_[A-Za-z0-9]+)$/.exec(header.trim());
  if (!match) throw new AppError(401, "unauthorized", "Add an Authorization header with a Tally API key.");
  const key = await prisma.apiKey.findUnique({ where: { hash: hmacSecret(match[1]!) }, include: { user: true } });
  if (!key || key.revokedAt) throw new AppError(401, "unauthorized", "This API key is no longer valid.");
  if (scope && !key.scopes.includes(scope)) throw new AppError(403, "forbidden", "This key isn't allowed to do that.");
  const limit = await hitRateLimit(`apikey:${key.id}`, 60, 60_000);
  if (!limit.ok) throw new AppError(429, "rate_limited", "Too many requests. Wait and try again.", { retryAfter: limit.retryAfter });
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date(), lastUsedIp: clientIp(request) } });
  return key;
}

function idempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    throw new AppError(400, "validation", "Add an Idempotency-Key header, a new id for each message. Reuse it if you retry.");
  }
  return key;
}

async function handle(method: string, request: Request, parts: string[]) {
  const [a, b, c] = parts;
  if (method === "GET" && a === "openapi.json" && !b) return Response.json(openApiDocument());
  if (method === "POST" && a === "pair" && !b) {
    const body = PairSchema.parse(await readJson(request));
    const redeemed = await redeemPairingCode(body.code, body.client, clientIp(request));
    return ok({ apiKey: redeemed.apiKey, baseUrl: redeemed.baseUrl, scopes: redeemed.scopes });
  }

  const scopeFor = (): Scope | undefined => {
    if (method === "GET" && a === "me") return undefined;
    if (a === "categories" || a === "payment-methods" || a === "entities" || a === "summary") return "expenses:read";
    if (a === "expenses" && method === "GET") return "expenses:read";
    if (a === "expenses") return "expenses:write";
    if (a === "receipts" && method === "GET") return "receipts:read";
    if (a === "receipts") return "receipts:write";
    if (a === "recurring" && method === "GET") return "recurring:read";
    if (a === "recurring") return "recurring:write";
    if (a === "ask" || a === "insights") return "insights:read";
    return undefined;
  };
  const key = await authed(request, scopeFor());
  const userId = key.userId;

  if (method === "GET" && a === "me") {
    return ok({ email: key.user.email, timezone: key.user.timezone, today: todayYmd(key.user.timezone), currency: key.user.currency, scopes: key.scopes });
  }
  if (method === "GET" && a === "categories") {
    const rows = await forUser(userId).category.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } });
    return ok(rows.map((row) => ({ name: row.name, essentialDefault: row.essentialDefault, taxTagDefault: row.taxTagDefault })));
  }
  if (method === "GET" && a === "payment-methods") {
    const rows = await forUser(userId).paymentMethod.findMany({ orderBy: { name: "asc" } });
    return ok(rows.map((row) => ({ name: row.name, type: row.type, last4: row.last4 })));
  }
  if (method === "GET" && a === "entities") {
    const rows = await forUser(userId).entity.findMany({ orderBy: { name: "asc" } });
    return ok(rows.map((row) => ({ name: row.name, isDefault: row.isDefault })));
  }
  if (a === "expenses" && !b && method === "POST") {
    const input = CreateExpenseSchema.parse(await readJson(request));
    const result = await createExpense({ userId, actor: "API_KEY", apiKeyId: key.id, source: "API", idempotencyKey: idempotencyKey(request), input });
    return ok({ ...result.expense, action: result.action }, result.warnings);
  }
  if (a === "expenses" && !b && method === "GET") {
    const url = new URL(request.url);
    const hasReceipt = url.searchParams.get("hasReceipt");
    const listed = await listExpenses(userId, {
      period: url.searchParams.get("period") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      merchant: url.searchParams.get("merchant") ?? undefined,
      entity: url.searchParams.get("entity") ?? undefined,
      taxTag: url.searchParams.get("taxTag") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      hasReceipt: hasReceipt == null ? undefined : hasReceipt === "true",
      limit: Number(url.searchParams.get("limit") ?? 50),
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    return ok({ expenses: listed.expenses, nextCursor: listed.nextCursor });
  }
  if (a === "expenses" && b && c === "restore" && method === "POST") {
    return ok(await restoreExpense(userId, b, "API_KEY", key.id));
  }
  if (a === "expenses" && b && !c && method === "GET") return ok(await getExpense(userId, b));
  if (a === "expenses" && b && !c && method === "PATCH") {
    const input = PatchExpenseSchema.parse(await readJson(request));
    return ok(await updateExpense({ userId, actor: "API_KEY", apiKeyId: key.id, id: b, input }));
  }
  if (a === "expenses" && b && !c && method === "DELETE") {
    await softDeleteExpense(userId, b, "API_KEY", key.id);
    return ok({ id: b, deleted: true });
  }
  if (a === "receipts" && !b && method === "POST") {
    const uploadLimit = await hitRateLimit(`upload:${key.id}`, 10, 60_000);
    if (!uploadLimit.ok) throw new AppError(429, "rate_limited", "Too many uploads. Wait a minute and try again.", { retryAfter: uploadLimit.retryAfter });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(400, "validation", "Attach a receipt file in the file field.");
    assertReceiptFile(file.type || "application/octet-stream", file.size, 4 * 1024 * 1024);
    const expenseId = typeof form.get("expenseId") === "string" ? String(form.get("expenseId")) : null;
    const receipt = await saveReceipt(userId, { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type, expenseId });
    return ok({ receiptId: receipt.id });
  }
  if (a === "receipts" && b === undefined) throw new AppError(404, "not_found", "That path doesn't exist.");
  if (a === "receipts" && c === "file" && method === "GET") {
    const db = forUser(userId);
    const receipt = await db.receipt.findFirst({ where: { id: b } });
    if (!receipt) throw new AppError(404, "not_found", "That receipt doesn't exist.");
    const file = await openStored(receipt.blobPathname, receipt.contentType);
    if (!file) throw new AppError(404, "not_found", "That receipt file is gone.");
    return file;
  }
  if (a === "summary" && method === "GET") {
    const url = new URL(request.url);
    const summary = await getSummary(userId, { period: url.searchParams.get("period") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, groupBy: url.searchParams.get("groupBy") ?? "category" });
    return ok({
      period: summary.period,
      totalCents: summary.totalCents,
      totalFormatted: summary.totalFormatted,
      count: summary.count,
      previousTotalCents: summary.previousTotalCents,
      previousTotalFormatted: summary.previousTotalFormatted,
      deltaPercent: summary.deltaPercent,
      groups: summary.groups,
      pending: summary.pending,
    });
  }
  if (a === "recurring" && !b && method === "GET") return ok(await listRecurring(userId));
  if (a === "recurring" && !b && method === "POST") {
    const input = RecurringCreateSchema.parse(await readJson(request));
    return ok(await createRecurring(userId, "API_KEY", input));
  }
  if (a === "recurring" && b && !c && method === "PATCH") {
    const body = await readJson(request);
    return ok(await updateRecurring(userId, "API_KEY", b, body));
  }
  if (a === "recurring" && b && c === "rates" && method === "POST") {
    const input = RateSchema.parse(await readJson(request));
    await addRate(userId, "API_KEY", b, input);
    return ok({ id: b, effectiveFrom: input.effectiveFrom });
  }
  if (a === "recurring" && b && c === "pause" && method === "POST") {
    await pauseRecurring(userId, "API_KEY", b);
    return ok({ id: b, status: "PAUSED" });
  }
  if (a === "recurring" && b && c === "resume" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const backfill = Boolean((body as { backfill?: boolean }).backfill);
    await resumeRecurring(userId, "API_KEY", b, backfill);
    return ok({ id: b, status: "ACTIVE", backfill });
  }
  if (a === "recurring" && b && c === "end" && method === "POST") {
    await endRecurring(userId, "API_KEY", b);
    return ok({ id: b, status: "ENDED" });
  }
  if (a === "ask" && method === "POST") {
    const askLimit = await hitRateLimit(`ask:${userId}`, 10, 60 * 60 * 1000);
    if (!askLimit.ok) throw new AppError(429, "rate_limited", "The question limit for this hour is used up.", { retryAfter: askLimit.retryAfter });
    const input = AskSchema.parse(await readJson(request));
    return ok(await askQuestion(userId, input.question));
  }
  if (a === "insights" && b === "latest" && method === "GET") {
    const db = forUser(userId);
    const insight = await db.insight.findFirst({ where: { kind: "MONTHLY_REVIEW" }, orderBy: { createdAt: "desc" } });
    if (!insight) return ok(null);
    return ok({ id: insight.id, title: insight.title, bodyMd: insight.bodyMd, periodKey: insight.periodKey, facts: insight.facts, createdAt: insight.createdAt.toISOString() });
  }
  throw new AppError(404, "not_found", "That path doesn't exist.");
}

export async function dispatch(method: string, request: Request, parts: string[]) {
  try {
    return await handle(method, request, parts);
  } catch (error) {
    return failure(error);
  }
}
