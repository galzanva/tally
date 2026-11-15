import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const db = forUser(session.user.id);
  const [categories, merchants, paymentMethods, entities, expenses, recurring, insights] = await Promise.all([
    db.category.findMany(),
    db.merchant.findMany(),
    db.paymentMethod.findMany(),
    db.entity.findMany(),
    db.expense.findMany({ include: { receipts: { select: { id: true, contentType: true, sizeBytes: true } } } }),
    db.recurringExpense.findMany({ include: { rates: true } }),
    db.insight.findMany(),
  ]);
  return Response.json({ categories, merchants, paymentMethods, entities, expenses, recurring, insights }, {
    headers: { "Content-Disposition": "attachment; filename=tally-export.json" },
  });
}
