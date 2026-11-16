import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { forUser, isUniqueConflict } from "@/lib/db";
import { AppError } from "@/lib/errors";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

export function contentTypeForUpload(type: string, filename: string) {
  const given = type === "image/jpg" ? "image/jpeg" : type;
  if (ALLOWED.has(given)) return given;
  const name = filename.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return given || "application/octet-stream";
}

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

function blobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token || null;
}

function receiptPath(userId: string, bytes: Buffer, contentType: string) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `receipts/${userId}/${year}/${month}/${hash.slice(0, 16)}-${randomBytes(4).toString("hex")}.${extensionFor(contentType)}`;
}

async function writeStored(userId: string, bytes: Buffer, contentType: string) {
  const pathname = receiptPath(userId, bytes, contentType);
  const token = blobToken();
  if (token) {
    try {
      const blob = await put(pathname, bytes, { access: "private", token, contentType, addRandomSuffix: false });
      return blob.pathname;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/private/i.test(message)) {
        throw new AppError(500, "server", "The Blob store is not accepting private files. In Vercel, open the Blob store and allow private access.");
      }
      throw new AppError(500, "server", "The receipt could not be saved to Blob storage.");
    }
  }
  const full = path.join(process.cwd(), ".data", "blobs", pathname);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return `local:${pathname}`;
}

export async function readStored(pathname: string) {
  if (pathname.startsWith("local:")) {
    try {
      return await readFile(path.join(process.cwd(), ".data", "blobs", pathname.slice("local:".length)));
    } catch {
      return null;
    }
  }
  const token = blobToken();
  if (!token) return null;
  const result = await get(pathname, { access: "private", token, useCache: false }).catch(() => get(pathname, { access: "public", token, useCache: false }));
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

function receiptHeaders(contentType: string) {
  return {
    "Cache-Control": "private, no-cache",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  };
}

export async function openStored(pathname: string, contentType: string) {
  if (pathname.startsWith("local:")) {
    const bytes = await readStored(pathname);
    if (!bytes) return null;
    return new Response(new Uint8Array(bytes), { headers: receiptHeaders(contentType) });
  }
  const token = blobToken();
  if (!token) return null;
  const result = await get(pathname, { access: "private", token, useCache: false }).catch(() => get(pathname, { access: "public", token, useCache: false }));
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream, { headers: receiptHeaders(result.blob.contentType || contentType) });
}

export async function removeStored(pathname: string) {
  if (pathname.startsWith("local:")) {
    await unlink(path.join(process.cwd(), ".data", "blobs", pathname.slice("local:".length))).catch(() => undefined);
    return;
  }
  const token = blobToken();
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
  const blobPathname = await writeStored(userId, input.bytes, input.contentType);
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
