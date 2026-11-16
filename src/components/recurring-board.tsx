"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeRateAction, deleteRecurringAction, recurringStatusAction, saveRecurringAction } from "@/app/actions";
import { Button, Chip, Dialog, EmptyState, Input, MoneyText, Panel, Select, Sheet } from "@/components/ui";

type Rate = { id: string; amountCents: number; amountFormatted: string; effectiveFrom: string };

type Item = {
  id: string;
  name: string;
  amountCents: number;
  amountFormatted: string;
  nextRunOn: string;
  amountType: string;
  status: string;
  frequency: string;
  dayOfMonth: number;
  monthOfYear: number | null;
  startOn: string;
  category: string;
  rates: Rate[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prettyDate(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return ymd;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function prettyMonth(ymd: string) {
  const [year, month] = ymd.split("-").map(Number);
  if (!year || !month) return ymd;
  return `${MONTHS[month - 1]} ${year}`;
}

function frequencyLabel(frequency: string) {
  if (frequency === "YEARLY") return "Yearly";
  if (frequency === "SEMIANNUAL") return "Every 6 months";
  return "Monthly";
}

function monthsSpanned(from: string, to: string) {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  if (!y1 || !m1 || !y2 || !m2) return 1;
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

function pricePeriods(rates: Rate[]) {
  const periods: { amountFormatted: string; amountCents: number; from: string; to: string; count: number }[] = [];
  for (const rate of rates) {
    const last = periods.at(-1);
    if (last && last.amountCents === rate.amountCents) {
      last.to = rate.effectiveFrom;
      last.count += 1;
    } else {
      periods.push({ amountFormatted: rate.amountFormatted, amountCents: rate.amountCents, from: rate.effectiveFrom, to: rate.effectiveFrom, count: 1 });
    }
  }
  return periods;
}

export function RecurringBoard({ items, currency, monthlyCents, yearlyCents, categories }: { items: Item[]; currency: string; monthlyCents: number; yearlyCents: number; categories: string[] }) {
  const [tab, setTab] = useState<"ACTIVE" | "PAUSED" | "ENDED">("ACTIVE");
  const [open, setOpen] = useState<Item | "new" | null>(null);
  const rows = items.filter((item) => item.status === tab);
  return (
    <div className="space-y-4">
      <Panel className="grid grid-cols-2 gap-4">
        <div><p className="text-sm text-muted">Committed monthly</p><MoneyText cents={monthlyCents} currency={currency} className="font-display text-3xl" /></div>
        <div><p className="text-sm text-muted">Yearly</p><MoneyText cents={yearlyCents} currency={currency} className="font-display text-3xl" /></div>
      </Panel>
      <div className="flex gap-2">
        {(["ACTIVE", "PAUSED", "ENDED"] as const).map((value) => <Chip key={value} active={tab === value} onClick={() => setTab(value)}>{value === "ACTIVE" ? "Active" : value === "PAUSED" ? "Paused" : "Ended"}</Chip>)}
        <Button onClick={() => setOpen("new")}>Add recurring</Button>
      </div>
      {rows.length === 0 ? <EmptyState title="Nothing recurring yet." body="Netflix, rent, and the electric bill can post themselves." action={<Button onClick={() => setOpen("new")}>Add recurring</Button>} /> : (
        <ul className="divide-y divide-line">
          {rows.map((item) => (
            <li key={item.id}>
              <button className="flex min-h-14 w-full items-center gap-3 py-3 text-left" onClick={() => setOpen(item)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-sm text-muted">{item.status === "ENDED" ? `Last ${prettyMonth(item.rates.at(-1)?.effectiveFrom ?? item.startOn)}` : `Since ${prettyMonth(item.startOn)}`} · {frequencyLabel(item.frequency)}{item.amountType === "VARIABLE" ? " · Variable" : ""}</span>
                </span>
                <MoneyText cents={item.amountCents} currency={currency} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <RecurringSheet item={open} categories={categories} onClose={() => setOpen(null)} />
    </div>
  );
}

const PAGE_SIZE = 6;

function slicePage<T>(items: T[], page: number) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(Math.max(page, 1), pages);
  const startIndex = (current - 1) * PAGE_SIZE;
  return {
    page: current,
    pages,
    rows: items.slice(startIndex, startIndex + PAGE_SIZE),
    total: items.length,
    start: items.length ? startIndex + 1 : 0,
    end: Math.min(items.length, startIndex + PAGE_SIZE),
  };
}

function dollars(cents: number) {
  return (Math.abs(cents) / 100).toFixed(2);
}

function RecurringSheet({ item, categories, onClose }: { item: Item | "new" | null; categories: string[]; onClose: () => void }) {
  const router = useRouter();
  const [backfill, setBackfill] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"details" | "history" | "charges">("details");
  const [historyPage, setHistoryPage] = useState(1);
  const [chargePage, setChargePage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const existing = item && item !== "new" ? item : null;
  const itemKey = item === "new" ? "new" : item?.id ?? "";
  const [tracked, setTracked] = useState(itemKey);
  if (tracked !== itemKey) {
    setTracked(itemKey);
    setView("details");
    setHistoryPage(1);
    setChargePage(1);
    setMessage(null);
    setConfirmDelete(false);
  }
  const showDetails = !existing || view === "details";
  return (
    <>
    <Sheet open={Boolean(item)} onOpenChange={(open) => !open && onClose()} title={existing ? existing.name : "Add recurring"} footer={showDetails ? <Button form="recurring-form" type="submit">Save</Button> : undefined}>
      {existing ? (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Recurring sections">
          <Chip type="button" active={view === "details"} onClick={() => setView("details")}>Details</Chip>
          <Chip type="button" active={view === "history"} onClick={() => setView("history")}>History</Chip>
          <Chip type="button" active={view === "charges"} onClick={() => setView("charges")}>Charges</Chip>
        </div>
      ) : null}
      {showDetails ? (
        <>
          <form id="recurring-form" key={itemKey} className="space-y-3" onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const result = await saveRecurringAction({
              id: existing?.id,
              name: String(data.get("name") ?? existing?.name ?? ""),
              amount: String(data.get("amount") ?? "0"),
              frequency: String(data.get("frequency") ?? "MONTHLY") as "MONTHLY" | "YEARLY" | "SEMIANNUAL",
              dayOfMonth: Number(data.get("dayOfMonth") ?? 1),
              monthOfYear: data.get("monthOfYear") ? Number(data.get("monthOfYear")) : null,
              amountType: String(data.get("amountType") ?? "FIXED") as "FIXED" | "VARIABLE",
              startOn: String(data.get("startOn") ?? ""),
              category: String(data.get("category") ?? categories[0] ?? "Other"),
            });
            if (!result.ok) setMessage(result.message);
            else { onClose(); router.refresh(); }
          }}>
            {message ? <p className="text-sm text-warn">{message}</p> : null}
            <Field label="Name" hint="The name shown on the recurring list.">
              <Input name="name" placeholder="Netflix" defaultValue={existing?.name} required />
            </Field>
            <Field label="Amount" hint="Current price in dollars. This is the latest charge.">
              <Input name="amount" inputMode="decimal" placeholder="19.99" defaultValue={existing?.amountCents ? dollars(existing.amountCents) : ""} required />
            </Field>
            <Field label="How often" hint="Monthly, once a year, or every 6 months.">
              <Select name="frequency" defaultValue={existing?.frequency ?? "MONTHLY"}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option><option value="SEMIANNUAL">Every 6 months</option></Select>
            </Field>
            <Field label="Day of month" hint="The day it usually posts. 17 means the 17th.">
              <Input name="dayOfMonth" type="number" min={1} max={31} defaultValue={existing?.dayOfMonth ?? 1} />
            </Field>
            <Field label="Month of year" hint="For a yearly bill, which month. 2 means February. Leave blank for monthly.">
              <Input name="monthOfYear" type="number" min={1} max={12} placeholder="Only for yearly bills" defaultValue={existing?.monthOfYear ?? ""} />
            </Field>
            <Field label="Amount style" hint="Fixed stays the same. Variable changes, like rent or the electric bill.">
              <Select name="amountType" defaultValue={existing?.amountType ?? "FIXED"}><option value="FIXED">Fixed</option><option value="VARIABLE">Variable</option></Select>
            </Field>
            <Field label="Started" hint="Date of the first charge on record.">
              <Input name="startOn" type="date" defaultValue={existing?.startOn ?? ""} />
            </Field>
            <Field label="Category" hint="Where this spending is filed.">
              <Select name="category" defaultValue={existing?.category}>{categories.map((name) => <option key={name}>{name}</option>)}</Select>
            </Field>
          </form>
          {existing ? (
            <div className="mt-4 space-y-3">
              <form className="grid grid-cols-1 gap-2" onSubmit={async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                await changeRateAction(existing.id, String(data.get("amount")), String(data.get("effectiveFrom")), data.get("applyToPosted") === "on");
                router.refresh();
              }}>
                <Field label="New amount" hint="A different price starting on the date below.">
                  <Input name="amount" inputMode="decimal" placeholder="19.99" required />
                </Field>
                <Field label="Price starts" hint="The first day this new price applies.">
                  <Input name="effectiveFrom" type="date" required />
                </Field>
                <label className="flex min-h-11 items-center gap-2 text-sm" title="Updates charges already posted on or after that date."><input type="checkbox" name="applyToPosted" /> Reprice postings on or after that date</label>
                <Button type="submit" variant="secondary">Change price from…</Button>
              </form>
              <label className="flex min-h-11 items-center gap-2 text-sm" title="When you resume, also post any months that were skipped."><input type="checkbox" checked={backfill} onChange={(event) => setBackfill(event.target.checked)} /> Post missed months</label>
              <div className="flex flex-wrap gap-2">
                <Button variant="warn" onClick={() => recurringStatusAction(existing.id, "pause").then(() => router.refresh())}>Pause</Button>
                <Button variant="secondary" onClick={() => recurringStatusAction(existing.id, "resume", backfill).then(() => router.refresh())}>Resume</Button>
                <Button variant="secondary" onClick={() => recurringStatusAction(existing.id, "end").then(() => router.refresh())}>End</Button>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {existing && view === "history" ? <HistoryPanel item={existing} page={historyPage} onPage={setHistoryPage} /> : null}
      {existing && view === "charges" ? <ChargesPanel item={existing} page={chargePage} onPage={setChargePage} /> : null}
    </Sheet>
    <Dialog open={confirmDelete && Boolean(existing)} onOpenChange={setConfirmDelete} title="Remove this recurring bill?" description={existing ? `${existing.name} leaves the recurring list. Charges already in your expenses stay.` : ""}>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Keep it</Button>
        <Button variant="danger" onClick={async () => {
          if (!existing) return;
          const result = await deleteRecurringAction(existing.id);
          if (!result.ok) setMessage(result.message);
          else { setConfirmDelete(false); onClose(); router.refresh(); }
        }}>Delete</Button>
      </div>
    </Dialog>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1" title={hint}>
      <span className="block text-sm">{label}</span>
      <span className="block text-xs text-muted">{hint}</span>
      {children}
    </label>
  );
}

function ListPager({ page, pages, start, end, total, onPage, label }: { page: number; pages: number; start: number; end: number; total: number; onPage: (page: number) => void; label: string }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3 pt-3" aria-label={label}>
      <p className="text-sm text-muted tabular">{start}–{end} of {total}</p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button type="button" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}

function HistoryPanel({ item, page, onPage }: { item: Item; page: number; onPage: (page: number) => void }) {
  const rates = [...item.rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (!rates.length) return <p className="text-sm text-muted">No price history yet.</p>;
  const first = rates[0]!;
  const last = rates.at(-1)!;
  const started = item.startOn || first.effectiveFrom;
  const months = monthsSpanned(started, last.effectiveFrom);
  const periods = pricePeriods(rates).reverse();
  const window = slicePage(periods, page);
  return (
    <section>
      <p className="text-sm text-muted">{item.status === "ENDED" ? "Ended" : "Active"} · {frequencyLabel(item.frequency)}{item.amountType === "VARIABLE" ? " · Amount changes" : ""} · Newest first</p>
      <p className="mt-1">Since {prettyDate(started)} · {months} {months === 1 ? "month" : "months"}</p>
      <p className="text-sm text-muted">Last charge {prettyDate(last.effectiveFrom)} · {last.amountFormatted}</p>
      <ul className="mt-4 divide-y divide-line">
        {window.rows.map((period) => (
          <li key={period.from} className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="block font-medium tabular">{period.amountFormatted}</span>
              <span className="text-sm text-muted">{prettyDate(period.from)}{period.from === period.to ? "" : ` – ${prettyDate(period.to)}`}</span>
            </span>
            <span className="text-sm text-muted">{period.count} {period.count === 1 ? "charge" : "charges"}</span>
          </li>
        ))}
      </ul>
      <ListPager page={window.page} pages={window.pages} start={window.start} end={window.end} total={window.total} onPage={onPage} label="Price history pages" />
    </section>
  );
}

function ChargesPanel({ item, page, onPage }: { item: Item; page: number; onPage: (page: number) => void }) {
  const rates = [...item.rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  if (!rates.length) return <p className="text-sm text-muted">No charges yet.</p>;
  const max = Math.max(...rates.map((rate) => rate.amountCents));
  const window = slicePage(rates, page);
  return (
    <section>
      <p className="text-sm text-muted">{rates.length} {rates.length === 1 ? "charge" : "charges"} · newest first</p>
      <ul className="mt-3 space-y-2">
        {window.rows.map((rate) => (
          <li key={rate.id} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-muted">{prettyDate(rate.effectiveFrom)}</span>
            <span className="h-2 min-w-0 flex-1 rounded-full bg-surface-strong">
              <span className="block h-2 rounded-full bg-ink/70" style={{ width: `${Math.max(8, Math.round((rate.amountCents / max) * 100))}%` }} />
            </span>
            <span className="w-24 shrink-0 text-right tabular">{rate.amountFormatted}</span>
          </li>
        ))}
      </ul>
      <ListPager page={window.page} pages={window.pages} start={window.start} end={window.end} total={window.total} onPage={onPage} label="Charge pages" />
    </section>
  );
}
