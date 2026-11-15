"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { checkPassword, findUserByEmail, updateAccount } from "@/lib/account";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { askQuestion, generateMonthlyReview } from "@/lib/ai";
import { bulkPatchExpenses, createExpense, restoreExpense, softDeleteExpense, updateExpense, type ExpenseWrite } from "@/lib/expenses";
import { importWorkbook } from "@/lib/import/xlsx";
import { createManualKey, createPairingCode, revokeKey } from "@/lib/keys";
import { addRate, createRecurring, endRecurring, pauseRecurring, resumeRecurring, updateRecurring } from "@/lib/recurring";
import { runTaxReview } from "@/lib/tax";
import { forUser } from "@/lib/db";
import { parseDollarsToCents } from "@/lib/money";
import { SCOPES } from "@/lib/seed";

function fail(error: unknown): { ok: false; message: string; code?: string } {
  if (error instanceof AppError) return { ok: false, message: error.message, code: error.code };
  throw error;
}

export async function loginAction(_state: { message?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await findUserByEmail(email);
  if (!user || !(await checkPassword(user.id, password))) return { message: "That email and password don't match." };
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function saveExpenseAction(input: ExpenseWrite & { id?: string }) {
  const { user } = await requireUser();
  try {
    const result = input.id
      ? { expense: await updateExpense({ userId: user.id, actor: "WEB", id: input.id, input }), warnings: [] as string[], action: "updated" as const }
      : await createExpense({ userId: user.id, actor: "WEB", source: "WEB", input });
    revalidatePath("/");
    revalidatePath("/expenses");
    return { ok: true as const, expense: result.expense, warnings: result.warnings, action: result.action };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteExpenseAction(id: string) {
  const { user } = await requireUser();
  try {
    await softDeleteExpense(user.id, id, "WEB");
    revalidatePath("/expenses");
    revalidatePath("/");
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreExpenseAction(id: string) {
  const { user } = await requireUser();
  try {
    await restoreExpense(user.id, id, "WEB");
    revalidatePath("/expenses");
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function bulkExpenseAction(ids: string[], patch: { categoryId?: string; entityId?: string; taxTag?: ExpenseWrite["taxTag"] }) {
  const { user } = await requireUser();
  const count = await bulkPatchExpenses(user.id, ids, patch);
  revalidatePath("/expenses");
  revalidatePath("/taxes");
  return { ok: true as const, count };
}

export async function saveRecurringAction(input: Parameters<typeof createRecurring>[2] & { id?: string }) {
  const { user } = await requireUser();
  try {
    if (input.id) await updateRecurring(user.id, "WEB", input.id, input);
    else await createRecurring(user.id, "WEB", input);
    revalidatePath("/recurring");
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function recurringStatusAction(id: string, action: "pause" | "resume" | "end", backfill = false) {
  const { user } = await requireUser();
  try {
    if (action === "pause") await pauseRecurring(user.id, "WEB", id);
    if (action === "resume") await resumeRecurring(user.id, "WEB", id, backfill);
    if (action === "end") await endRecurring(user.id, "WEB", id);
    revalidatePath("/recurring");
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function changeRateAction(id: string, amount: string, effectiveFrom: string, applyToPosted: boolean) {
  const { user } = await requireUser();
  try {
    await addRate(user.id, "WEB", id, { amount, effectiveFrom, applyToPosted });
    revalidatePath("/recurring");
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function askAction(question: string) {
  const { user } = await requireUser();
  try {
    return { ok: true as const, ...(await askQuestion(user.id, question)) };
  } catch (error) {
    return fail(error);
  }
}

export async function reviewAction() {
  const { user } = await requireUser();
  try {
    const insight = await generateMonthlyReview(user.id);
    revalidatePath("/insights");
    return { ok: true as const, id: insight.id };
  } catch (error) {
    return fail(error);
  }
}

export async function taxReviewAction(year: number) {
  const { user } = await requireUser();
  try {
    const result = await runTaxReview(user.id, year);
    revalidatePath("/taxes");
    return { ok: true as const, body: result.insight.bodyMd, findings: result.findings };
  } catch (error) {
    return fail(error);
  }
}

export async function applyTaxAction(expenseId: string, patch: { taxTag?: ExpenseWrite["taxTag"]; entity?: string }) {
  const { user } = await requireUser();
  try {
    await updateExpense({ userId: user.id, actor: "WEB", id: expenseId, input: patch });
    revalidatePath("/taxes");
    revalidatePath("/expenses");
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function pairingAction(formData: FormData) {
  const { user } = await requireUser();
  const scopes = SCOPES.filter((scope) => formData.get(scope) === "on");
  const created = await createPairingCode(user.id, scopes.length ? scopes : [...SCOPES]);
  return { code: created.code, expiresAt: created.expiresAt.toISOString(), message: created.message };
}

export async function manualKeyAction(formData: FormData) {
  const { user } = await requireUser();
  const scopes = SCOPES.filter((scope) => formData.get(`manual-${scope}`) === "on");
  const created = await createManualKey(user.id, "OpenClaw", scopes.length ? scopes : [...SCOPES]);
  return { apiKey: created.apiKey, prefix: created.prefix };
}

export async function revokeKeyAction(id: string) {
  const { user } = await requireUser();
  await revokeKey(user.id, id);
  revalidatePath("/settings");
}

export async function accountAction(formData: FormData) {
  const { user } = await requireUser();
  const timezone = String(formData.get("timezone") ?? user.timezone);
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    redirect("/settings?error=timezone");
  }
  const dollars = String(formData.get("largeAmount") ?? "");
  const largeAmountCents = dollars ? parseDollarsToCents(dollars) : user.largeAmountCents;
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("nextPassword") ?? "");
  if (next) {
    if (!(await checkPassword(user.id, current))) redirect("/settings?error=password");
    if (next.length < 10) redirect("/settings?error=short");
    await updateAccount(user.id, { timezone, largeAmountCents, nextPassword: next });
  } else {
    await updateAccount(user.id, { timezone, largeAmountCents });
  }
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function categoryAction(formData: FormData) {
  const { user } = await requireUser();
  const db = forUser(user.id);
  const intent = String(formData.get("intent"));
  const id = String(formData.get("id") ?? "");
  if (intent === "rename") await db.category.update({ where: { id }, data: { name: String(formData.get("name") ?? "").trim() } });
  if (intent === "archive") await db.category.update({ where: { id }, data: { archivedAt: new Date() } });
  if (intent === "defaults") {
    const essential = String(formData.get("essential"));
    await db.category.update({
      where: { id },
      data: {
        essentialDefault: essential === "unset" ? null : essential === "true",
        taxTagDefault: (String(formData.get("taxTag") || "") || null) as never,
      },
    });
  }
  if (intent === "merge") {
    const into = String(formData.get("into"));
    await db.expense.updateMany({ where: { categoryId: id }, data: { categoryId: into } });
    await db.category.update({ where: { id }, data: { archivedAt: new Date() } });
  }
  revalidatePath("/settings");
}

export async function simpleSettingAction(formData: FormData) {
  const { user } = await requireUser();
  const db = forUser(user.id);
  const kind = String(formData.get("kind"));
  const name = String(formData.get("name") ?? "").trim();
  if (kind === "payment") await db.paymentMethod.create({ data: { name, type: String(formData.get("type") ?? "OTHER") as never, last4: String(formData.get("last4") ?? "").slice(0, 4) || null } });
  if (kind === "entity") {
    if (formData.get("default") === "on") await db.entity.updateMany({ data: { isDefault: false } });
    await db.entity.create({ data: { name, isDefault: formData.get("default") === "on" } });
  }
  if (kind === "merchant-merge") {
    const from = String(formData.get("from"));
    const into = String(formData.get("into"));
    const source = await db.merchant.findFirst({ where: { id: from } });
    const target = await db.merchant.findFirst({ where: { id: into } });
    if (source && target) {
      await db.expense.updateMany({ where: { merchantId: from }, data: { merchantId: into } });
      await db.merchant.update({ where: { id: into }, data: { aliases: Array.from(new Set([...target.aliases, ...source.aliases, source.name.toLowerCase()])) } });
      await db.merchant.delete({ where: { id: from } });
    }
  }
  revalidatePath("/settings");
}

export async function importAction(formData: FormData) {
  const { user } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, message: "Choose the spreadsheet." };
  const report = await importWorkbook(Buffer.from(await file.arrayBuffer()), {
    email: user.email,
    dryRun: formData.get("dryRun") === "on",
    createRecurring: formData.get("createRecurring") === "on",
  });
  revalidatePath("/expenses");
  return { ok: true as const, report };
}
