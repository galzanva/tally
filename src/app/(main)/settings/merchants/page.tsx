import { MerchantsManager } from "@/components/settings-records";
import { SettingsBack } from "@/components/settings-frame";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";

function notice(error?: string) {
  if (error === "name") return "The name can't be empty.";
  if (error === "taken") return "That name is already in use.";
  if (error === "same") return "Pick two different merchants to merge.";
  return null;
}

export default async function MerchantsSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { user } = await requireUser();
  const merchants = await forUser(user.id).merchant.findMany({ orderBy: { name: "asc" } });
  const message = notice(query.error);
  const rows = merchants.map((merchant) => ({ id: merchant.id, name: merchant.name, aliases: merchant.aliases }));
  return (
    <div className="space-y-4">
      <SettingsBack title="Merchants" body="Add a shop, rename it, delete it, or merge two names into one." />
      {message ? <p className="text-sm text-warn">{message}</p> : null}
      <MerchantsManager rows={rows} />
    </div>
  );
}
