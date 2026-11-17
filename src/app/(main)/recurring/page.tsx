import { RecurringBoard } from "@/components/recurring-board";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";
import { committedTotals, listRecurring, recurringPostingsFor } from "@/lib/recurring";

export default async function RecurringPage() {
  const { user } = await requireUser();
  const items = await listRecurring(user.id);
  const totals = committedTotals(items);
  const db = forUser(user.id);
  const [categories, postings] = await Promise.all([
    db.category.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    recurringPostingsFor(user.id, items.map((item) => item.id), user.currency),
  ]);
  const withPostings = items.map((item) => ({ ...item, postings: postings.get(item.id) ?? [] }));
  return <RecurringBoard items={withPostings} currency={user.currency} monthlyCents={totals.monthlyCents} yearlyCents={totals.yearlyCents} categories={categories.map((item) => item.name)} />;
}
