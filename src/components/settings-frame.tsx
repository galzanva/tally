import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function SettingsBack({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <Link href="/settings" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Settings
      </Link>
      <h1 className="font-display text-3xl tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export function SettingsMenu({ groups }: { groups: { label: string; items: { href: string; title: string; body: string }[] }[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Pick a section. Each one has its own page.</p>
      </div>
      {groups.map((group) => (
        <section key={group.label}>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{group.label}</p>
          <ul className="mt-2 overflow-hidden rounded-3xl border border-white/10 bg-panel">
            {group.items.map((item) => (
              <li key={item.href} className="border-t border-white/10 first:border-t-0">
                <Link href={item.href} className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{item.body}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
