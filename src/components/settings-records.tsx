"use client";

import { useState } from "react";
import { categoryAction, simpleSettingAction } from "@/app/actions";
import { Button, Dialog, EmptyState, Input, Panel, Select, Sheet } from "@/components/ui";

const paymentTypes = ["DEBIT", "CREDIT", "CASH", "TRANSFER", "OTHER"];

function Row({ title, detail, onEdit, onDelete }: { title: string; detail?: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="border-t border-white/10 py-3 first:border-t-0">
      <p className="font-medium">{title}</p>
      {detail ? <p className="mt-0.5 text-sm text-muted">{detail}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onEdit}>Edit</Button>
        <Button type="button" variant="ghost" onClick={onDelete}>Delete</Button>
      </div>
    </li>
  );
}

function ConfirmDialog({ open, title, body, onClose, action, fields, confirmLabel = "Delete" }: { open: boolean; title: string; body: string; onClose: () => void; action: (formData: FormData) => void | Promise<void>; fields: Record<string, string>; confirmLabel?: string }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} title={title} description={body}>
      <form action={action} className="flex flex-wrap gap-2">
        {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <Button type="button" variant="secondary" onClick={onClose}>Keep it</Button>
        <Button type="submit" variant="danger">{confirmLabel}</Button>
      </form>
    </Dialog>
  );
}

export function CategoriesManager({ rows }: { rows: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<{ id: string; name: string } | "new" | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const current = editing && editing !== "new" ? editing : null;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button type="button" onClick={() => setEditing("new")}>Add category</Button></div>
      <Panel>
        <ul>
          {rows.map((row) => (
            <Row key={row.id} title={row.name} onEdit={() => setEditing(row)} onDelete={() => setRemoving(row)} />
          ))}
        </ul>
      </Panel>
      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title={current ? "Edit category" : "Add category"} footer={<Button type="submit" form="category-form">{current ? "Save" : "Add category"}</Button>}>
        <form id="category-form" action={categoryAction} className="grid gap-3" key={current?.id ?? "new"}>
          <input type="hidden" name="intent" value={current ? "rename" : "create"} />
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <label className="grid gap-1 text-sm text-muted">Name
            <Input name="name" defaultValue={current?.name ?? ""} required />
          </label>
        </form>
      </Sheet>
      <ConfirmDialog open={Boolean(removing)} title="Archive this category?" body={removing ? `${removing.name} leaves the list. Expenses already filed under it stay as they are.` : ""} onClose={() => setRemoving(null)} action={categoryAction} fields={removing ? { intent: "archive", id: removing.id } : {}} confirmLabel="Archive" />
    </div>
  );
}

export function EntitiesManager({ rows }: { rows: { id: string; name: string; isDefault: boolean }[] }) {
  const [editing, setEditing] = useState<{ id: string; name: string; isDefault: boolean } | "new" | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const current = editing && editing !== "new" ? editing : null;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button type="button" onClick={() => setEditing("new")}>Add entity</Button></div>
      <Panel>
        <ul>
          {rows.map((row) => (
            <Row key={row.id} title={row.name} detail={row.isDefault ? "Default for new expenses" : undefined} onEdit={() => setEditing(row)} onDelete={() => setRemoving(row)} />
          ))}
        </ul>
      </Panel>
      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title={current ? "Edit entity" : "Add entity"} footer={<Button type="submit" form="entity-form">{current ? "Save" : "Add entity"}</Button>}>
        <form id="entity-form" action={simpleSettingAction} className="grid gap-3" key={current?.id ?? "new"}>
          <input type="hidden" name="kind" value={current ? "entity-update" : "entity"} />
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <label className="grid gap-1 text-sm text-muted">Name
            <Input name="name" defaultValue={current?.name ?? ""} required />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="default" defaultChecked={current?.isDefault ?? false} /> Default for new expenses
          </label>
        </form>
      </Sheet>
      <ConfirmDialog open={Boolean(removing)} title="Delete this entity?" body={removing ? `${removing.name} can be deleted only when no expense or recurring bill uses it.` : ""} onClose={() => setRemoving(null)} action={simpleSettingAction} fields={removing ? { kind: "entity-delete", id: removing.id } : {}} />
    </div>
  );
}

export function PaymentsManager({ rows }: { rows: { id: string; name: string; type: string; last4: string | null }[] }) {
  const [editing, setEditing] = useState<{ id: string; name: string; type: string; last4: string | null } | "new" | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const current = editing && editing !== "new" ? editing : null;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button type="button" onClick={() => setEditing("new")}>Add payment method</Button></div>
      <Panel>
        <ul>
          {rows.map((row) => (
            <Row key={row.id} title={row.name} detail={`${row.type}${row.last4 ? ` · ${row.last4}` : ""}`} onEdit={() => setEditing(row)} onDelete={() => setRemoving(row)} />
          ))}
        </ul>
      </Panel>
      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title={current ? "Edit payment method" : "Add payment method"} footer={<Button type="submit" form="payment-form">{current ? "Save" : "Add payment method"}</Button>}>
        <form id="payment-form" action={simpleSettingAction} className="grid gap-3" key={current?.id ?? "new"}>
          <input type="hidden" name="kind" value={current ? "payment-update" : "payment"} />
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <label className="grid gap-1 text-sm text-muted">Name
            <Input name="name" defaultValue={current?.name ?? ""} required placeholder="BofA debit" />
          </label>
          <label className="grid gap-1 text-sm text-muted">Type
            <Select name="type" defaultValue={current?.type ?? "DEBIT"}>{paymentTypes.map((type) => <option key={type}>{type}</option>)}</Select>
          </label>
          <label className="grid gap-1 text-sm text-muted">Last 4
            <Input name="last4" defaultValue={current?.last4 ?? ""} inputMode="numeric" maxLength={4} placeholder="2392" />
          </label>
        </form>
      </Sheet>
      <ConfirmDialog open={Boolean(removing)} title="Delete this payment method?" body={removing ? `${removing.name} comes off the list. Past expenses stay, without a method.` : ""} onClose={() => setRemoving(null)} action={simpleSettingAction} fields={removing ? { kind: "payment-delete", id: removing.id } : {}} />
    </div>
  );
}

export function MerchantsManager({ rows }: { rows: { id: string; name: string; aliases: string[] }[] }) {
  const [editing, setEditing] = useState<{ id: string; name: string } | "new" | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const current = editing && editing !== "new" ? editing : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        {rows.length >= 2 ? <Button type="button" variant="secondary" onClick={() => setMerging(true)}>Merge</Button> : null}
        <Button type="button" onClick={() => setEditing("new")}>Add merchant</Button>
      </div>
      {rows.length === 0 ? <EmptyState title="No merchants yet." body="Add one here, or log an expense and it will appear." /> : (
        <Panel>
          <ul>
            {rows.map((row) => (
              <Row key={row.id} title={row.name} detail={row.aliases.join(", ") || undefined} onEdit={() => setEditing(row)} onDelete={() => setRemoving(row)} />
            ))}
          </ul>
        </Panel>
      )}
      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title={current ? "Edit merchant" : "Add merchant"} footer={<Button type="submit" form="merchant-form">{current ? "Save" : "Add merchant"}</Button>}>
        <form id="merchant-form" action={simpleSettingAction} className="grid gap-3" key={current?.id ?? "new"}>
          <input type="hidden" name="kind" value={current ? "merchant-update" : "merchant"} />
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <label className="grid gap-1 text-sm text-muted">Name
            <Input name="name" defaultValue={current?.name ?? ""} required />
          </label>
        </form>
      </Sheet>
      <Sheet open={merging} onOpenChange={setMerging} title="Merge merchants" footer={<Button type="submit" form="merge-form">Merge</Button>}>
        <form id="merge-form" action={simpleSettingAction} className="grid gap-3">
          <input type="hidden" name="kind" value="merchant-merge" />
          <p className="text-sm text-muted">The first name becomes an alias of the second. Expenses move with it.</p>
          <label className="grid gap-1 text-sm text-muted">From
            <Select name="from">{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
          </label>
          <label className="grid gap-1 text-sm text-muted">Into
            <Select name="into">{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
          </label>
        </form>
      </Sheet>
      <ConfirmDialog open={Boolean(removing)} title="Delete this merchant?" body={removing ? `${removing.name} comes off the list. Past expenses stay, without this shop.` : ""} onClose={() => setRemoving(null)} action={simpleSettingAction} fields={removing ? { kind: "merchant-delete", id: removing.id } : {}} />
    </div>
  );
}
