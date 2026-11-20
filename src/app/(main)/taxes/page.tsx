import { TaxesBoard } from "@/components/taxes-board";
import { requireUser } from "@/lib/auth";
import { todayYmd, yearKey } from "@/lib/dates";
import { forUser } from "@/lib/db";
import { taxFindings, taxMatrix } from "@/lib/tax";
import type { TaxFinding } from "@/lib/tax";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TaxesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireUser();
  const params = await searchParams;
  const year = Number(one(params.year) ?? yearKey(todayYmd(user.timezone)));
  const packed = await taxMatrix(user.id, year);
  const db = forUser(user.id);
  const insight = await db.insight.findFirst({ where: { kind: "TAX_REVIEW", periodKey: String(year) } });
  const facts = insight?.facts as { findings?: TaxFinding[] } | null;
  const findings = facts?.findings ?? await taxFindings(user.id, year);
  return (
    <TaxesBoard
      year={year}
      tags={packed.tags}
      matrix={packed.matrix}
      payments={packed.payments}
      missing={packed.missing}
      initialFindings={findings}
      initialBody={insight?.bodyMd ?? null}
    />
  );
}
