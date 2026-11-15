import { InsightsBoard } from "@/components/insights-board";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";

export default async function InsightsPage() {
  const { user } = await requireUser();
  const db = forUser(user.id);
  const reviews = await db.insight.findMany({ where: { kind: "MONTHLY_REVIEW" }, orderBy: { periodKey: "desc" } });
  return <InsightsBoard reviews={reviews.map((review) => ({ id: review.id, title: review.title, bodyMd: review.bodyMd, periodKey: review.periodKey, facts: review.facts }))} />;
}
