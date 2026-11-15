"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:opacity-50 min-h-11 px-4 text-sm",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:brightness-110",
        secondary: "border border-white/10 bg-white/5 text-fg hover:bg-white/10",
        ghost: "bg-transparent text-fg hover:bg-white/5",
        danger: "bg-danger text-white",
        warn: "bg-warn text-on-accent",
      },
      size: { md: "min-h-11", icon: "size-11 px-0" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({ className, variant, size, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-fg outline-none placeholder:text-faint", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-base text-fg outline-none placeholder:text-faint", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("min-h-11 w-full rounded-2xl border border-white/10 bg-[#0c1214] px-3 text-base text-fg", props.className)} />;
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-3xl border border-white/10 bg-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl", className)}>{children}</section>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{children}</p>;
}

export function Chip({ active, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button {...props} className={cn("min-h-11 rounded-full border px-3 text-sm", active ? "border-transparent bg-accent text-on-accent" : "border-white/10 text-fg hover:bg-white/5", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-white/20 border-t-accent", className)} role="status" aria-label="Loading" />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Panel className="flex flex-col items-start gap-3 py-8">
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action}
    </Panel>
  );
}

export function MoneyText({ cents, currency = "USD", className }: { cents: number; currency?: string; className?: string }) {
  const refund = cents < 0;
  return <span className={cn("tabular", refund ? "text-accent" : "text-fg", className)}>{formatMoney(cents, currency)}</span>;
}

export function Dialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(92dvh,40rem)] w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-white/10 bg-[#0c1214] p-5 focus:outline-none">
          <DialogPrimitive.Title className="font-display text-2xl">{title}</DialogPrimitive.Title>
          {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description> : null}
          <div className="mt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({ open, onOpenChange, title, children, footer }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[100vw] flex-col border-l border-white/10 bg-[#0c1214] focus:outline-none sm:w-[min(32rem,100%)] md:w-[min(44rem,calc(100vw-8rem))]">
          <div className="flex items-center justify-between px-4 py-3">
            <DialogPrimitive.Title className="font-display text-2xl">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="inline-flex size-11 items-center justify-center rounded-full hover:bg-white/5" aria-label="Close">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          {footer ? <div className="border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function MiniMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-6 text-fg/90">
      {text.split("\n").map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-2" />;
        if (line.startsWith("### ")) return <h3 key={index} className="font-display text-lg">{line.slice(4)}</h3>;
        if (line.startsWith("## ")) return <h2 key={index} className="font-display text-xl">{line.slice(3)}</h2>;
        if (line.startsWith("- ")) return <p key={index} className="pl-4 before:mr-2 before:content-['·']">{line.slice(2)}</p>;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}
