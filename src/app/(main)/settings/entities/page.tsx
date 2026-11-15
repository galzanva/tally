import { EntitiesManager } from "@/components/settings-records";
import { SettingsBack } from "@/components/settings-frame";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";

function notice(error?: string) {
  if (error === "name") return "The name can't be empty.";
  if (error === "taken") return "That name is already in use.";
  if (error === "in-use") return "That entity is on an expense or a recurring bill, so it stays.";
  if (error === "last") return "Keep at least one entity.";
  return null;
}

export default async function EntitiesSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { user } = await requireUser();
  const entities = await forUser(user.id).entity.findMany({ orderBy: { name: "asc" } });
  const message = notice(query.error);
  return (
    <div className="space-y-4">
      <SettingsBack title="Entities" body="Add one, rename it, or delete one that nothing uses. New expenses use the default." />
      {message ? <p className="text-sm text-warn">{message}</p> : null}
      <EntitiesManager rows={entities.map((entity) => ({ id: entity.id, name: entity.name, isDefault: entity.isDefault }))} />
    </div>
  );
}
