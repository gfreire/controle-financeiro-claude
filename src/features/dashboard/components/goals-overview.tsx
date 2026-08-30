import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DonutWithTotal } from "@/components/ui/donut-with-total";
import { formatCurrency } from "@/lib/utils/currency";
import { Target } from "lucide-react";
import type { GoalsOverviewDTO } from "@/types/dto";

function statusBadge(status: GoalsOverviewDTO["goals"][number]["status"], offset?: number) {
  const n = offset ?? 0;
  const months = (v: number) => `${v} ${v === 1 ? "mês" : "meses"}`;
  switch (status) {
    case "REACHED":
      return <Badge variant="success">Atingida</Badge>;
    case "AHEAD":
      return <Badge variant="success">Adiantado {months(n)}</Badge>;
    case "BEHIND":
      return <Badge variant="danger">Atrasado {months(-n)}</Badge>;
    case "ON_TRACK":
      return <Badge variant="success">Em dia</Badge>;
    default:
      return <Badge variant="neutral">Sem prazo</Badge>;
  }
}

/** Dashboard "Metas" block — one compact donut + status per goal. Omitted entirely when there
 * are no goals (page-level check). */
export function GoalsOverview({ data }: { data: GoalsOverviewDTO }) {
  if (data.goals.length === 0) return null;

  return (
    <Card elevation="sm" className="gap-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5"><Target className="size-4" strokeWidth={1.5} /> Metas</CardTitle>
        <Link href="/goals" className="text-xs text-accent underline hover:opacity-80">Ver metas</Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.goals.map((g) => {
          const saved = Math.max(0, Math.min(g.currentBalance, g.goalTarget));
          const remaining = Math.max(0, g.goalTarget - g.currentBalance);
          return (
            <div key={g.id} className="flex flex-col gap-1.5 border border-divider p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{g.name}</span>
                {statusBadge(g.status, g.scheduleOffsetMonths)}
              </div>
              <DonutWithTotal
                data={[
                  { id: "saved", name: "Guardado", value: saved, color: "var(--color-success-500)" },
                  { id: "left", name: "Falta", value: remaining, color: "var(--color-divider)" },
                ]}
                total={g.goalTarget}
                centerLabel={`${g.progressPercent}%`}
                centerSubLabel={formatCurrency(g.currentBalance)}
                emptyMessage="Sem valor guardado ainda."
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
