"use client";

import { useState } from "react";
import { askAction, reviewAction } from "@/app/actions";
import { Button, EmptyState, MiniMarkdown, Panel, Textarea } from "@/components/ui";

const prompts = ["Where did my money go last month?", "Which subscriptions cost the most per year?", "How much did trading cost me in Q3?"];

export function InsightsBoard({ reviews }: { reviews: { id: string; title: string; bodyMd: string; periodKey: string; facts: unknown }[] }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const latest = reviews[0];
  return (
    <div className="space-y-4">
      {latest ? (
        <Panel>
          <p className="text-sm text-muted">{latest.periodKey}</p>
          <h2 className="font-display text-3xl">{latest.title}</h2>
          <div className="mt-3"><MiniMarkdown text={latest.bodyMd} /></div>
        </Panel>
      ) : (
        <EmptyState title="Your first review appears after a full month of data." body="You can generate the latest complete month whenever you want." action={<Button disabled={pending} onClick={async () => { setPending(true); const result = await reviewAction(); setPending(false); setMessage(result.ok ? "Review ready." : result.message); if (result.ok) location.reload(); }}>{pending ? "Writing…" : "Generate now"}</Button>} />
      )}
      {latest ? <Button disabled={pending} onClick={async () => { setPending(true); const result = await reviewAction(); setPending(false); setMessage(result.ok ? "Review updated." : result.message); if (result.ok) location.reload(); }}>{pending ? "Writing…" : "Generate now"}</Button> : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <Panel className="space-y-3">
        <h2 className="font-display text-2xl">Ask</h2>
        <div className="flex flex-wrap gap-2">{prompts.map((prompt) => <button key={prompt} className="min-h-11 rounded-full border border-white/10 px-3 text-left text-sm" onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div>
        <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about a period" />
        <Button onClick={async () => { const result = await askAction(question); if (!result.ok) setAnswer(result.message); else setAnswer(result.answer); }}>Ask</Button>
        {answer ? <p className="text-sm leading-6">{answer}</p> : null}
      </Panel>
      {reviews.slice(1).map((review) => (
        <Panel key={review.id}><h3 className="font-display text-xl">{review.title}</h3><MiniMarkdown text={review.bodyMd} /></Panel>
      ))}
    </div>
  );
}
