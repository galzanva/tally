import { SettingsBack } from "@/components/settings-frame";
import { Panel } from "@/components/ui";

export default function ExportSettingsPage() {
  return (
    <div className="space-y-4">
      <SettingsBack title="Export" body="JSON is the whole ledger. CSV is every expense, including older years." />
      <Panel>
        <div className="grid gap-2">
          <a className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-medium text-on-accent" href="/api/export/all">Download JSON</a>
          <a className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm" href="/api/export/expenses?period=all">Download CSV</a>
        </div>
      </Panel>
    </div>
  );
}
