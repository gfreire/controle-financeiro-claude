import { getReservoirs, getReservoirTransactions } from "@/services/reservoirs.service";
import { getAccounts } from "@/services/accounts.service";
import { getCategories } from "@/services/categories.service";
import { Card, CardKicker, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { Vault, Plus, ArrowDownToLine } from "lucide-react";
import { ReservoirFormDialog } from "@/features/reservoirs/components/reservoir-form-dialog";
import { AccrualDialog } from "@/features/reservoirs/components/accrual-dialog";
import { WithdrawalDialog } from "@/features/reservoirs/components/withdrawal-dialog";

export default async function ReservoirsPage() {
  const [reservoirs, accounts, categories] = await Promise.all([getReservoirs(), getAccounts(), getCategories()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Receita Programada</h1>
        <ReservoirFormDialog categories={categories} />
      </div>
      <p className="text-sm opacity-70">
        Valor acumulado que ainda não é dinheiro real — projeções ou ganhos já sabidos mas ainda não recebidos.
        Não afeta saldos ou análises até ser sacado.
      </p>

      {reservoirs.length === 0 ? (
        <p className="text-sm opacity-60">Nenhuma receita programada criada ainda.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {await Promise.all(
            reservoirs.map(async (reservoir) => {
              const entries = await getReservoirTransactions(reservoir.id);
              return (
                <Card key={reservoir.id} elevation="sm" className="gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardKicker className="flex items-center gap-1"><Vault className="size-3" strokeWidth={1.5} /> {reservoir.categoryName ?? "Sem categoria padrão"}</CardKicker>
                      <CardTitle>{reservoir.name}</CardTitle>
                      <div className="text-xl font-semibold tabular-nums">{formatCurrency(reservoir.balance)}</div>
                    </div>
                    <div className="flex gap-2">
                      <AccrualDialog reservoirId={reservoir.id} reservoirName={reservoir.name} trigger={<Button size="sm" variant="secondary"><Plus className="size-3.5" strokeWidth={1.5} /> Acúmulo</Button>} />
                      <WithdrawalDialog
                        reservoirId={reservoir.id}
                        accounts={accounts.filter((a) => a.type !== "CREDIT_CARD")}
                        trigger={<Button size="sm"><ArrowDownToLine className="size-3.5" strokeWidth={1.5} /> Sacar</Button>}
                      />
                    </div>
                  </div>

                  {entries.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm">
                      {entries.slice(0, 8).map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between border-b border-text/[0.06] py-1">
                          <span className="opacity-70">{formatDate(entry.date)} {entry.description && `· ${entry.description}`}</span>
                          <span className={entry.amount >= 0 ? "text-success-600 tabular-nums" : "text-danger-600 tabular-nums"}>
                            {formatCurrency(entry.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
