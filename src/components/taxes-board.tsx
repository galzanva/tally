"use client";

import { useState } from "react";
import { applyTaxAction, taxReviewAction } from "@/app/actions";
import { Button, Input, MiniMarkdown, Panel, Select } from "@/components/ui";
import type { TaxFinding } from "@/lib/tax";

type Payment = { id: string; occurredOn: string; merchant: string; amountCents?: number; amountFormatted: string; taxTag?: string };
type Missing = { id: string; occurredOn: string; merchant: string; entity: string; amountCents?: number; amountFormatted: string };

const PAGE_SIZE = 15;

export function TaxesBoard({ year, matrix, tags, payments, missing, initialFindings, initialBody }: {
  year: number;
  tags: string[];
  matrix: { entity: string; cells: { taxTag: string; totalFormatted: string }[] }[];
  payments: Payment[];
  missing: Missing[];
  initialFindings: TaxFinding[];
  initialBody: string | null;
}) {
  const [findings, setFindings] = useState(initialFindings);
  const [body, setBody] = useState(initialBody);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <form className="flex items-center gap-2" action="/taxes">
        <label className="text-sm text-muted" htmlFor="year" title="The calendar year these totals cover.">Year</label>
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
      <RecordList
        title="Tax payments"
        rows={payments}
        searchOf={(row) => `${row.occurredOn} ${row.merchant} ${row.amountFormatted} ${row.taxTag ?? ""}`}
        dateOf={(row) => row.occurredOn}
        amountOf={(row) => row.amountCents ?? centsFromFormatted(row.amountFormatted)}
        nameOf={(row) => row.merchant}
        filterLabel="Tax tag"
        allLabel="All tax tags"
        filterOf={(row) => row.taxTag ?? "Untagged"}
        empty="No tax payments this year."
        render={(row) => (
          <li key={row.id} className="flex justify-between gap-3 py-2 text-sm">
            <span>{row.occurredOn} {row.merchant}{row.taxTag ? <span className="text-muted"> · {row.taxTag}</span> : null}</span>
            <span className="tabular">{row.amountFormatted}</span>
          </li>
        )}
      />
      <RecordList
        title="Missing receipts"
        rows={missing}
        searchOf={(row) => `${row.occurredOn} ${row.merchant} ${row.entity} ${row.amountFormatted}`}
        dateOf={(row) => row.occurredOn}
        amountOf={(row) => row.amountCents ?? centsFromFormatted(row.amountFormatted)}
        nameOf={(row) => row.merchant}
        filterLabel="Entity"
        allLabel="All entities"
        filterOf={(row) => row.entity || "No entity"}
        empty="Every flagged expense has a receipt."
        render={(row) => (
          <li key={row.id} className="py-2 text-sm">{row.occurredOn} {row.merchant} · {row.entity} · <span className="tabular">{row.amountFormatted}</span></li>
        )}
      />
      <Button onClick={async () => {
        const result = await taxReviewAction(year);
        if (!result.ok) setMessage(result.message);
        else { setBody(result.body); setFindings(result.findings); setMessage(null); }
      }}>Run tax review</Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {body ? <Panel><MiniMarkdown text={body} /></Panel> : null}
      <RecordList
        title="Review items"
        rows={findings}
        searchOf={(row) => `${row.occurredOn} ${row.merchant} ${row.amountFormatted} ${row.reason} ${row.suggestedTaxTag ?? ""} ${row.suggestedEntity ?? ""}`}
        dateOf={(row) => row.occurredOn}
        amountOf={(row) => row.amountCents ?? centsFromFormatted(row.amountFormatted)}
        nameOf={(row) => row.merchant}
        filterLabel="Suggestion"
        allLabel="All suggestions"
        filterOf={(row) => row.suggestedTaxTag ?? row.suggestedEntity ?? "No suggestion"}
        empty="Nothing to review for this year."
        render={(finding) => (
          <li key={`${finding.expenseId}-${finding.reason}`} className="border-t border-white/5 py-3 text-sm">
            <p>{finding.occurredOn} {finding.merchant} {finding.amountFormatted}. {finding.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {finding.suggestedTaxTag ? <Button variant="secondary" onClick={() => applyTaxAction(finding.expenseId, { taxTag: finding.suggestedTaxTag as TaxFinding["suggestedTaxTag"] as never })}>Apply {finding.suggestedTaxTag}</Button> : null}
              {finding.suggestedEntity ? <Button variant="secondary" onClick={() => applyTaxAction(finding.expenseId, { entity: finding.suggestedEntity })}>Apply {finding.suggestedEntity}</Button> : null}
            </div>
          </li>
        )}
      />
      <p className="text-sm text-muted">Organizer, not tax advice. Confirm treatment with your preparer.</p>
      <a className="inline-flex min-h-11 items-center text-accent" href={`/api/tax-pack?year=${year}`}>Download Tax Pack</a>
    </div>
  );
}

function centsFromFormatted(value: string) {
  const negative = value.includes("(") || value.trim().startsWith("-") || value.includes("−");
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) * (negative ? -1 : 1);
}

function RecordList<T>({ title, rows, searchOf, dateOf, amountOf, nameOf, filterLabel, allLabel, filterOf, empty, render }: {
  title: string;
  rows: T[];
  searchOf: (row: T) => string;
  dateOf: (row: T) => string;
  amountOf: (row: T) => number;
  nameOf: (row: T) => string;
  filterLabel: string;
  allLabel: string;
  filterOf: (row: T) => string;
  empty: string;
  render: (row: T) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [seen, setSeen] = useState(rows.length);
  if (seen !== rows.length) {
    setSeen(rows.length);
    setPage(1);
  }
  const filters = [...new Set(rows.map(filterOf))].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const needle = query.trim().toLowerCase();
  const matched = rows.filter((row) => {
    if (filter !== "all" && filterOf(row) !== filter) return false;
    if (!needle) return true;
    return searchOf(row).toLowerCase().includes(needle);
  });
  const sorted = [...matched].sort((a, b) => {
    if (sort === "oldest") return dateOf(a).localeCompare(dateOf(b)) || nameOf(a).localeCompare(nameOf(b));
    if (sort === "amount-desc") return amountOf(b) - amountOf(a);
    if (sort === "amount-asc") return amountOf(a) - amountOf(b);
    if (sort === "name") return nameOf(a).localeCompare(nameOf(b));
    return dateOf(b).localeCompare(dateOf(a)) || nameOf(a).localeCompare(nameOf(b));
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const startIndex = (current - 1) * PAGE_SIZE;
  const visible = sorted.slice(startIndex, startIndex + PAGE_SIZE);
  const start = sorted.length ? startIndex + 1 : 0;
  const end = Math.min(sorted.length, startIndex + PAGE_SIZE);
  return (
    <Panel>
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
        <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={`Search ${title.toLowerCase()}`} aria-label={`Search ${title}`} />
        <Select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} aria-label={filterLabel} title={`Filter by ${filterLabel.toLowerCase()}`}>
          <option value="all">{allLabel}</option>
          {filters.map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
        <Select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label={`Sort ${title}`} title="Sort this list">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount-desc">Highest amount</option>
          <option value="amount-asc">Lowest amount</option>
          <option value="name">Name</option>
        </Select>
      </div>
      {sorted.length === 0 ? <p className="mt-4 text-sm text-muted">{rows.length === 0 ? empty : "Nothing matches."}</p> : (
        <>
          <ul className="mt-2 divide-y divide-white/5">{visible.map((row) => render(row))}</ul>
          {pages > 1 ? (
            <nav className="mt-3 flex items-center justify-between gap-3" aria-label={`${title} pages`}>
              <p className="text-sm text-muted tabular">{start}–{end} of {sorted.length}</p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</Button>
                <Button type="button" variant="secondary" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</Button>
              </div>
            </nav>
          ) : <p className="mt-3 text-sm text-muted tabular">{sorted.length} {sorted.length === 1 ? "row" : "rows"}</p>}
        </>
      )}
    </Panel>
  );
}
