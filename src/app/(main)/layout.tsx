import { AddButton, BackgroundGlows, Dock, TopBar } from "@/components/shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <BackgroundGlows />
      <TopBar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:pb-16">{children}</main>
      <Dock />
      <AddButton />
    </>
  );
}
