"use client";

import { useState } from "react";
import { applyTaxAction, taxReviewAction } from "@/app/actions";
import { Button, MiniMarkdown, Panel } from "@/components/ui";
import type { TaxFinding } from "@/lib/tax";

export function TaxesBoard({ year, matrix, tags, payments, missing, initialFindings, initialBody }: {
  year: number;
  tags: string[];
  matrix: { entity: string; cells: { taxTag: string; totalFormatted: string }[] }[];
  payments: { id: string; occurredOn: string; merchant: string; amountFormatted: string }[];
  missing: { id: string; occurredOn: string; merchant: string; entity: string; amountFormatted: string }[];
  initialFindings: TaxFinding[];
  initialBody: string | null;
}) {
  const [findings, setFindings] = useState(initialFindings);
  const [body, setBody] = useState(initialBody);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <form className="flex items-center gap-2" action="/taxes">
        <label className="text-sm text-muted" htmlFor="year">Year</label>
        <input id="year" name="year" defaultValue={year} className="min-h-11 w-28 rounded-2xl border border-white/10 bg-white/5 px-3" />
        <Button type="submit" variant="secondary">Show</Button>
      </form>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead><tr><th className="py-2 pr-3">Entity</th>{tags.map((tag) => <th key={tag} className="px-2 py-2 font-normal text-muted">{tag}</th>)}</tr></thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.entity} className="border-t border-white/5">
                <th className="py-2 pr-3 font-medium">{row.entity}</th>
                {row.cells.map((cell) => <td key={cell.taxTag} className="px-2 py-2 tabular">{cell.totalFormatted}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Tax payments</h2>
        <ul className="mt-2 space-y-2 text-sm">{payments.map((row) => <li key={row.id} className="flex justify-between gap-3"><span>{row.occurredOn} {row.merchant}</span><span className="tabular">{row.amountFormatted}</span></li>)}</ul>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Missing receipts</h2>
        <ul className="mt-2 space-y-2 text-sm">{missing.map((row) => <li key={row.id}>{row.occurredOn} {row.merchant} · {row.entity} · {row.amountFormatted}</li>)}</ul>
      </Panel>
      <Button onClick={async () => {
        const result = await taxReviewAction(year);
        if (!result.ok) setMessage(result.message);
        else { setBody(result.body); setFindings(result.findings); setMessage(null); }
      }}>Run tax review</Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {body ? <Panel><MiniMarkdown text={body} /></Panel> : null}
      <ul className="space-y-2">
        {findings.map((finding) => (
          <li key={`${finding.expenseId}-${finding.reason}`} className="rounded-3xl border border-white/10 p-3 text-sm">
            <p>{finding.occurredOn} {finding.merchant} {finding.amountFormatted}. {finding.reason}</p>
            <div className="mt-2 flex gap-2">
              {finding.suggestedTaxTag ? <Button variant="secondary" onClick={() => applyTaxAction(finding.expenseId, { taxTag: finding.suggestedTaxTag as TaxFinding["suggestedTaxTag"] as never })}>Apply {finding.suggestedTaxTag}</Button> : null}
              {finding.suggestedEntity ? <Button variant="secondary" onClick={() => applyTaxAction(finding.expenseId, { entity: finding.suggestedEntity })}>Apply {finding.suggestedEntity}</Button> : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Organizer, not tax advice. Confirm treatment with your preparer.</p>
      <a className="inline-flex min-h-11 items-center text-accent" href={`/api/tax-pack?year=${year}`}>Download Tax Pack</a>
    </div>
  );
}
