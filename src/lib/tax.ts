import { dateOnlyToYmd, resolvePeriod, ymdToDate } from "@/lib/dates";
import { forUser, prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { chat, llmConfigured } from "@/lib/llm";
import { formatMoney } from "@/lib/money";
import { readStored } from "@/lib/receipts";
import { slugPart } from "@/lib/text";
import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";

const TAX_CATEGORIES = new Set(["Health & Medical", "Taxes", "Software & AI", "Trading", "Auto"]);
const BUSINESS_WORDS = ["hosting", "domain", "vercel", "aws", "openai", "anthropic", "chatgpt", "cursor", "github", "trading", "topstep", "vpn", "software"];

export type TaxFinding = {
  expenseId: string;
  occurredOn: string;
  merchant: string;
  amountFormatted: string;
  reason: string;
  suggestedTaxTag?: string;
  suggestedEntity?: string;
};

export async function taxMatrix(userId: string, year: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const range = resolvePeriod({ period: String(year) }, user.timezone);
  const db = forUser(userId);
  const [rows, entities] = await Promise.all([
    db.expense.findMany({
      where: { status: "POSTED", occurredOn: { gte: ymdToDate(range.from), lte: ymdToDate(range.to) } },
      select: {
        id: true,
        occurredOn: true,
        amountCents: true,
        taxTag: true,
        description: true,
        notes: true,
        entityId: true,
        entity: { select: { name: true } },
        category: { select: { name: true } },
        merchant: { select: { name: true } },
        receipts: { select: { id: true, contentType: true } },
      },
    }),
    db.entity.findMany({ orderBy: { name: "asc" } }),
  ]);
  const tags = ["UNREVIEWED", "NONE", "BUSINESS", "MEDICAL", "CHARITABLE", "TAX_PAYMENT", "PROPERTY_TAX", "POSSIBLY_DEDUCTIBLE"];
  const matrix = entities.map((entity) => ({
    entity: entity.name,
    entityId: entity.id,
    cells: tags.map((tag) => ({
      taxTag: tag,
      totalCents: rows.filter((row) => row.entityId === entity.id && row.taxTag === tag).reduce((sum, row) => sum + row.amountCents, 0),
    })),
  }));
  const payments = rows.filter((row) => row.taxTag === "TAX_PAYMENT" || row.category?.name === "Taxes");
  const missing = rows.filter((row) => (row.taxTag === "BUSINESS" || row.entity?.name === "Galzan VA LLC" || row.entity?.name === "Trading") && row.receipts.length === 0 && row.taxTag !== "NONE");
  return {
    year,
    currency: user.currency,
    tags,
    matrix: matrix.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ ...cell, totalFormatted: formatMoney(cell.totalCents, user.currency) })),
    })),
    payments: payments.map((row) => ({
      id: row.id,
      occurredOn: dateOnlyToYmd(row.occurredOn),
      merchant: row.merchant?.name ?? row.description,
      amountFormatted: formatMoney(row.amountCents, user.currency),
      taxTag: row.taxTag,
    })),
    missing: missing.map((row) => ({
      id: row.id,
      occurredOn: dateOnlyToYmd(row.occurredOn),
      merchant: row.merchant?.name ?? row.description,
      entity: row.entity?.name ?? "",
      amountFormatted: formatMoney(row.amountCents, user.currency),
    })),
    rows,
  };
}

export async function taxFindings(userId: string, year: number): Promise<TaxFinding[]> {
  const packed = await taxMatrix(userId, year);
  const findings: TaxFinding[] = [];
  for (const row of packed.rows) {
    const name = row.merchant?.name ?? row.description;
    const text = `${row.description} ${row.notes ?? ""} ${name}`.toLowerCase();
    const base = { expenseId: row.id, occurredOn: dateOnlyToYmd(row.occurredOn), merchant: name, amountFormatted: formatMoney(row.amountCents, packed.currency) };
    if (row.taxTag === "UNREVIEWED" && TAX_CATEGORIES.has(row.category?.name ?? "")) {
      const suggested =
        row.category?.name === "Health & Medical" ? "MEDICAL" : row.category?.name === "Taxes" ? "TAX_PAYMENT" : row.category?.name === "Auto" && text.includes("property tax") ? "PROPERTY_TAX" : row.category?.name === "Trading" ? "BUSINESS" : "POSSIBLY_DEDUCTIBLE";
      findings.push({ ...base, reason: `${row.category?.name} is still unreviewed.`, suggestedTaxTag: suggested, suggestedEntity: row.category?.name === "Trading" ? "Trading" : row.category?.name === "Software & AI" ? "Galzan VA LLC" : undefined });
    }
    if (row.entity?.name === "Personal" && BUSINESS_WORDS.some((word) => text.includes(word))) {
      findings.push({ ...base, reason: "This is on Personal but it looks like a business cost.", suggestedEntity: "Galzan VA LLC", suggestedTaxTag: "POSSIBLY_DEDUCTIBLE" });
    }
  }
  return findings;
}

export async function runTaxReview(userId: string, year: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const findings = await taxFindings(userId, year);
  let body = findings.map((item) => `- ${item.occurredOn} ${item.merchant} ${item.amountFormatted}: ${item.reason}`).join("\n");
  if (!body) body = "Nothing stood out for this year.";
  if (llmConfigured()) {
    try {
      const result = await chat({
        userId,
        timeZone: user.timezone,
        cap: user.aiDailyTokenCap,
        feature: "tax_review",
        messages: [
          { role: "system", content: "Turn these tax-organizer findings into a short markdown checklist. Do not invent amounts or items. Do not give tax advice. Each line should stay tied to the expense. End with: Organizer, not tax advice. Confirm treatment with your preparer." },
          { role: "user", content: JSON.stringify(findings) },
        ],
      });
      if (result.content) body = result.content;
    } catch (error) {
      if (error instanceof AppError && error.code === "ai_cap") throw error;
    }
  }
  if (!body.includes("Organizer, not tax advice.")) body += "\n\nOrganizer, not tax advice. Confirm treatment with your preparer.";
  const db = forUser(userId);
  const insight = await db.insight.upsert({
    where: { userId_kind_periodKey: { userId, kind: "TAX_REVIEW", periodKey: String(year) } },
    create: { kind: "TAX_REVIEW", periodKey: String(year), title: `${year} tax review`, bodyMd: body, facts: { findings } },
    update: { title: `${year} tax review`, bodyMd: body, facts: { findings } },
  });
  return { insight, findings };
}

export async function taxPackZip(userId: string, year: number) {
  const packed = await taxMatrix(userId, year);
  const selected = packed.rows.filter((row) => row.taxTag !== "NONE" || row.entity?.name !== "Personal");
  const header = ["date", "amount", "description", "merchant", "category", "entity", "taxTag", "receipts"];
  const lines = [header.join(",")];
  for (const row of selected) {
    const cells = [
      dateOnlyToYmd(row.occurredOn),
      (row.amountCents / 100).toFixed(2),
      row.description,
      row.merchant?.name ?? "",
      row.category?.name ?? "",
      row.entity?.name ?? "",
      row.taxTag,
      String(row.receipts.length),
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`);
    lines.push(cells.join(","));
  }
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const stream = new PassThrough();
  archive.pipe(stream);
  archive.append(lines.join("\n"), { name: `tax-pack-${year}.csv` });
  const db = forUser(userId);
  for (const row of selected) {
    const receipts = await db.receipt.findMany({ where: { expenseId: row.id } });
    let index = 0;
    for (const receipt of receipts) {
      const bytes = await readStored(receipt.blobPathname);
      if (!bytes) continue;
      index += 1;
      const ext = receipt.contentType === "application/pdf" ? "pdf" : receipt.contentType === "image/png" ? "png" : receipt.contentType === "image/webp" ? "webp" : receipt.contentType.includes("heic") ? "heic" : "jpg";
      const name = `${dateOnlyToYmd(row.occurredOn)}_${slugPart(row.merchant?.name ?? row.description)}_${(row.amountCents / 100).toFixed(2)}${index > 1 ? `_${index}` : ""}.${ext}`;
      archive.append(bytes, { name: `receipts/${name}` });
    }
  }
  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    archive.on("error", reject);
  });
  await archive.finalize();
  return { bytes: await done, filename: `tally-tax-pack-${year}.zip` };
}
