import { accountAction, logoutAction } from "@/app/actions";
import { SettingsBack } from "@/components/settings-frame";
import { Button, Input, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export default async function AccountSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const { user } = await requireUser();
  return (
    <div className="space-y-4">
      <SettingsBack title="Account & password" body="Timezone, the amount that needs a confirmation, and your password." />
      {query.saved ? <p className="text-sm text-accent">Saved.</p> : null}
      {query.error === "password" ? <p className="text-sm text-warn">That current password didn't match.</p> : null}
      {query.error === "short" ? <p className="text-sm text-warn">The new password needs at least 10 characters.</p> : null}
      {query.error === "timezone" ? <p className="text-sm text-warn">Use a timezone like America/New_York.</p> : null}
      <Panel>
        <form action={accountAction} className="grid gap-3">
          <label className="grid gap-1 text-sm text-muted">Timezone
            <Input name="timezone" defaultValue={user.timezone} autoComplete="off" />
          </label>
          <label className="grid gap-1 text-sm text-muted">Confirm amounts at or above
            <Input name="largeAmount" defaultValue={(user.largeAmountCents / 100).toFixed(2)} inputMode="decimal" />
          </label>
          <label className="grid gap-1 text-sm text-muted">Current password
            <Input name="currentPassword" type="password" autoComplete="current-password" placeholder="Only needed to change the password" />
          </label>
          <label className="grid gap-1 text-sm text-muted">New password
            <Input name="nextPassword" type="password" autoComplete="new-password" placeholder="At least 10 characters" />
          </label>
          <Button type="submit">Save account</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-display text-xl">Sign out</h2>
        <p className="mt-1 text-sm text-muted">This browser session ends. The account stays.</p>
        <form action={logoutAction} className="mt-3"><Button type="submit" variant="secondary">Log out</Button></form>
      </Panel>
    </div>
  );
}
