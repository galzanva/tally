import { prisma } from "@/lib/db";

export async function hitRateLimit(key: string, limit: number, windowMs: number) {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const id = `${key}:${windowStart.toISOString()}`;
  const row = await prisma.rateLimit.upsert({
    where: { key: id },
    create: { key: id, count: 1, windowStart },
    update: { count: { increment: 1 } },
  });
  const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000));
  if (row.count > limit) return { ok: false as const, retryAfter };
  return { ok: true as const, retryAfter };
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
