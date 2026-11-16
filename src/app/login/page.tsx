"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { BackgroundGlows, ThemeToggle } from "@/components/shell";
import { Button, Input, Panel } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <BackgroundGlows />
      <Panel className="w-full max-w-md">
        <p className="font-display text-4xl">Tally</p>
        <p className="mt-1 text-sm text-muted">Sign in. Accounts are created by the admin script.</p>
        <form action={action} className="mt-6 space-y-3">
          <Input name="email" type="email" autoComplete="username" placeholder="Email" required />
          <Input name="password" type="password" autoComplete="current-password" placeholder="Password" required />
          {state?.message ? <p className="text-sm text-warn">{state.message}</p> : null}
          <Button type="submit" disabled={pending} className="w-full">{pending ? "Checking…" : "Log in"}</Button>
        </form>
      </Panel>
    </main>
  );
}
