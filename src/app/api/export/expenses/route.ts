import { getSession } from "@/lib/auth";
import { listExpenses } from "@/lib/expenses";

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const url = new URL(request.url);
  const listed = await listExpenses(session.user.id, {
    period: url.searchParams.get("period") ?? "all",
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    merchant: url.searchParams.get("merchant") ?? undefined,
    entity: url.searchParams.get("entity") ?? undefined,
    paymentMethod: url.searchParams.get("paymentMethod") ?? undefined,
    taxTag: url.searchParams.get("taxTag") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    source: (url.searchParams.get("source") as "WEB" | "API" | "RECURRING" | "IMPORT" | null) ?? undefined,
    needsReview: url.searchParams.get("needsReview") === "1",
    hasReceipt: url.searchParams.get("hasReceipt") === "true" ? true : url.searchParams.get("hasReceipt") === "false" ? false : undefined,
    limit: 2000,
    cap: 2000,
  });
  const header = ["date", "amount", "description", "merchant", "category", "paymentMethod", "entity", "taxTag", "essential", "notes", "source", "status"];
  const lines = [header.join(",")];
  for (const expense of listed.expenses) {
    lines.push([
      expense.occurredOn,
      (expense.amountCents / 100).toFixed(2),
      expense.description,
      expense.merchant ?? "",
      expense.category,
      expense.paymentMethod ?? "",
      expense.entity,
      expense.taxTag,
      expense.essential == null ? "" : String(expense.essential),
      expense.notes ?? "",
      expense.source,
      expense.status,
    ].map(csvEscape).join(","));
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=tally-expenses.csv" } });
}
