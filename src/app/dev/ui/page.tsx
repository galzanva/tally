"use client";

import { useState } from "react";
import { BackgroundGlows } from "@/components/shell";
import { Button, Chip, Dialog, EmptyState, Eyebrow, Input, MoneyText, Panel, Sheet, Spinner, Textarea } from "@/components/ui";

export default function DevUiPage() {
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <main className="relative mx-auto max-w-3xl space-y-4 px-4 py-8">
      <BackgroundGlows />
      <Eyebrow>Vault components</Eyebrow>
      <h1 className="font-display text-4xl">Dev UI</h1>
      <Panel className="flex flex-wrap gap-2">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="warn">Warn</Button>
        <Button disabled>Disabled</Button>
        <Spinner />
      </Panel>
      <Panel className="space-y-3">
        <Input placeholder="Amount" />
        <Textarea placeholder="Notes" />
        <div className="flex gap-2"><Chip active>Active</Chip><Chip>Idle</Chip></div>
        <MoneyText cents={2340} className="text-2xl" />
        <MoneyText cents={-1250} className="text-2xl" />
      </Panel>
      <EmptyState title="Nothing here yet." body="This is the empty state." action={<Button>Add expense</Button>} />
      <div className="flex gap-2">
        <Button onClick={() => setDialog(true)}>Open dialog</Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>Open sheet</Button>
      </div>
      <Dialog open={dialog} onOpenChange={setDialog} title="Delete Chick-fil-A?" description="Spent $12.50 today.">
        <div className="flex gap-2"><Button variant="secondary" onClick={() => setDialog(false)}>Keep it</Button><Button variant="danger">Delete</Button></div>
      </Dialog>
      <Sheet open={sheet} onOpenChange={setSheet} title="Add expense" footer={<Button onClick={() => setSheet(false)}>Save expense</Button>}>
        <Input inputMode="decimal" defaultValue="12.50" className="font-display text-4xl" />
      </Sheet>
    </main>
  );
}
