import { accountAction, categoryAction, logoutAction, simpleSettingAction } from "@/app/actions";
import { ConnectionsPanel, ImportPanel } from "@/components/settings-panels";
import { Button, Input, Panel, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";
import { listKeys } from "@/lib/keys";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const { user } = await requireUser();
  const db = forUser(user.id);
  const [categories, methods, entities, merchants, keys] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    db.entity.findMany({ orderBy: { name: "asc" } }),
    db.merchant.findMany({ orderBy: { name: "asc" } }),
    listKeys(user.id),
  ]);
  return (
    <div className="space-y-4">
      {query.saved ? <p className="text-sm text-accent">Saved.</p> : null}
      {query.error === "password" ? <p className="text-sm text-warn">That current password didn't match.</p> : null}
      {query.error === "short" ? <p className="text-sm text-warn">The new password needs at least 10 characters.</p> : null}
      {query.error === "timezone" ? <p className="text-sm text-warn">Use a timezone like America/New_York.</p> : null}
      <Panel>
        <h2 className="font-display text-2xl">Categories</h2>
        <ul className="mt-3 space-y-3">
          {categories.filter((category) => !category.archivedAt).map((category) => (
            <li key={category.id} className="grid gap-2 border-t border-white/5 py-3 md:grid-cols-[1fr_auto]">
              <form action={categoryAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="intent" value="rename" />
                <Input name="name" defaultValue={category.name} />
                <Button type="submit" variant="secondary">Rename</Button>
              </form>
              <form action={categoryAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="intent" value="archive" />
                <Button type="submit" variant="secondary">Archive</Button>
              </form>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Payment methods</h2>
        <ul className="mt-2 text-sm">{methods.map((method) => <li key={method.id}>{method.name} · {method.type}{method.last4 ? ` · ${method.last4}` : ""}</li>)}</ul>
        <form action={simpleSettingAction} className="mt-3 grid gap-2">
          <input type="hidden" name="kind" value="payment" />
          <Input name="name" placeholder="Name" required />
          <Select name="type"><option>DEBIT</option><option>CREDIT</option><option>CASH</option><option>TRANSFER</option><option>OTHER</option></Select>
          <Input name="last4" placeholder="Last 4" maxLength={4} />
          <Button type="submit" variant="secondary">Add payment method</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Entities</h2>
        <ul className="mt-2 text-sm">{entities.map((entity) => <li key={entity.id}>{entity.name}{entity.isDefault ? " · default" : ""}</li>)}</ul>
        <form action={simpleSettingAction} className="mt-3 grid gap-2">
          <input type="hidden" name="kind" value="entity" />
          <Input name="name" placeholder="Name" required />
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="default" /> Default</label>
          <Button type="submit" variant="secondary">Add entity</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Merchants</h2>
        <ul className="mt-2 space-y-1 text-sm">{merchants.map((merchant) => <li key={merchant.id}>{merchant.name} · {merchant.aliases.join(", ")}</li>)}</ul>
        <form action={simpleSettingAction} className="mt-3 grid gap-2">
          <input type="hidden" name="kind" value="merchant-merge" />
          <Select name="from">{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</Select>
          <Select name="into">{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</Select>
          <Button type="submit" variant="secondary">Merge first into second</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Connections</h2>
        <p className="mt-1 text-sm text-muted">Connect OpenClaw with a pairing code. The long-lived key never appears in Telegram.</p>
        <div className="mt-3"><ConnectionsPanel keys={keys} /></div>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Import</h2>
        <ImportPanel />
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Account</h2>
        <form action={accountAction} className="mt-3 grid gap-2">
          <Input name="timezone" defaultValue={user.timezone} />
          <Input name="largeAmount" defaultValue={(user.largeAmountCents / 100).toFixed(2)} inputMode="decimal" />
          <Input name="currentPassword" type="password" placeholder="Current password" />
          <Input name="nextPassword" type="password" placeholder="New password" />
          <Button type="submit">Save account</Button>
        </form>
        <form action={logoutAction} className="mt-3"><Button type="submit" variant="secondary">Log out</Button></form>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Export everything</h2>
        <div className="mt-2 flex gap-4 text-sm"><a className="min-h-11 text-accent" href="/api/export/all">JSON</a><a className="min-h-11 text-accent" href="/api/export/expenses?period=all">CSV</a></div>
      </Panel>
    </div>
  );
}
