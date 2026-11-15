import { SettingsMenu } from "@/components/settings-frame";

const groups = [
  {
    label: "Account",
    items: [
      { href: "/settings/account", title: "Account & password", body: "Timezone, the large-amount line, and your password." },
      { href: "/settings/export", title: "Export", body: "Download the ledger as JSON or CSV." },
    ],
  },
  {
    label: "Ledger",
    items: [
      { href: "/settings/categories", title: "Categories", body: "Rename or archive spending categories." },
      { href: "/settings/entities", title: "Entities", body: "Whose cost it is. Personal is the default." },
      { href: "/settings/payments", title: "Payment methods", body: "Cards and cash. Last four digits only." },
      { href: "/settings/merchants", title: "Merchants", body: "Merge aliases so one shop stays one shop." },
    ],
  },
  {
    label: "Bring data in",
    items: [
      { href: "/settings/connections", title: "OpenClaw", body: "Pairing codes and API keys." },
      { href: "/settings/import", title: "Import", body: "Bring in the old spreadsheet." },
    ],
  },
];

export default function SettingsPage() {
  return <SettingsMenu groups={groups} />;
}
