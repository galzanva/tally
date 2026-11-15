import { ExpensesBoard } from "@/components/expenses-board";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";
import { listExpenses } from "@/lib/expenses";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireUser();
  const params = await searchParams;
  const query = {
    period: one(params.period) ?? "ytd",
    from: one(params.from),
    to: one(params.to),
    category: one(params.category),
    merchant: one(params.merchant),
    paymentMethod: one(params.paymentMethod),
    entity: one(params.entity),
    taxTag: one(params.taxTag),
    q: one(params.q),
    hasReceipt: one(params.hasReceipt),
    source: one(params.source),
    needsReview: one(params.needsReview),
    new: one(params.new),
    page: one(params.page),
  };
  const db = forUser(user.id);
  const [listed, categories, methods, entities, merchants] = await Promise.all([
    listExpenses(user.id, {
      ...query,
      hasReceipt: query.hasReceipt === "true" ? true : query.hasReceipt === "false" ? false : undefined,
      needsReview: query.needsReview === "1",
      source: query.source as "WEB" | "API" | "RECURRING" | "IMPORT" | undefined,
      page: Math.max(1, Number(query.page) || 1),
      pageSize: 40,
    }),
    db.category.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    db.entity.findMany({ orderBy: { name: "asc" } }),
    db.merchant.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <ExpensesBoard
      expenses={listed.expenses}
      categories={categories.map((item) => ({ id: item.id, name: item.name }))}
      methods={methods.map((item) => ({ id: item.id, name: item.name }))}
      entities={entities.map((item) => ({ id: item.id, name: item.name, isDefault: item.isDefault }))}
      merchants={merchants.map((item) => ({ id: item.id, name: item.name }))}
      currency={user.currency}
      query={query}
      largeAmountCents={user.largeAmountCents}
      page={listed.page}
      pageSize={listed.pageSize}
      total={listed.total}
    />
  );
}
