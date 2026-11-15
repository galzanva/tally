"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeRateAction, recurringStatusAction, saveRecurringAction } from "@/app/actions";
import { Button, Chip, EmptyState, Input, MoneyText, Panel, Select, Sheet } from "@/components/ui";

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
  category: string;
  rates: { id: string; amountFormatted: string; effectiveFrom: string }[];
};

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
        <ul className="divide-y divide-white/5">
          {rows.map((item) => (
            <li key={item.id}>
              <button className="flex min-h-14 w-full items-center gap-3 py-3 text-left" onClick={() => setOpen(item)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-sm text-muted">{item.nextRunOn} · {item.amountType}</span>
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

function RecurringSheet({ item, categories, onClose }: { item: Item | "new" | null; categories: string[]; onClose: () => void }) {
  const router = useRouter();
  const [backfill, setBackfill] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const existing = item && item !== "new" ? item : null;
  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => !open && onClose()} title={existing ? existing.name : "Add recurring"} footer={<Button form="recurring-form" type="submit">Save</Button>}>
      <form id="recurring-form" className="space-y-3" onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const result = await saveRecurringAction({
          id: existing?.id,
          name: String(data.get("name") ?? existing?.name ?? ""),
          amount: String(data.get("amount") ?? "0"),
          frequency: String(data.get("frequency") ?? "MONTHLY") as "MONTHLY" | "YEARLY",
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
        <Input name="name" placeholder="Name" defaultValue={existing?.name} required />
        <Input name="amount" inputMode="decimal" placeholder="Amount" required />
        <Select name="frequency" defaultValue={existing?.frequency ?? "MONTHLY"}><option>MONTHLY</option><option>YEARLY</option></Select>
        <Input name="dayOfMonth" type="number" min={1} max={31} defaultValue={existing?.dayOfMonth ?? 1} />
        <Input name="monthOfYear" type="number" min={1} max={12} placeholder="Month of year, yearly only" />
        <Select name="amountType" defaultValue={existing?.amountType ?? "FIXED"}><option>FIXED</option><option>VARIABLE</option></Select>
        <Input name="startOn" type="date" />
        <Select name="category" defaultValue={existing?.category}>{categories.map((name) => <option key={name}>{name}</option>)}</Select>
      </form>
      {existing ? (
        <div className="mt-4 space-y-3">
          <h3 className="font-display text-xl">Rate history</h3>
          <ul className="space-y-1 text-sm">{existing.rates.map((rate) => <li key={rate.id} className="tabular">{rate.effectiveFrom} · {rate.amountFormatted}</li>)}</ul>
          <form className="grid grid-cols-1 gap-2" onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await changeRateAction(existing.id, String(data.get("amount")), String(data.get("effectiveFrom")), data.get("applyToPosted") === "on");
            router.refresh();
          }}>
            <Input name="amount" inputMode="decimal" placeholder="New amount" required />
            <Input name="effectiveFrom" type="date" required />
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="applyToPosted" /> Reprice postings on or after that date</label>
            <Button type="submit" variant="secondary">Change price from…</Button>
          </form>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={backfill} onChange={(event) => setBackfill(event.target.checked)} /> Post missed months</label>
          <div className="flex flex-wrap gap-2">
            <Button variant="warn" onClick={() => recurringStatusAction(existing.id, "pause").then(() => router.refresh())}>Pause</Button>
            <Button variant="secondary" onClick={() => recurringStatusAction(existing.id, "resume", backfill).then(() => router.refresh())}>Resume</Button>
            <Button variant="danger" onClick={() => recurringStatusAction(existing.id, "end").then(() => router.refresh())}>End</Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
