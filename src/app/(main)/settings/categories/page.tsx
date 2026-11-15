import { CategoriesManager } from "@/components/settings-records";
import { SettingsBack } from "@/components/settings-frame";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";

function notice(error?: string) {
  if (error === "name") return "The name can't be empty.";
  if (error === "taken") return "That name is already in use.";
  return null;
}

export default async function CategoriesSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { user } = await requireUser();
  const categories = await forUser(user.id).category.findMany({ orderBy: { sortOrder: "asc" } });
  const message = notice(query.error);
  return (
    <div className="space-y-4">
      <SettingsBack title="Categories" body="Add a category, rename one, or archive one you no longer use. Past expenses keep their category." />
      {message ? <p className="text-sm text-warn">{message}</p> : null}
      <CategoriesManager rows={categories.filter((category) => !category.archivedAt).map((category) => ({ id: category.id, name: category.name }))} />
    </div>
  );
}
