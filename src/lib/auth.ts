import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "tally_session";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const argon = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return hash(password, argon);
}

export async function verifyPassword(password: string, passwordHash: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  currency: string;
  largeAmountCents: number;
  aiDailyTokenCap: number;
};

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
  await prisma.session.create({
    data: { userId, tokenHash: hashSessionToken(token), userAgent: userAgent ?? null, expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSession(): Promise<{ user: SessionUser } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const { user } = session;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      currency: user.currency,
      largeAmountCents: user.largeAmountCents,
      aiDailyTokenCap: user.aiDailyTokenCap,
    },
  };
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  jar.delete(SESSION_COOKIE);
}
