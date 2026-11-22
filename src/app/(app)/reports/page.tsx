import Link from "next/link";
import { getReports } from "@/services/reports.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/ui/help-button";
import { ChartColumn } from "lucide-react";
import { ReportFormDialog } from "@/features/reports/components/report-form-dialog";
import { CARD_BASIS_LABELS, describeReportPeriod } from "@/features/reports/period-labels";

export default async function ReportsPage() {
  const [reports, accounts, categories] = await Promise.all([getReports(), getAccounts(), getCategories()]);
  const categoryName = new Map(categories.map((c) => [c.id, `${c.icon ?? ""} ${c.name}`.trim()]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Relatórios</h1>
          <HelpButton title="Relatórios">
            <p>Um relatório é um filtro salvo com nome — por exemplo “Poker” com suas categorias de poker, ou “Viagem” com as datas da viagem.</p>
            <p>Abra um relatório para ver os gráficos do período; o período relativo (“últimos 3 meses”, “este ano”) é recalculado toda vez que você abre.</p>
          </HelpButton>
        </div>
        <ReportFormDialog categories={categories} accounts={accounts} />
      </div>

      {reports.length === 0 ? (
        <Card elevation="sm" className="items-start gap-2">
          <CardTitle>Nenhum relatório ainda</CardTitle>
          <p className="text-sm opacity-70">
            Crie um relatório escolhendo período, categorias, contas ou um texto da descrição — ele fica salvo aqui pra você reabrir quando quiser.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => {
            const categoryLabels = report.categoryIds.map((id) => categoryName.get(id)).filter(Boolean) as string[];
            return (
              <Link key={report.id} href={`/reports/${report.id}`} className="group">
                <Card elevation="sm" className="h-full gap-2 group-hover:border-accent">
                  <CardKicker className="flex items-center gap-1"><ChartColumn className="size-3" strokeWidth={1.5} /> {describeReportPeriod(report)}</CardKicker>
                  <CardTitle className="text-lg">{report.name}</CardTitle>
                  <CardMeta className="flex-wrap gap-1">
                    {categoryLabels.length === 0 ? (
                      <Badge>Todas as categorias</Badge>
                    ) : (
                      categoryLabels.slice(0, 3).map((label) => <Badge key={label}>{label}</Badge>)
                    )}
                    {categoryLabels.length > 3 && <Badge>+{categoryLabels.length - 3}</Badge>}
                    {report.descriptionSearch && <Badge>“{report.descriptionSearch}”</Badge>}
                    {report.cardBasis === "purchase" && <Badge>{CARD_BASIS_LABELS.purchase}</Badge>}
                  </CardMeta>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
