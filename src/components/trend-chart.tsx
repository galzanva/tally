"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "motion/react";
import { formatMoney } from "@/lib/money";

export function TrendChart({ points, currency }: { points: { label: string; totalCents: number }[]; currency: string }) {
  const reduced = useReducedMotion();
  return (
    <div className="h-48 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: "#93a199", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const cents = Number(payload[0].value ?? 0);
              return <div className="rounded-2xl border border-line bg-elevated px-3 py-2 text-sm tabular">{formatMoney(cents, currency)}</div>;
            }}
          />
          <Area type="monotone" dataKey="totalCents" stroke="oklch(0.80 0.15 165)" fill="rgba(255,255,255,0.08)" strokeWidth={2} isAnimationActive={!reduced} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
