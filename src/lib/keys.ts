import { createHmac, randomBytes } from "node:crypto";
import { writeAudit } from "@/lib/audit";
import { forUser, prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hitRateLimit } from "@/lib/rate-limit";
import { SCOPES, type Scope } from "@/lib/seed";
import { formatInZone } from "@/lib/dates";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function pepper() {
  const value = process.env.API_KEY_PEPPER;
  if (!value || value.length < 32) throw new AppError(500, "server", "API_KEY_PEPPER needs 32 or more random bytes.");
  return value;
}

export function hmacSecret(value: string) {
  return createHmac("sha256", pepper()).update(value).digest("hex");
}

function base62(size: number) {
  const bytes = randomBytes(size);
  let n = BigInt(`0x${bytes.toString("hex")}`);
  let out = "";
  while (n > 0n) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out || "0";
}

export function generateApiKey() {
  const key = `tly_${base62(32)}`;
  return { key, prefix: key.slice(0, 8), hash: hmacSecret(key) };
}

export function normalizePairingCode(code: string) {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function generatePairingCode() {
  const bytes = randomBytes(5);
  let n = BigInt(`0x${bytes.toString("hex")}`);
  let chars = "";
  for (let i = 0; i < 8; i++) {
    chars = CROCKFORD[Number(n % 32n)] + chars;
    n /= 32n;
  }
  const code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
  return { code, hash: hmacSecret(normalizePairingCode(code)) };
}

export function assertScopes(scopes: string[]): Scope[] {
  const unique = [...new Set(scopes)];
  if (unique.some((scope) => !SCOPES.includes(scope as Scope))) {
    throw new AppError(400, "validation", "Those scopes aren't recognized.");
  }
  return unique as Scope[];
}

export async function createPairingCode(userId: string, scopes: string[]) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "not_found", "That account doesn't exist.");
  const chosen = assertScopes(scopes.length ? scopes : [...SCOPES]);
  const { code, hash } = generatePairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const db = forUser(userId);
  await db.pairingCode.create({ data: { codeHash: hash, scopes: chosen, expiresAt } });
  return { code, expiresAt, scopes: chosen, message: setupMessage(code, expiresAt, user.timezone) };
}

export function appBaseUrl() {
  return process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function skillRules(base: string) {
  return `Fetch ${base}/api/v1/openapi.json and save these rules as a permanent skill called "tally-expenses" (the skill says where the key file is, but does not contain the key):
   - When I mention paying for something, a bill, or send a receipt photo: log an expense.
   - Every request uses Authorization: Bearer and the apiKey from ~/.openclaw/secrets/tally.json.
   - Every POST gets an Idempotency-Key header (a new UUID per Telegram message; reuse it on retries).
   - Receipt photo: POST /api/v1/receipts first, then POST /api/v1/expenses with receiptIds.
   - amount in dollars. Omit date unless I named a calendar day. Never send your own clock's date. Today is the today field from GET /api/v1/me, in my timezone.
   - Use names from GET /api/v1/categories and /payment-methods. If unsure, leave category out.
   - If the response has warnings, needsReview, or action "matched_recurring", tell me in one line.
   - If you get confirm_large_amount, ask me before resending with confirmLarge:true.
   - Spending questions: use GET /api/v1/summary or /api/v1/expenses and quote amountFormatted. Open-ended questions: POST /api/v1/ask.
   - Delete only when I say "delete", after naming the exact item back to me.
Call GET ${base}/api/v1/me and reply "Connected to Tally as {email}".`;
}

export function setupMessage(code: string, expiresAt: Date, timeZone: string) {
  const base = appBaseUrl();
  const expires = formatInZone(expiresAt, "MMM d, yyyy, h:mm a", timeZone);
  return `Connect to my Tally expense app. Do these steps now:

1. POST ${base}/api/v1/pair with JSON {"code":"${code}","client":"OpenClaw"}. The code expires at ${expires}.
2. Save the returned apiKey and baseUrl yourself to a private file in your own config folder (e.g. ~/.openclaw/secrets/tally.json, permissions 600). Read the key from that file whenever you call Tally. Never put the key in this chat, in the skill text, in memory notes, or in logs.
3. ${skillRules(base)}`;
}

export function existingKeyMessage(base = appBaseUrl()) {
  const root = base.replace(/\/$/, "");
  return `Connect to my Tally expense app. The API key already exists. Do these steps now:

1. Read baseUrl and apiKey from ~/.openclaw/secrets/tally.json. baseUrl is ${root}. If that file is missing, stop and ask me to create it on this machine with permissions 600. Never put the key in this chat, in the skill text, in memory notes, or in logs.
2. Send every Tally request to ${root} with header Authorization: Bearer and the apiKey from that file.
3. ${skillRules(root)}`;
}

export async function redeemPairingCode(code: string, client: string, ip: string) {
  const limit = await hitRateLimit(`pair:${ip}`, 5, 60_000);
  if (!limit.ok) throw new AppError(429, "rate_limited", "Too many pairing attempts. Wait a minute and try again.", { retryAfter: limit.retryAfter });
  const hash = hmacSecret(normalizePairingCode(code));
  const match = await prisma.pairingCode.findUnique({ where: { codeHash: hash }, include: { user: true } });
  if (!match) {
    const active = await prisma.pairingCode.findMany({ where: { usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } } });
    if (active.length === 1) {
      const updated = await prisma.pairingCode.update({ where: { id: active[0]!.id }, data: { attempts: { increment: 1 } } });
      if (updated.attempts >= 5) throw new AppError(401, "unauthorized", "That pairing code is locked. Generate a new one in Settings.");
    }
    throw new AppError(401, "unauthorized", "That pairing code isn't valid.");
  }
  if (match.attempts >= 5) throw new AppError(401, "unauthorized", "That pairing code is locked. Generate a new one in Settings.");
  if (match.usedAt || match.expiresAt.getTime() <= Date.now()) {
    await prisma.pairingCode.update({ where: { id: match.id }, data: { attempts: { increment: 1 } } });
    throw new AppError(401, "unauthorized", match.usedAt ? "That pairing code was already used." : "That pairing code has expired.");
  }
  const generated = generateApiKey();
  await prisma.$transaction([
    prisma.pairingCode.update({ where: { id: match.id }, data: { usedAt: new Date() } }),
    prisma.apiKey.create({
      data: { userId: match.userId, name: client.trim() || "OpenClaw", prefix: generated.prefix, hash: generated.hash, scopes: match.scopes },
    }),
  ]);
  const baseUrl = appBaseUrl();
  return { apiKey: generated.key, baseUrl, scopes: match.scopes, email: match.user.email };
}

export async function createManualKey(userId: string, name: string, scopes: string[]) {
  const chosen = assertScopes(scopes.length ? scopes : [...SCOPES]);
  const generated = generateApiKey();
  const db = forUser(userId);
  await db.apiKey.create({ data: { name: name.trim() || "OpenClaw", prefix: generated.prefix, hash: generated.hash, scopes: chosen } });
  return { apiKey: generated.key, prefix: generated.prefix, scopes: chosen };
}

export async function revokeKey(userId: string, id: string) {
  const db = forUser(userId);
  const key = await db.apiKey.findFirst({ where: { id } });
  if (!key) throw new AppError(404, "not_found", "That key doesn't exist.");
  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function deleteRevokedKey(userId: string, id: string) {
  const db = forUser(userId);
  const key = await db.apiKey.findFirst({ where: { id } });
  if (!key) throw new AppError(404, "not_found", "That key doesn't exist.");
  if (!key.revokedAt) throw new AppError(400, "validation", "Revoke the key before deleting it.");
  await writeAudit(userId, { actor: "WEB", action: "apikey.delete", targetType: "apiKey", targetId: id, diff: { name: key.name, prefix: key.prefix } });
  await db.apiKey.delete({ where: { id } });
}

export async function listKeys(userId: string) {
  const db = forUser(userId);
  const keys = await db.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  }));
}
