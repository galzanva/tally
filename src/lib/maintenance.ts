import { generateMonthlyReview } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { removeStored } from "@/lib/receipts";
import { runDueRecurring } from "@/lib/recurring";

export async function runDailyJobs() {
  const users = await prisma.user.findMany({ select: { id: true } });
  let posted = 0;
  for (const user of users) {
    const result = await runDueRecurring(user.id, "CRON");
    posted += result.posted;
  }
  const purged = await purgeDeleted();
  return { posted, purged };
}

export async function runMonthlyReviews() {
  const users = await prisma.user.findMany({ select: { id: true } });
  const results: { userId: string; period?: string; message?: string }[] = [];
  for (const user of users) {
    try {
      const insight = await generateMonthlyReview(user.id);
      results.push({ userId: user.id, period: insight.periodKey });
    } catch (error) {
      results.push({ userId: user.id, message: error instanceof Error ? error.message : "skipped" });
    }
  }
  return results;
}

export async function purgeDeleted() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const old = await prisma.expense.findMany({ where: { deletedAt: { lt: cutoff } }, include: { receipts: true } });
  for (const expense of old) {
    for (const receipt of expense.receipts) await removeStored(receipt.blobPathname);
    await prisma.expense.delete({ where: { id: expense.id } });
  }
  return old.length;
}
