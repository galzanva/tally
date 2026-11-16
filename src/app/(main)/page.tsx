import Link from "next/link";
import { RecentExpenses } from "@/components/recent-expenses";
import { TrendChart } from "@/components/trend-chart";
import { EmptyState, Eyebrow, MoneyText, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { trailingMonths } from "@/lib/dates";
import { forUser } from "@/lib/db";
import { listExpenses } from "@/lib/expenses";
import { upcomingRecurring } from "@/lib/recurring";
import { getSummary } from "@/lib/summary";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireUser();
  const params = await searchParams;
  const period = one(params.period) ?? "this_month";
  const summary = await getSummary(user.id, { period, from: one(params.from), to: one(params.to) });
  const recent = await listExpenses(user.id, { period, from: one(params.from), to: one(params.to), limit: 8, cap: 8 });
  const upcoming = await upcomingRecurring(user.id, 7);
  const db = forUser(user.id);
  const [insight, categories, methods, entities, merchants] = await Promise.all([
    db.insight.findFirst({ where: { kind: "MONTHLY_REVIEW", dismissedAt: null }, orderBy: { createdAt: "desc" } }),
    db.category.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    db.entity.findMany({ orderBy: { name: "asc" } }),
    db.merchant.findMany({ orderBy: { name: "asc" } }),
  ]);
  const months = trailingMonths(user.timezone, 12);
  const points: { label: string; totalCents: number }[] = [];
  for (const month of months) {
    const slice = await getSummary(user.id, { from: month.from, to: month.to });
    points.push({ label: month.label, totalCents: slice.totalCents });
  }
  const maxCategory = Math.max(1, ...summary.groups.slice(0, 8).map((group) => group.totalCents));
  const essentialTotal = summary.essentialCents + summary.discretionaryCents + summary.untaggedCents;
  const chips = [
    ["this_month", "This month"],
    ["last_month", "Last month"],
    ["this_quarter", "Quarter"],
    ["ytd", "YTD"],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map(([key, label]) => (
          <Link key={key} href={`/?period=${key}`} className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${period === key ? "bg-accent text-on-accent" : "border border-line"}`}>{label}</Link>
        ))}
        <form className="flex flex-wrap gap-2" action="/">
          <input type="hidden" name="period" value="custom" />
          <input name="from" type="date" className="min-h-11 rounded-2xl border border-line bg-surface px-3" aria-label="From" />
          <input name="to" type="date" className="min-h-11 rounded-2xl border border-line bg-surface px-3" aria-label="To" />
          <button className="min-h-11 rounded-full border border-line px-3 text-sm">Custom</button>
        </form>
      </div>
      <Panel>
        <Eyebrow>{summary.period.label}</Eyebrow>
        <MoneyText cents={summary.totalCents} currency={user.currency} className="mt-2 block font-display text-5xl" />
        <p className="mt-2 text-sm text-muted">{summary.deltaPercent == null ? "No previous period to compare." : `${summary.deltaPercent > 0 ? "+" : ""}${summary.deltaPercent}% vs the previous period`}</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface-strong">
          {essentialTotal !== 0 ? (
            <div className="flex h-full">
              <div style={{ width: `${(summary.essentialCents / essentialTotal) * 100}%` }} className="bg-ink" />
              <div style={{ width: `${(summary.discretionaryCents / essentialTotal) * 100}%` }} className="bg-accent" />
              <div style={{ width: `${(summary.untaggedCents / essentialTotal) * 100}%` }} className="bg-ink/30" />
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted">Solid bar essential · mint discretionary</p>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Categories</h2>
        <ul className="mt-3 space-y-2">
          {summary.groups.slice(0, 8).map((group) => (
            <li key={group.key}>
              <Link href={`/expenses?period=${period}&category=${encodeURIComponent(group.label)}`} className="block min-h-11">
                <span className="flex justify-between text-sm"><span>{group.label}</span><span className="tabular">{group.totalFormatted}</span></span>
                <span className="mt-1 block h-1.5 rounded-full bg-surface-strong"><span className="block h-full rounded-full bg-accent" style={{ width: `${(group.totalCents / maxCategory) * 100}%` }} /></span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Last 12 months</h2>
        <TrendChart points={points} currency={user.currency} />
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Coming up</h2>
        {upcoming.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing in the next 7 days.</p> : (
          <ul className="mt-2 space-y-2 text-sm">{upcoming.map((item) => <li key={item.id} className="flex justify-between"><span>{item.nextRunOn} {item.name}</span><span className="tabular">{item.amountFormatted}</span></li>)}</ul>
        )}
      </Panel>
      {insight ? (
        <Panel>
          <Eyebrow>Latest review</Eyebrow>
          <h2 className="font-display text-2xl">{insight.title}</h2>
          <Link href="/insights" className="mt-2 inline-flex min-h-11 items-center text-sm text-accent">Open insights</Link>
        </Panel>
      ) : null}
      <Panel>
        <h2 className="font-display text-2xl">Recent</h2>
        {recent.expenses.length === 0 ? <EmptyState title="No expenses in this period." body="Add one when you're ready." /> : (
          <RecentExpenses
            expenses={recent.expenses}
            categories={categories.map((item) => ({ id: item.id, name: item.name }))}
            methods={methods.map((item) => ({ id: item.id, name: item.name }))}
            entities={entities.map((item) => ({ id: item.id, name: item.name, isDefault: item.isDefault }))}
            merchants={merchants.map((item) => ({ id: item.id, name: item.name }))}
            currency={user.currency}
            largeAmountCents={user.largeAmountCents}
          />
        )}
      </Panel>
    </div>
  );
}
