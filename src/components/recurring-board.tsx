"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { changeRateAction, deleteRecurringAction, linkExpenseToRecurringAction, postMissedChargeAction, recurringStatusAction, saveRecurringAction, searchExpensesToLinkAction } from "@/app/actions";
import { Button, Chip, Dialog, EmptyState, Input, MoneyText, Panel, Select, Sheet } from "@/components/ui";

type Rate = { id: string; amountCents: number; amountFormatted: string; effectiveFrom: string };
type Posting = { id: string; occurredOn: string; amountCents: number; amountFormatted: string; status: string; description: string };
type Charge = { id: string; occurredOn: string; amountCents: number; amountFormatted: string; description: string; linked: boolean };

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
  merchant?: string | null;
  rates: Rate[];
  postings?: Posting[];
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

function periodKey(frequency: string, ymd: string) {
  if (frequency === "YEARLY") return ymd.slice(0, 4);
  if (frequency === "SEMIANNUAL") return `${ymd.slice(0, 4)}-${Number(ymd.slice(5, 7)) <= 6 ? "H1" : "H2"}`;
  return ymd.slice(0, 7);
}

function chargeRows(item: Item): Charge[] {
  const postings = item.postings ?? [];
  const covered = new Set(postings.map((posting) => periodKey(item.frequency, posting.occurredOn)));
  const linked = postings.map((posting) => ({ ...posting, linked: true }));
  const fromRates = item.rates
    .filter((rate) => !covered.has(periodKey(item.frequency, rate.effectiveFrom)))
    .map((rate) => ({ id: rate.id, occurredOn: rate.effectiveFrom, amountCents: rate.amountCents, amountFormatted: rate.amountFormatted, description: "", linked: false }));
  return [...linked, ...fromRates].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.amountCents - a.amountCents);
}

const LIST_PAGE = 10;
type SortKey = "name" | "amount-desc" | "amount-asc" | "category" | "next" | "started";

export function RecurringBoard({ items, currency, monthlyCents, yearlyCents, categories }: { items: Item[]; currency: string; monthlyCents: number; yearlyCents: number; categories: string[] }) {
  const [tab, setTab] = useState<"ACTIVE" | "PAUSED" | "ENDED">("ACTIVE");
  const [open, setOpen] = useState<Item | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [frequency, setFrequency] = useState("");
  const [amountType, setAmountType] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const statusRows = items.filter((item) => item.status === tab);
  const categoryOptions = [...new Set(statusRows.map((item) => item.category))].sort((a, b) => a.localeCompare(b));
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = items.filter((item) => {
      if (item.status !== tab) return false;
      if (category && item.category !== category) return false;
      if (frequency && item.frequency !== frequency) return false;
      if (amountType && item.amountType !== amountType) return false;
      if (!needle) return true;
      return [item.name, item.category, item.merchant ?? ""].join(" ").toLowerCase().includes(needle);
    });
    return [...rows].sort((a, b) => {
      if (sort === "amount-desc") return b.amountCents - a.amountCents || a.name.localeCompare(b.name);
      if (sort === "amount-asc") return a.amountCents - b.amountCents || a.name.localeCompare(b.name);
      if (sort === "category") return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      if (sort === "next") return a.nextRunOn.localeCompare(b.nextRunOn) || a.name.localeCompare(b.name);
      if (sort === "started") return b.startOn.localeCompare(a.startOn) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [items, tab, search, category, frequency, amountType, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE));
  const current = Math.min(page, pages);
  const startIndex = (current - 1) * LIST_PAGE;
  const visible = filtered.slice(startIndex, startIndex + LIST_PAGE);
  function resetPage() {
    setPage(1);
  }
  return (
    <div className="space-y-4">
      <Panel className="grid grid-cols-2 gap-4">
        <div><p className="text-sm text-muted">Committed monthly</p><MoneyText cents={monthlyCents} currency={currency} className="font-display text-3xl" /></div>
        <div><p className="text-sm text-muted">Yearly</p><MoneyText cents={yearlyCents} currency={currency} className="font-display text-3xl" /></div>
      </Panel>
      <div className="flex flex-wrap gap-2">
        {(["ACTIVE", "PAUSED", "ENDED"] as const).map((value) => <Chip key={value} active={tab === value} onClick={() => { setTab(value); setCategory(""); resetPage(); }}>{value === "ACTIVE" ? "Active" : value === "PAUSED" ? "Paused" : "Ended"}</Chip>)}
        <Button onClick={() => setOpen("new")}>Add recurring</Button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 size-5 text-faint" />
        <Input className="pl-10" placeholder="Search bills, categories, merchants" value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} aria-label="Search recurring bills" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select aria-label="Sort" value={sort} onChange={(event) => { setSort(event.target.value as SortKey); resetPage(); }}>
          <option value="name">Sort: Name</option>
          <option value="category">Sort: Category</option>
          <option value="amount-desc">Sort: Amount, high to low</option>
          <option value="amount-asc">Sort: Amount, low to high</option>
          <option value="next">Sort: Next charge</option>
          <option value="started">Sort: Started, newest</option>
        </Select>
        <Select aria-label="Category" value={categoryOptions.includes(category) ? category : ""} onChange={(event) => { setCategory(event.target.value); resetPage(); }}>
          <option value="">Any category</option>
          {categoryOptions.map((name) => <option key={name}>{name}</option>)}
        </Select>
        <Select aria-label="How often" value={frequency} onChange={(event) => { setFrequency(event.target.value); resetPage(); }}>
          <option value="">Any schedule</option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
          <option value="SEMIANNUAL">Every 6 months</option>
        </Select>
        <Select aria-label="Amount style" value={amountType} onChange={(event) => { setAmountType(event.target.value); resetPage(); }}>
          <option value="">Fixed and variable</option>
          <option value="FIXED">Fixed</option>
          <option value="VARIABLE">Variable</option>
        </Select>
      </div>
      {statusRows.length === 0 ? <EmptyState title="Nothing recurring yet." body="Netflix, rent, and the electric bill can post themselves." action={<Button onClick={() => setOpen("new")}>Add recurring</Button>} /> : filtered.length === 0 ? (
        <EmptyState title="No bills match." body="Try another category, or clear the search." action={<Button variant="secondary" onClick={() => { setSearch(""); setCategory(""); setFrequency(""); setAmountType(""); resetPage(); }}>Clear</Button>} />
      ) : (
        <>
          <BillPager page={current} pages={pages} start={startIndex + 1} end={startIndex + visible.length} total={filtered.length} onPage={setPage} />
          <ul className="divide-y divide-line">
            {visible.map((item) => (
              <li key={item.id}>
                <button className="flex min-h-14 w-full items-center gap-3 py-3 text-left" onClick={() => setOpen(item)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="block truncate text-sm text-muted">{item.category} · {item.status === "ENDED" ? `Last ${prettyMonth(item.rates.at(-1)?.effectiveFrom ?? item.startOn)}` : `Since ${prettyMonth(item.startOn)}`} · {frequencyLabel(item.frequency)}{item.amountType === "VARIABLE" ? " · Variable" : ""}</span>
                  </span>
                  <MoneyText cents={item.amountCents} currency={currency} />
                </button>
              </li>
            ))}
          </ul>
          <BillPager page={current} pages={pages} start={startIndex + 1} end={startIndex + visible.length} total={filtered.length} onPage={setPage} />
        </>
      )}
      <RecurringSheet item={open} categories={categories} onClose={() => setOpen(null)} />
    </div>
  );
}

function BillPager({ page, pages, start, end, total, onPage }: { page: number; pages: number; start: number; end: number; total: number; onPage: (page: number) => void }) {
  const numbers = new Set([1, pages, page - 1, page, page + 1]);
  const visible = [...numbers].filter((number) => number >= 1 && number <= pages).sort((a, b) => a - b);
  const itemClass = "inline-flex size-11 items-center justify-center rounded-full text-sm tabular";
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Recurring pages">
      <p className="text-sm text-muted tabular">{start}–{end} of {total}</p>
      {pages > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm disabled:opacity-50" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          {visible.map((number, index) => {
            const previous = visible[index - 1];
            return (
              <span key={number} className="flex items-center gap-2">
                {previous && number - previous > 1 ? <span className="text-muted">…</span> : null}
                <button type="button" className={`${itemClass} ${number === page ? "bg-accent text-on-accent" : "border border-line"}`} aria-current={number === page ? "page" : undefined} onClick={() => onPage(number)}>{number}</button>
              </span>
            );
          })}
          <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm disabled:opacity-50" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </div>
      ) : null}
    </nav>
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
  const charges = chargeRows(item);
  if (!charges.length) return <p className="text-sm text-muted">No price history yet.</p>;
  const newest = charges[0]!;
  const oldest = charges.at(-1)!;
  const started = item.startOn || oldest.occurredOn;
  const months = monthsSpanned(started, newest.occurredOn);
  const window = slicePage(charges, page);
  return (
    <section>
      <p className="text-sm text-muted">{item.status === "ENDED" ? "Ended" : "Active"} · {frequencyLabel(item.frequency)}{item.amountType === "VARIABLE" ? " · Amount changes" : ""} · Newest first</p>
      <p className="mt-1">Since {prettyDate(started)} · {months} {months === 1 ? "month" : "months"} · {charges.length} {charges.length === 1 ? "charge" : "charges"}</p>
      <p className="text-sm text-muted">Last charge {prettyDate(newest.occurredOn)} · {newest.amountFormatted}</p>
      <ul className="mt-4 divide-y divide-line">
        {window.rows.map((charge) => (
          <li key={charge.id} className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="block font-medium tabular">{charge.amountFormatted}</span>
              <span className="text-sm text-muted">{prettyDate(charge.occurredOn)}{charge.description ? ` · ${charge.description}` : ""}</span>
            </span>
          </li>
        ))}
      </ul>
      <ListPager page={window.page} pages={window.pages} start={window.start} end={window.end} total={window.total} onPage={onPage} label="Price history pages" />
    </section>
  );
}

function ChargesPanel({ item, page, onPage }: { item: Item; page: number; onPage: (page: number) => void }) {
  const router = useRouter();
  const charges = chargeRows(item);
  const max = Math.max(1, ...charges.map((charge) => charge.amountCents));
  const window = slicePage(charges, page);
  const [message, setMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ id: string; occurredOn: string; amountFormatted: string; description: string; merchant: string | null; recurringId: string | null }[]>([]);
  return (
    <section className="space-y-4">
      {message ? <p className="text-sm text-warn">{message}</p> : null}
      <form className="space-y-2" onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const result = await postMissedChargeAction(item.id, String(data.get("date") ?? ""), String(data.get("amount") ?? ""));
        if (!result.ok) setMessage(result.message);
        else { setMessage(null); router.refresh(); }
      }}>
        <Field label="Missed charge" hint="Creates an expense on this bill for a month that never posted.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <Input name="date" type="date" required aria-label="Charge date" />
            <Input name="amount" inputMode="decimal" defaultValue={dollars(item.amountCents)} required aria-label="Charge amount" />
            <Button type="submit" variant="secondary">Add charge</Button>
          </div>
        </Field>
      </form>
      <form className="space-y-2" onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const result = await searchExpensesToLinkAction(String(data.get("q") ?? ""));
        if (!result.ok) setMessage(result.message);
        else { setMessage(null); setMatches(result.expenses); }
      }}>
        <Field label="Link an existing expense" hint="Search the expense list and attach one to this bill.">
          <div className="flex gap-2">
            <Input name="q" placeholder="TradingView" aria-label="Search expenses to link" />
            <Button type="submit" variant="secondary">Search</Button>
          </div>
        </Field>
      </form>
      {matches.length ? (
        <ul className="divide-y divide-line">
          {matches.map((match) => (
            <li key={match.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{match.merchant || match.description}</span>
                <span className="text-muted">{prettyDate(match.occurredOn)} · {match.amountFormatted}{match.recurringId === item.id ? " · Already on this bill" : ""}</span>
              </span>
              <Button type="button" variant="secondary" disabled={match.recurringId === item.id} onClick={async () => {
                const result = await linkExpenseToRecurringAction(item.id, match.id);
                if (!result.ok) setMessage(result.message);
                else { setMessage(null); setMatches((rows) => rows.map((row) => row.id === match.id ? { ...row, recurringId: item.id } : row)); router.refresh(); }
              }}>Link</Button>
            </li>
          ))}
        </ul>
      ) : null}
      {charges.length === 0 ? <p className="text-sm text-muted">No charges yet.</p> : (
        <>
          <p className="text-sm text-muted">{charges.length} {charges.length === 1 ? "charge" : "charges"} · newest first</p>
          <ul className="space-y-2">
            {window.rows.map((charge) => (
              <li key={charge.id} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-muted">{prettyDate(charge.occurredOn)}</span>
                <span className="h-2 min-w-0 flex-1 rounded-full bg-surface-strong">
                  <span className="block h-2 rounded-full bg-ink/70" style={{ width: `${Math.max(8, Math.round((charge.amountCents / max) * 100))}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right tabular">{charge.amountFormatted}</span>
              </li>
            ))}
          </ul>
          <ListPager page={window.page} pages={window.pages} start={window.start} end={window.end} total={window.total} onPage={onPage} label="Charge pages" />
        </>
      )}
    </section>
  );
}
