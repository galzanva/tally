"use client";

import { useState } from "react";
import { ExpenseSheet } from "@/components/expenses-board";
import { MoneyText } from "@/components/ui";
import type { ExpenseDTO } from "@/lib/expenses";

type Option = { id: string; name: string };
type RecurringOption = { id: string; name: string; amountFormatted: string };

export function RecentExpenses(props: {
  expenses: ExpenseDTO[];
  categories: Option[];
  methods: Option[];
  entities: (Option & { isDefault: boolean })[];
  merchants: Option[];
  bills: RecurringOption[];
  currency: string;
  largeAmountCents: number;
}) {
  const [editing, setEditing] = useState<ExpenseDTO | null>(null);
  return (
    <>
      <ul className="mt-2 divide-y divide-line">
        {props.expenses.map((expense) => (
          <li key={expense.id}>
            <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left text-sm hover:text-accent" onClick={() => setEditing(expense)}>
              <span className="truncate">{expense.merchant || expense.description}</span>
              <MoneyText cents={expense.amountCents} currency={props.currency} />
            </button>
          </li>
        ))}
      </ul>
      <ExpenseSheet
        open={Boolean(editing)}
        expense={editing}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        categories={props.categories}
        methods={props.methods}
        entities={props.entities}
        merchants={props.merchants}
        bills={props.bills}
        currency={props.currency}
        largeAmountCents={props.largeAmountCents}
      />
    </>
  );
}
