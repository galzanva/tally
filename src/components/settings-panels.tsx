"use client";

import { useState } from "react";
import { deleteRevokedKeyAction, importAction, manualKeyAction, pairingAction, revokeKeyAction } from "@/app/actions";
import { Button, Dialog, Panel, Textarea } from "@/components/ui";
import { SCOPES } from "@/lib/seed";

export function ConnectionsPanel({ keys, connectMessage }: { keys: { id: string; name: string; prefix: string; lastUsedAt: string | null; revokedAt: string | null }[]; connectMessage: string }) {
  const [setup, setSetup] = useState<{ code: string; message: string } | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [removing, setRemoving] = useState<(typeof keys)[number] | null>(null);
  return (
    <div className="space-y-4">
      <form action={async (formData) => setSetup(await pairingAction(formData))} className="space-y-3">
        {SCOPES.map((scope) => <label key={scope} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={scope} defaultChecked /> {scope}</label>)}
        <Button type="submit">Generate</Button>
      </form>
      {setup ? (
        <Panel>
          <p className="font-display text-3xl tracking-widest">{setup.code}</p>
          <Textarea readOnly value={setup.message} className="mt-3" />
          <Button type="button" variant="secondary" onClick={() => navigator.clipboard.writeText(setup.message)}>Copy setup message</Button>
        </Panel>
      ) : null}
      <form action={async (formData) => setManual((await manualKeyAction(formData)).apiKey)}>
        <Button type="submit" variant="secondary">Create key</Button>
      </form>
      {manual ? <Panel><p className="text-sm text-muted">Copy this key now. It will not be shown again. Save it in ~/.openclaw/secrets/tally.json, then paste the connection prompt. The prompt does not contain the key.</p><p className="mt-2 break-all font-mono text-sm">{manual}</p></Panel> : null}
      <Panel>
        <p className="text-sm text-muted">Already have a key? Save it on the OpenClaw machine as ~/.openclaw/secrets/tally.json with permissions 600, then paste this prompt. Leave the key out of the chat.</p>
        <Textarea readOnly value={connectMessage} className="mt-3" />
        <Button type="button" variant="secondary" onClick={() => navigator.clipboard.writeText(connectMessage)}>Copy connection prompt</Button>
      </Panel>
      <ul className="space-y-2">
        {keys.map((key) => (
          <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border border-white/10 px-3 py-2 text-sm">
            <span>{key.name} · {key.prefix}… · {key.revokedAt ? "revoked" : key.lastUsedAt ? `last used ${key.lastUsedAt}` : "never used"}</span>
            {key.revokedAt
              ? <Button variant="danger" onClick={() => setRemoving(key)}>Delete</Button>
              : <Button variant="danger" onClick={() => revokeKeyAction(key.id).then(() => location.reload())}>Revoke</Button>}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(removing)} onOpenChange={() => setRemoving(null)} title="Delete this revoked key?" description={removing ? `${removing.name} · ${removing.prefix}… leaves the list. Expenses it created stay.` : ""}>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setRemoving(null)}>Keep it</Button>
          <Button variant="danger" onClick={() => removing && deleteRevokedKeyAction(removing.id).then(() => location.reload())}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function ImportPanel() {
  const [report, setReport] = useState<string | null>(null);
  return (
    <form className="space-y-3" action={async (formData) => {
      const result = await importAction(formData);
      setReport(result.ok ? JSON.stringify(result.report, null, 2) : result.message);
    }}>
      <input name="file" type="file" accept=".xlsx" className="min-h-11" />
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="dryRun" /> Dry run</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="createRecurring" /> Create recurring templates</label>
      <Button type="submit">Import spreadsheet</Button>
      {report ? <pre className="overflow-x-auto text-xs text-muted">{report}</pre> : null}
    </form>
  );
}
