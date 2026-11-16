import { ConnectionsPanel } from "@/components/settings-panels";
import { SettingsBack } from "@/components/settings-frame";
import { requireUser } from "@/lib/auth";
import { existingKeyMessage, listKeys } from "@/lib/keys";

export default async function ConnectionsSettingsPage() {
  const { user } = await requireUser();
  const keys = await listKeys(user.id);
  return (
    <div className="space-y-4">
      <SettingsBack title="OpenClaw" body="Generate a pairing code, paste the setup message in Telegram, and the key stays out of the chat." />
      <ConnectionsPanel keys={keys} connectMessage={existingKeyMessage()} />
    </div>
  );
}
