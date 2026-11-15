"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Landmark, Plus, Receipt, Repeat, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/taxes", label: "Taxes", icon: Landmark },
];

export function BackgroundGlows() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="glow absolute -left-24 -top-24 size-[28rem] rounded-full bg-[var(--glow-1)] blur-3xl" />
      <div className="glow glow-b absolute -right-20 top-0 size-[26rem] rounded-full bg-[var(--glow-2)] blur-3xl" />
      <div className="glow glow-c absolute bottom-0 left-1/3 size-[24rem] rounded-full bg-[var(--glow-3)] blur-3xl" />
    </div>
  );
}

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="font-display text-2xl tracking-tight">Tally</Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={cn("inline-flex min-h-11 items-center rounded-full px-3 text-sm", active ? "bg-white/10 text-fg" : "text-muted hover:text-fg")} aria-current={active ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/settings" className="ml-auto inline-flex size-11 items-center justify-center rounded-full hover:bg-white/5" aria-label="Settings">
          <Settings className="size-5" />
        </Link>
      </div>
    </header>
  );
}

export function Dock() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-bg/90 backdrop-blur-xl md:hidden" aria-label="Primary" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {links.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link href={link.href} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[11px]", active ? "text-accent" : "text-muted")} aria-current={active ? "page" : undefined}>
                <Icon className="size-5" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AddButton() {
  const pathname = usePathname();
  if (pathname !== "/" && pathname !== "/expenses") return null;
  return (
    <Link href={pathname === "/" ? "/expenses?new=1" : "/expenses?new=1"} className="fixed bottom-24 right-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg md:bottom-8" aria-label="Add expense">
      <Plus className="size-6" />
    </Link>
  );
}
