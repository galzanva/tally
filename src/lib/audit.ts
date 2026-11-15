import type { Actor, Prisma } from "@prisma/client";
import { forUser } from "@/lib/db";

export async function writeAudit(
  userId: string,
  entry: {
    actor: Actor;
    apiKeyId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    diff?: Prisma.InputJsonValue;
  },
) {
  const db = forUser(userId);
  await db.auditLog.create({
    data: {
      actor: entry.actor,
      apiKeyId: entry.apiKeyId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      diff: entry.diff,
    },
  });
}
