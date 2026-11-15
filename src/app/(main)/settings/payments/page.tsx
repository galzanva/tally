import { PaymentsManager } from "@/components/settings-records";
import { SettingsBack } from "@/components/settings-frame";
import { requireUser } from "@/lib/auth";
import { forUser } from "@/lib/db";

function notice(error?: string) {
  if (error === "name") return "The name can't be empty.";
  if (error === "taken") return "That name is already in use.";
  return null;
}

export default async function PaymentsSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { user } = await requireUser();
  const methods = await forUser(user.id).paymentMethod.findMany({ orderBy: { name: "asc" } });
  const message = notice(query.error);
  return (
    <div className="space-y-4">
      <SettingsBack title="Payment methods" body="Add a card or cash method, change it, or remove it. Full numbers are never stored." />
      {message ? <p className="text-sm text-warn">{message}</p> : null}
      <PaymentsManager rows={methods.map((method) => ({ id: method.id, name: method.name, type: method.type, last4: method.last4 }))} />
    </div>
  );
}
