"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Search, SlidersHorizontal } from "lucide-react";
import { bulkExpenseAction, deleteExpenseAction, restoreExpenseAction, saveExpenseAction } from "@/app/actions";
import { Button, Chip, Dialog, EmptyState, Input, MoneyText, Panel, Select, Sheet, Textarea } from "@/components/ui";
import type { ExpenseDTO, ExpenseWrite } from "@/lib/expenses";
import { formatWeekday } from "@/lib/dates";

type Option = { id: string; name: string };
const periods = [
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_quarter", "Quarter"],
  ["ytd", "YTD"],
  ["last_year", "Last year"],
  ["all", "All"],
] as const;
const tags = ["UNREVIEWED", "NONE", "BUSINESS", "MEDICAL", "CHARITABLE", "TAX_PAYMENT", "PROPERTY_TAX", "POSSIBLY_DEDUCTIBLE"];

export function ExpensesBoard(props: {
  expenses: ExpenseDTO[];
  categories: Option[];
  methods: Option[];
  entities: (Option & { isDefault: boolean })[];
  merchants: Option[];
  currency: string;
  query: Record<string, string | undefined>;
  largeAmountCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(props.query.new === "1");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDTO | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<{ id: string; label: string } | null>(null);
  const [confirm, setConfirm] = useState<ExpenseDTO | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, ExpenseDTO[]>();
    for (const expense of props.expenses) map.set(expense.occurredOn, [...(map.get(expense.occurredOn) ?? []), expense]);
    return [...map.entries()];
  }, [props.expenses]);

  function push(next: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...props.query, ...next })) {
      if (value && key !== "new") params.set(key, value);
    }
    router.push(`/expenses?${params.toString()}`);
  }

  async function onDelete(expense: ExpenseDTO) {
    const result = await deleteExpenseAction(expense.id);
    if (result.ok) {
      setConfirm(null);
      setOpen(false);
      setToast({ id: expense.id, label: expense.merchant || expense.description });
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {periods.map(([key, label]) => (
          <Chip key={key} active={(props.query.period ?? "ytd") === key} onClick={() => push({ period: key })}>{label}</Chip>
        ))}
        <Chip onClick={() => setFiltersOpen(true)}><SlidersHorizontal className="size-4" /> Filters</Chip>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 size-5 text-faint" />
        <Input className="pl-10" placeholder="Search merchants, notes, descriptions" defaultValue={props.query.q ?? ""} onKeyDown={(event) => {
          if (event.key === "Enter") push({ q: (event.target as HTMLInputElement).value });
        }} />
      </div>
      {selected.length > 0 ? (
        <Panel className="flex flex-wrap items-center gap-2">
          <p className="text-sm">{selected.length} selected</p>
          <Select defaultValue="" onChange={(event) => event.target.value && bulkExpenseAction(selected, { categoryId: event.target.value }).then(() => router.refresh())}>
            <option value="">Category</option>
            {props.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Select defaultValue="" onChange={(event) => event.target.value && bulkExpenseAction(selected, { entityId: event.target.value }).then(() => router.refresh())}>
            <option value="">Entity</option>
            {props.entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Select defaultValue="" onChange={(event) => event.target.value && bulkExpenseAction(selected, { taxTag: event.target.value as ExpenseWrite["taxTag"] }).then(() => router.refresh())}>
            <option value="">Tax tag</option>
            {tags.map((tag) => <option key={tag}>{tag}</option>)}
          </Select>
        </Panel>
      ) : null}
      {props.expenses.length === 0 ? (
        <EmptyState title="No expenses in this period." body="Add one here, or send it through OpenClaw." action={<Button onClick={() => { setEditing(null); setOpen(true); }}>Add expense</Button>} />
      ) : groups.map(([day, rows]) => (
        <section key={day}>
          <div className="sticky top-16 z-10 -mx-4 flex items-center justify-between bg-bg/90 px-4 py-2 backdrop-blur-md">
            <h2 className="text-sm text-muted">{formatWeekday(day)}</h2>
            <MoneyText cents={rows.reduce((sum, row) => sum + row.amountCents, 0)} currency={props.currency} className="text-sm" />
          </div>
          <ul className="divide-y divide-white/5">
            {rows.map((expense) => (
              <li key={expense.id} className="flex min-h-11 items-center gap-3 py-3">
                <input type="checkbox" className="size-5" checked={selected.includes(expense.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, expense.id] : selected.filter((id) => id !== expense.id))} aria-label={`Select ${expense.description}`} />
                <button className="min-w-0 flex-1 text-left" onClick={() => { setEditing(expense); setOpen(true); }}>
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{expense.merchant || expense.description}</span>
                    {expense.receiptIds.length > 0 ? <Camera className="size-4 text-muted" aria-label="Has receipt" /> : null}
                    {expense.needsReview ? <span className="size-2 rounded-full bg-warn" title="Needs review" /> : null}
                    {expense.status === "PENDING_CONFIRM" ? <span className="size-2 rounded-full bg-white/70" title="Estimate" /> : null}
                  </span>
                  <span className="block truncate text-sm text-muted">{expense.category} · {expense.entity}</span>
                </button>
                <MoneyText cents={expense.amountCents} currency={props.currency} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="flex justify-end">
        <a className="inline-flex min-h-11 items-center text-sm text-accent" href={`/api/export/expenses?${new URLSearchParams(Object.entries(props.query).filter((entry): entry is [string, string] => Boolean(entry[1] && entry[0] !== "new")))}`}>Export CSV</a>
      </div>
      <ExpenseEditor key={editing?.id ?? "new"} open={open} expense={editing} onOpenChange={setOpen} {...props} onDelete={setConfirm} />
      <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} query={props.query} push={push} categories={props.categories} methods={props.methods} entities={props.entities} />
      <Dialog open={Boolean(confirm)} onOpenChange={() => setConfirm(null)} title="Delete this expense?" description={confirm ? `${confirm.merchant || confirm.description} · ${confirm.amountFormatted}` : ""}>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Keep it</Button>
          <Button variant="danger" onClick={() => confirm && onDelete(confirm)}>Delete</Button>
        </div>
      </Dialog>
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#0c1214] px-4 py-2 text-sm md:bottom-8">
          Deleted {toast.label}
          <button className="min-h-11 text-accent" onClick={async () => { await restoreExpenseAction(toast.id); setToast(null); router.refresh(); }}>Undo</button>
        </div>
      ) : null}
    </div>
  );
}

function ExpenseEditor(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseDTO | null;
  categories: Option[];
  methods: Option[];
  entities: (Option & { isDefault: boolean })[];
  merchants: Option[];
  currency: string;
  largeAmountCents: number;
  onDelete: (expense: ExpenseDTO) => void;
}) {
  const router = useRouter();
  const expense = props.expense;
  const [amount, setAmount] = useState(expense ? (Math.abs(expense.amountCents) / 100).toFixed(2) : "");
  const [message, setMessage] = useState<string | null>(null);
  const [receiptIds, setReceiptIds] = useState<string[]>(expense?.receiptIds ?? []);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [essential, setEssential] = useState(expense?.essential === true);
  const changedAmount = expense?.recurringId && amount && Math.round(Number(amount) * 100) !== expense.amountCents;

  async function submit(applyAsNewRate?: boolean) {
    const form = document.getElementById("expense-form") as HTMLFormElement;
    const data = new FormData(form);
    const dollars = Number(String(data.get("amount")));
    if (Math.abs(Math.round(dollars * 100)) >= props.largeAmountCents && !confirmLarge) {
      setMessage(`This is at or above your confirmation line. Confirm it to save.`);
      setConfirmLarge(true);
      return;
    }
    const result = await saveExpenseAction({
      id: expense?.id,
      amount: String(data.get("amount") ?? ""),
      date: String(data.get("date") ?? ""),
      merchant: String(data.get("merchant") ?? ""),
      description: String(data.get("description") ?? ""),
      category: String(data.get("category") ?? ""),
      paymentMethod: String(data.get("paymentMethod") ?? ""),
      entity: String(data.get("entity") ?? ""),
      taxTag: (String(data.get("taxTag") ?? "UNREVIEWED") || "UNREVIEWED") as ExpenseWrite["taxTag"],
      essential: data.get("essential") === "on" ? true : data.get("essential") === "off" ? false : null,
      notes: String(data.get("notes") ?? ""),
      receiptIds,
      confirmLarge,
      applyAsNewRate,
    });
    if (!result.ok) {
      setMessage(result.message);
      if (result.code === "confirm_large_amount") setConfirmLarge(true);
      return;
    }
    props.onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange} title={expense ? "Edit expense" : "Add expense"} footer={
      <div className="flex flex-col gap-2">
        {message ? <p className="text-sm text-warn">{message}</p> : null}
        {changedAmount ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => submit(false)}>Just this one</Button>
            <Button onClick={() => submit(true)}>From this month on</Button>
          </div>
        ) : <Button onClick={() => submit(false)}>{confirmLarge ? "Confirm and save" : "Save expense"}</Button>}
      </div>
    }>
      <form id="expense-form" className="space-y-3" onSubmit={(event) => event.preventDefault()}>
        <label className="block"><span className="text-sm text-muted">Amount</span>
          <Input name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="font-display text-4xl tabular" required />
        </label>
        <label className="block"><span className="text-sm text-muted">Date</span><Input name="date" type="date" defaultValue={expense?.occurredOn} /></label>
        <label className="block"><span className="text-sm text-muted">Merchant</span>
          <Input name="merchant" list="merchants" defaultValue={expense?.merchant ?? ""} />
          <datalist id="merchants">{props.merchants.map((merchant) => <option key={merchant.id} value={merchant.name} />)}</datalist>
        </label>
        <label className="block"><span className="text-sm text-muted">Description</span><Input name="description" defaultValue={expense?.description ?? ""} /></label>
        <div className="flex flex-wrap gap-2">
          {props.categories.map((category) => (
            <label key={category.id} className="min-h-11">
              <input className="peer sr-only" type="radio" name="category" value={category.name} defaultChecked={expense ? expense.category === category.name : category.name === "Other"} />
              <span className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-3 text-sm peer-checked:border-transparent peer-checked:bg-accent peer-checked:text-on-accent">{category.name}</span>
            </label>
          ))}
        </div>
        <label className="block"><span className="text-sm text-muted">Payment method</span>
          <Select name="paymentMethod" defaultValue={expense?.paymentMethod ?? ""}>
            <option value="">None</option>
            {props.methods.map((method) => <option key={method.id} value={method.name}>{method.name}</option>)}
          </Select>
        </label>
        <label className="block"><span className="text-sm text-muted">Entity</span>
          <Select name="entity" defaultValue={expense?.entity ?? props.entities.find((entity) => entity.isDefault)?.name ?? ""}>
            {props.entities.map((entity) => <option key={entity.id} value={entity.name}>{entity.name}</option>)}
          </Select>
        </label>
        <div className="flex gap-2">
          <Chip type="button" active={essential} onClick={() => setEssential((value) => !value)}>Essential</Chip>
          <input type="hidden" name="essential" value={essential ? "on" : "off"} />
        </div>
        <label className="block"><span className="text-sm text-muted">Tax tag</span>
          <Select name="taxTag" defaultValue={expense?.taxTag ?? "UNREVIEWED"}>{tags.map((tag) => <option key={tag}>{tag}</option>)}</Select>
        </label>
        <label className="block"><span className="text-sm text-muted">Notes</span><Textarea name="notes" defaultValue={expense?.notes ?? ""} /></label>
        <ReceiptField ids={receiptIds} onChange={setReceiptIds} />
        {expense ? <Button type="button" variant="danger" onClick={() => props.onDelete(expense)}>Delete</Button> : null}
      </form>
    </Sheet>
  );
}

function ReceiptField({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <Camera className="size-4" /> Add receipt
        <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const body = new FormData();
          body.set("file", file);
          const response = await fetch("/api/receipts", { method: "POST", body });
          const json = await response.json();
          if (!response.ok) setError(json.error?.message ?? "The receipt didn't upload.");
          else onChange([...ids, json.receiptId]);
        }} />
      </label>
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => <a key={id} href={`/api/receipts/${id}`} target="_blank" className="block size-16 overflow-hidden rounded-2xl border border-white/10"><img src={`/api/receipts/${id}`} alt="Receipt" className="size-full object-cover" /></a>)}
      </div>
    </div>
  );
}

function FilterSheet(props: { open: boolean; onOpenChange: (open: boolean) => void; query: Record<string, string | undefined>; push: (next: Record<string, string | undefined>) => void; categories: Option[]; methods: Option[]; entities: Option[] }) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange} title="Filters" footer={<Button onClick={() => props.onOpenChange(false)}>Done</Button>}>
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        props.push({
          category: String(data.get("category") ?? ""),
          merchant: String(data.get("merchant") ?? ""),
          paymentMethod: String(data.get("paymentMethod") ?? ""),
          entity: String(data.get("entity") ?? ""),
          taxTag: String(data.get("taxTag") ?? ""),
          hasReceipt: String(data.get("hasReceipt") ?? ""),
          source: String(data.get("source") ?? ""),
          needsReview: data.get("needsReview") === "on" ? "1" : "",
          from: String(data.get("from") ?? ""),
          to: String(data.get("to") ?? ""),
        });
        props.onOpenChange(false);
      }}>
        <Input name="from" type="date" defaultValue={props.query.from} />
        <Input name="to" type="date" defaultValue={props.query.to} />
        <Select name="category" defaultValue={props.query.category ?? ""}><option value="">Any category</option>{props.categories.map((item) => <option key={item.id}>{item.name}</option>)}</Select>
        <Input name="merchant" placeholder="Merchant" defaultValue={props.query.merchant ?? ""} />
        <Select name="paymentMethod" defaultValue={props.query.paymentMethod ?? ""}><option value="">Any payment method</option>{props.methods.map((item) => <option key={item.id}>{item.name}</option>)}</Select>
        <Select name="entity" defaultValue={props.query.entity ?? ""}><option value="">Any entity</option>{props.entities.map((item) => <option key={item.id}>{item.name}</option>)}</Select>
        <Select name="taxTag" defaultValue={props.query.taxTag ?? ""}><option value="">Any tax tag</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</Select>
        <Select name="hasReceipt" defaultValue={props.query.hasReceipt ?? ""}><option value="">Receipts: any</option><option value="true">Has receipt</option><option value="false">Missing receipt</option></Select>
        <Select name="source" defaultValue={props.query.source ?? ""}><option value="">Any source</option>{["WEB", "API", "RECURRING", "IMPORT"].map((source) => <option key={source}>{source}</option>)}</Select>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="needsReview" defaultChecked={props.query.needsReview === "1"} /> Needs review</label>
        <Button type="submit">Apply filters</Button>
      </form>
    </Sheet>
  );
}
