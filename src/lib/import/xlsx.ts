import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { TaxTag } from "@prisma/client";
import { dateOnlyToYmd, todayYmd, ymdToDate } from "@/lib/dates";
import { forUser, isUniqueConflict, prisma } from "@/lib/db";
import { parseDollarsToCents } from "@/lib/money";
import { planRecurring, type RecurringCharge } from "@/lib/recurring/plan";
import { canonicalMerchantName, maskCardNumbers, normalizeMerchant } from "@/lib/text";

type Raw = Record<string, unknown>;

export type ImportReport = {
  read: number;
  imported: number;
  flagged: number;
  skipped: number;
  unmapped: { value: string; count: number }[];
  tabs: { tab: string; sheetCents: number; importedCents: number }[];
  recurring: number;
};

const mapPath = path.join(process.cwd(), "scripts", "category-map.json");

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value == null || typeof value !== "object") return value ?? null;
  if (value instanceof Date) return value;
  if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return cellValue(value.text as ExcelJS.CellValue);
  if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
  return null;
}

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return "";
  return String(value).trim();
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateOnlyToYmd(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return dateOnlyToYmd(new Date(epoch + Math.round(value) * 86_400_000));
  }
  const raw = text(value);
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (us) return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  return null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const raw = text(value).replace(/[$,]/g, "");
  if (!raw) return null;
  try {
    return parseDollarsToCents(raw);
  } catch {
    return null;
  }
}

function truthy(value: unknown) {
  const raw = text(value).toLowerCase();
  if (["yes", "true", "y"].includes(raw)) return true;
  if (["no", "false", "n"].includes(raw)) return false;
  if (raw === "variable") return "variable" as const;
  return null;
}

function shifted(row: Raw) {
  const notes = text(row.notes).toUpperCase();
  const essential = row.essential;
  const numeric = typeof essential === "number" || (typeof essential === "string" && /^-?\d+(\.\d+)?$/.test(essential.trim()));
  return notes === "YES" || notes === "NO" || numeric;
}

function repair(row: Raw): { row: Raw; shifted: boolean } {
  if (!shifted(row)) return { row, shifted: false };
  return {
    shifted: true,
    row: {
      ...row,
      notes: row.receiptLink,
      recurring: row.notes,
      essential: row.recurring,
      monthlyFee: row.essential,
      active: row.monthlyFee,
      receiptLink: null,
    },
  };
}

function paymentFromNotes(notes: string, methods: { id: string; name: string }[]) {
  const rules = [
    { pattern: /bofa debit|bank of america|card ending 2392|\b2392\b/i, name: "BofA debit" },
    { pattern: /capital one|\b6602\b/i, name: "Capital One credit" },
    { pattern: /\bzelle\b/i, name: "Zelle" },
    { pattern: /\bcash\b/i, name: "Cash" },
  ];
  for (const rule of rules) {
    if (rule.pattern.test(notes)) {
      const method = methods.find((item) => item.name === rule.name);
      const cleaned = notes
        .replace(rule.pattern, " ")
        .replace(/\b(?:debit\s+|credit\s+)?card\b/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
        .replace(/^\((.*)\)$/, "$1")
        .trim();
      return { paymentMethodId: method?.id ?? null, notes: cleaned };
    }
  }
  return { paymentMethodId: null, notes };
}

export async function importWorkbook(source: string | Buffer, options: { email: string; dryRun: boolean; createRecurring: boolean }): Promise<ImportReport> {
  const user = await prisma.user.findUnique({ where: { email: options.email.toLowerCase() } });
  if (!user) throw new Error(`No user for ${options.email}. Run pnpm user:create first.`);
  const db = forUser(user.id);
  const [categories, methods, entities, mapFile] = await Promise.all([
    db.category.findMany(),
    db.paymentMethod.findMany(),
    db.entity.findMany(),
    readFile(mapPath, "utf8"),
  ]);
  const categoryMap = JSON.parse(mapFile) as Record<string, string>;
  const lookup = new Map(Object.entries(categoryMap).map(([key, value]) => [key.toLowerCase(), value]));
  const byName = new Map(categories.map((category) => [category.name, category]));
  const personal = entities.find((entity) => entity.isDefault) ?? entities.find((entity) => entity.name === "Personal");
  let llc = entities.find((entity) => entity.name === "Galzan VA LLC");
  if (!llc && !options.dryRun) {
    llc = await db.entity.create({ data: { name: "Galzan VA LLC" } });
    entities.push(llc);
  }
  const trading = entities.find((entity) => entity.name === "Trading");
  if (!personal) throw new Error("Personal entity is missing.");

  const workbook = new ExcelJS.Workbook();
  if (typeof source === "string") await workbook.xlsx.readFile(source);
  else await workbook.xlsx.load(source as unknown as ExcelJS.Buffer);

  const report: ImportReport = { read: 0, imported: 0, flagged: 0, skipped: 0, unmapped: [], tabs: [], recurring: 0 };
  const unmapped = new Map<string, number>();
  const prepared: {
    tab: string;
    importRef: string;
    occurredOn: string;
    amountCents: number;
    description: string;
    merchantName: string;
    categoryId: string;
    entityId: string;
    paymentMethodId: string | null;
    taxTag: TaxTag;
    essential: boolean | null;
    notes: string | null;
    needsReview: boolean;
    reviewReason: string | null;
    recurring: boolean;
    variable: boolean;
    monthlyFeeCents: number | null;
    active: boolean;
  }[] = [];

  for (const sheet of workbook.worksheets) {
    if (!/^Q[1-4]-2026$/i.test(sheet.name) && !/^Q[1-4]\s*2026$/i.test(sheet.name)) continue;
    const header = sheet.getRow(1);
    const columns = new Map<string, number>();
    header.eachCell((cell, index) => {
      const name = text(cellValue(cell.value)).toLowerCase().replace(/\?/g, "").trim();
      columns.set(name, index);
    });
    const pick = (row: ExcelJS.Row, ...names: string[]) => {
      for (const name of names) {
        const index = columns.get(name);
        if (index) return cellValue(row.getCell(index).value);
      }
      return null;
    };
    const readRaw = (row: ExcelJS.Row): Raw => ({
      date: pick(row, "date"),
      total: pick(row, "total"),
      items: pick(row, "items", "item"),
      category: pick(row, "category"),
      merchant: pick(row, "merchant"),
      receiptLink: pick(row, "receipt link", "receipt"),
      notes: pick(row, "notes", "note"),
      recurring: pick(row, "recurring"),
      essential: pick(row, "essential"),
      monthlyFee: pick(row, "monthly fee", "monthlyfee"),
      active: pick(row, "active"),
    });
    let sheetCents = 0;
    let importedCents = 0;
    let consumeRow = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const raw = readRaw(row);
      const blank = [raw.date, raw.total, raw.items, raw.category, raw.merchant].every((value) => text(value) === "" && !(value instanceof Date) && typeof value !== "number");
      if (blank) return;
      report.read += 1;
      const listedCents = parseAmount(raw.total);
      if (listedCents != null) sheetCents += listedCents;
      if (rowNumber === consumeRow) {
        report.skipped += 1;
        return;
      }
      let split = false;
      const next = readRaw(sheet.getRow(rowNumber + 1));
      if (parseDate(raw.date) && listedCents == null && text(raw.total) && parseAmount(next.total) != null && !parseDate(next.date) && text(next.date)) {
        const category = text(raw.items);
        const description = [text(raw.category), text(next.date)].filter(Boolean).join(", ");
        raw.merchant = text(raw.merchant) || text(raw.total);
        raw.category = category;
        raw.items = description || category;
        raw.total = next.total;
        if (!text(raw.recurring)) raw.recurring = next.items;
        if (!text(raw.essential)) raw.essential = next.category;
        consumeRow = rowNumber + 1;
        split = true;
      }
      const amountCents = parseAmount(raw.total);
      const fixed = repair(raw);
      const occurredOn = parseDate(fixed.row.date);
      if (!occurredOn || amountCents == null) {
        report.skipped += 1;
        return;
      }
      const reasons: string[] = [];
      if (fixed.shifted) reasons.push("repaired column shift");
      if (split) reasons.push("repaired split row");
      const originalCategory = text(fixed.row.category);
      const itemsText = text(fixed.row.items);
      const merchantText = text(fixed.row.merchant);
      const detail = `${originalCategory} ${itemsText} ${merchantText} ${text(fixed.row.notes)}`;
      let mapped = lookup.get(originalCategory.toLowerCase()) ?? null;
      let taxTag: TaxTag = "UNREVIEWED";
      if (/property tax/i.test(originalCategory)) {
        mapped = "Auto";
        taxTag = "PROPERTY_TAX";
      } else if (mapped === "Taxes") taxTag = "TAX_PAYMENT";
      if (/haircut|salon/i.test(detail)) mapped = "Supplements & Personal Care";
      if (/^office supplies$/i.test(originalCategory) && /\bwater\b/i.test(itemsText)) mapped = "Groceries";
      if (/topstep/i.test(detail)) {
        mapped = "Trading";
        if (!merchantText || /^trading$/i.test(merchantText)) fixed.row.merchant = "Topstep";
      }
      if (/virginia scc|llc licens/i.test(detail)) mapped = mapped ?? "Other";
      if (/eztaxreturn|tax preparation/i.test(detail)) {
        mapped = "Taxes";
        taxTag = "UNREVIEWED";
      }
      if (/\blease\b/i.test(itemsText)) {
        mapped = "Auto";
        if (/tesla/i.test(detail)) fixed.row.merchant = "Tesla Finance";
      }
      if (/property tax/i.test(detail)) {
        mapped = "Auto";
        taxTag = "PROPERTY_TAX";
      }
      if (/youtube premium/i.test(detail)) fixed.row.merchant = "YouTube Premium";
      if (/car insurance|auto insurance/i.test(itemsText)) mapped = "Auto";
      if (/boost mobile/i.test(merchantText) || /phone service|phone bill/i.test(itemsText)) mapped = "Utilities";
      if (/cox communications/i.test(merchantText) || /internet\/cable/i.test(itemsText)) mapped = "Utilities";
      if (/\bcursor\b|ai ide/i.test(`${merchantText} ${itemsText}`)) mapped = "Software & AI";
      if (!mapped) {
        reasons.push("unmapped category");
        unmapped.set(originalCategory || "(blank)", (unmapped.get(originalCategory || "(blank)") ?? 0) + 1);
        mapped = "Other";
      }
      const category = byName.get(mapped) ?? byName.get("Other");
      if (!category) {
        report.skipped += 1;
        return;
      }
      const items = text(fixed.row.items);
      const merchantName = canonicalMerchantName(text(fixed.row.merchant) || items || "Unknown");
      let notes = text(fixed.row.notes);
      const pay = paymentFromNotes(notes, methods);
      notes = maskCardNumbers(pay.notes);
      const link = text(fixed.row.receiptLink);
      if (/^https?:\/\//i.test(link) && !notes.includes(link)) notes = [notes, link].filter(Boolean).join("\n");
      const blob = `${items} ${notes} ${merchantName}`;
      const business = /galzan\s*va|virginia scc|llc licens/i.test(blob) || merchantName === "DigitalOcean";
      const entityId = business ? llc?.id ?? personal.id : mapped === "Trading" ? trading?.id ?? personal.id : personal.id;
      const essentialFlag = truthy(fixed.row.essential);
      const recurringFlag = truthy(fixed.row.recurring);
      const activeFlag = truthy(fixed.row.active);
      const needsReview = reasons.length > 0;
      const importRef = createHash("sha1").update(`${sheet.name}|${rowNumber}|${occurredOn}|${amountCents}`).digest("hex");
      prepared.push({
        tab: sheet.name,
        importRef,
        occurredOn,
        amountCents,
        description: items || merchantName,
        merchantName,
        categoryId: category.id,
        entityId,
        paymentMethodId: pay.paymentMethodId,
        taxTag,
        essential: essentialFlag === "variable" ? null : essentialFlag,
        notes: notes || null,
        needsReview,
        reviewReason: reasons.join("; ") || null,
        recurring: recurringFlag === true || recurringFlag === "variable",
        variable: recurringFlag === "variable",
        monthlyFeeCents: parseAmount(fixed.row.monthlyFee),
        active: activeFlag !== false,
      });
      importedCents += amountCents;
      if (needsReview) report.flagged += 1;
      else report.imported += 1;
    });
    report.tabs.push({ tab: sheet.name, sheetCents, importedCents });
  }

  report.unmapped = [...unmapped.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  const categoryNameById = new Map([...byName.entries()].map(([name, category]) => [category.id, name]));
  const entityNameById = new Map(entities.map((entity) => [entity.id, entity.name]));
  const recurringCharges: RecurringCharge[] = prepared.map((row) => ({
    occurredOn: row.occurredOn,
    amountCents: row.amountCents,
    description: row.description,
    merchantName: row.merchantName,
    merchantKey: normalizeMerchant(row.merchantName),
    categoryId: row.categoryId,
    categoryName: categoryNameById.get(row.categoryId) ?? "Other",
    entityId: row.entityId,
    entityName: entityNameById.get(row.entityId) ?? "Personal",
    paymentMethodId: row.paymentMethodId,
    essential: row.essential,
  }));
  const recurringPlans = planRecurring(recurringCharges, todayYmd(user.timezone));
  if (options.dryRun) {
    report.recurring = recurringPlans.length;
    return report;
  }

  const merchants = await db.merchant.findMany();
  const merchantByAlias = new Map<string, string>();
  for (const merchant of merchants) {
    merchantByAlias.set(normalizeMerchant(merchant.name), merchant.id);
    for (const alias of merchant.aliases) merchantByAlias.set(alias, merchant.id);
  }

  for (const row of prepared) {
    const alias = normalizeMerchant(row.merchantName);
    let merchantId = merchantByAlias.get(alias);
    if (!merchantId) {
      const created = await db.merchant.create({ data: { name: row.merchantName, aliases: [alias] } });
      merchantId = String(created.id);
      merchantByAlias.set(alias, merchantId);
    }
    try {
      await db.expense.create({
        data: {
          occurredOn: ymdToDate(row.occurredOn),
          amountCents: row.amountCents,
          description: row.description.slice(0, 200),
          merchantId,
          categoryId: row.categoryId,
          paymentMethodId: row.paymentMethodId,
          entityId: row.entityId,
          taxTag: row.taxTag,
          essential: row.essential,
          notes: row.notes,
          source: "IMPORT",
          needsReview: row.needsReview,
          reviewReason: row.reviewReason,
          importRef: row.importRef,
        },
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }

  if (options.createRecurring) {
    for (const plan of recurringPlans) {
      const existing = await db.recurringExpense.findFirst({ where: { name: plan.name, entityId: plan.entityId } });
      if (existing) continue;
      await db.recurringExpense.create({
        data: {
          name: plan.name,
          merchantId: merchantByAlias.get(plan.merchantKey) ?? null,
          categoryId: plan.categoryId,
          paymentMethodId: plan.paymentMethodId,
          entityId: plan.entityId,
          taxTag: "UNREVIEWED",
          essential: plan.essential,
          frequency: plan.frequency,
          dayOfMonth: plan.dayOfMonth,
          monthOfYear: plan.monthOfYear,
          amountType: plan.amountType,
          status: plan.status,
          startOn: ymdToDate(plan.startOn),
          endOn: plan.endOn ? ymdToDate(plan.endOn) : null,
          nextRunOn: ymdToDate(plan.nextRunOn),
          rates: { create: plan.rates.map((rate) => ({ amountCents: rate.amountCents, effectiveFrom: ymdToDate(rate.effectiveFrom) })) },
        },
      });
      report.recurring += 1;
    }
  }
  return report;
}
