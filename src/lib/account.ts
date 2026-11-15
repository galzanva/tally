import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function checkPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return verifyPassword(password, user.passwordHash);
}

export async function updateAccount(userId: string, input: { timezone: string; largeAmountCents: number; nextPassword?: string }) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      timezone: input.timezone,
      largeAmountCents: input.largeAmountCents,
      ...(input.nextPassword ? { passwordHash: await hashPassword(input.nextPassword) } : {}),
    },
  });
}
