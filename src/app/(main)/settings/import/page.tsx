import { ImportPanel } from "@/components/settings-panels";
import { SettingsBack } from "@/components/settings-frame";
import { Panel } from "@/components/ui";

export default function ImportSettingsPage() {
  return (
    <div className="space-y-4">
      <SettingsBack title="Import" body="The workbook is Expenses-tracker.xlsx, tabs Q1-2026 through Q4-2026. A dry run changes nothing." />
      <Panel>
        <ImportPanel />
      </Panel>
    </div>
  );
}
