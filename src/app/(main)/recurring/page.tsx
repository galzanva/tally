import { RecurringBoard } from "@/components/recurring-board";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";
import { committedTotals, listRecurring, recurringPostings } from "@/lib/recurring";

export default async function RecurringPage() {
  const { user } = await requireUser();
  const items = await listRecurring(user.id);
  const totals = committedTotals(items);
  const db = forUser(user.id);
  const categories = await db.category.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } });
  const withPostings = await Promise.all(items.map(async (item) => ({ ...item, postings: await recurringPostings(user.id, item.id) })));
  return <RecurringBoard items={withPostings} currency={user.currency} monthlyCents={totals.monthlyCents} yearlyCents={totals.yearlyCents} categories={categories.map((item) => item.name)} />;
}
