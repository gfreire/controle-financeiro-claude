import { getGoals, getGoalAccumulation } from "@/services/goals.service";
import { getAccounts } from "@/services/accounts.service";
import { HelpButton } from "@/components/ui/help-button";
import { GoalFormDialog } from "@/features/goals/components/goal-form-dialog";
import { GoalCard } from "@/features/goals/components/goal-card";
import { GoalAccumulationChart } from "@/features/goals/components/goal-accumulation-chart";

/**
 * "Metas" — dinheiro que o usuário já tem e separa ativamente rumo a um objetivo (com valor-alvo
 * e, opcionalmente, aporte mensal e/ou prazo). Espelho invertido da Receita Programada; nomes
 * internos são `goal*`. Ver AI_CONTEXT.md "Metas".
 */
export default async function GoalsPage() {
  const [goals, accounts, accumulation] = await Promise.all([getGoals(), getAccounts(), getGoalAccumulation()]);
  const liquidAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">Metas</h1>
          <HelpButton title="Metas">
            <p>Dinheiro que você separa de uma conta rumo a um objetivo — com um valor-alvo e, se quiser, um aporte mensal e/ou um prazo.</p>
            <p>&quot;Aportar&quot; move dinheiro da conta pra meta; &quot;Rendimento&quot; registra o quanto rendeu; &quot;Resgatar&quot; devolve pra uma conta.</p>
            <p>Aporte e resgate não contam como receita/despesa — só o rendimento conta, como numa conta que rende.</p>
          </HelpButton>
        </div>
        <GoalFormDialog accounts={liquidAccounts} />
      </div>
      <p className="text-sm opacity-70">
        O valor guardado sai das suas contas e fica reservado aqui. Ele não conta como despesa — só volta a ser gastável quando você resgata.
      </p>

      {goals.length === 0 ? (
        <p className="text-sm opacity-60">Nenhuma meta criada ainda.</p>
      ) : (
        <>
          <GoalAccumulationChart data={accumulation} />
          <div className="flex flex-col gap-4">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} accounts={liquidAccounts} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
