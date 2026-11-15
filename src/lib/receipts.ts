import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { forUser, isUniqueConflict } from "@/lib/db";
import { AppError } from "@/lib/errors";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

export function extensionFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic" || contentType === "image/heif") return "heic";
  if (contentType === "application/pdf") return "pdf";
  return "jpg";
}

export function assertReceiptFile(contentType: string, size: number, maxBytes: number) {
  if (!ALLOWED.has(contentType)) {
    throw new AppError(400, "validation", "Receipts can be a JPEG, PNG, WEBP, HEIC, or PDF.");
  }
  if (size > maxBytes) {
    throw new AppError(413, "payload_too_large", `That file is over the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
  }
}

async function writeStored(bytes: Buffer, contentType: string) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const pathname = `receipts/${hash.slice(0, 16)}-${randomBytes(6).toString("hex")}.${extensionFor(contentType)}`;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const blob = await put(pathname, bytes, { access: "private", token, contentType, addRandomSuffix: false });
      return blob.pathname;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/private/i.test(message)) throw error;
      const blob = await put(`${pathname}`, bytes, { access: "public", token, contentType, addRandomSuffix: true });
      return blob.pathname;
    }
  }
  const relative = pathname;
  const full = path.join(process.cwd(), ".data", "blobs", relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return `local:${relative}`;
}

export async function readStored(pathname: string) {
  if (pathname.startsWith("local:")) {
    try {
      return await readFile(path.join(process.cwd(), ".data", "blobs", pathname.slice("local:".length)));
    } catch {
      return null;
    }
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const result = await get(pathname, { access: "private", token }).catch(() => get(pathname, { access: "public", token }));
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function removeStored(pathname: string) {
  if (pathname.startsWith("local:")) {
    await unlink(path.join(process.cwd(), ".data", "blobs", pathname.slice("local:".length))).catch(() => undefined);
    return;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  await del(pathname, { token }).catch(() => undefined);
}

export async function saveReceipt(userId: string, input: { bytes: Buffer; contentType: string; expenseId?: string | null }) {
  assertReceiptFile(input.contentType, input.bytes.length, input.expenseId ? 10 * 1024 * 1024 : 10 * 1024 * 1024);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const db = forUser(userId);
  const existing = await db.receipt.findFirst({ where: { sha256 } });
  if (existing) {
    if (input.expenseId && !existing.expenseId) {
      return db.receipt.update({ where: { id: existing.id }, data: { expenseId: input.expenseId } });
    }
    return existing;
  }
  const blobPathname = await writeStored(input.bytes, input.contentType);
  try {
    return await db.receipt.create({
      data: {
        expenseId: input.expenseId ?? null,
        blobPathname,
        contentType: input.contentType,
        sizeBytes: input.bytes.length,
        sha256,
      },
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const again = await db.receipt.findFirst({ where: { sha256 } });
    if (again) return again;
    throw error;
  }
}

export function publicReceipt(receipt: { id: string; contentType: string; sizeBytes: number; createdAt: Date; expenseId: string | null }) {
  return {
    receiptId: receipt.id,
    contentType: receipt.contentType,
    sizeBytes: receipt.sizeBytes,
    expenseId: receipt.expenseId,
    createdAt: receipt.createdAt.toISOString(),
  };
}
