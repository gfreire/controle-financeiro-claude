import Link from "next/link";
import { getUser } from "@/lib/auth/getUser";
import { getAvailableDefaultCategories } from "@/services/categories.service";
import { getProfile } from "@/services/profile.service";
import { completeOnboarding } from "./actions";
import { Card, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryTreeItem } from "@/features/categories/components/category-tree-item";
import { Wallet2, PartyPopper } from "lucide-react";

export default async function OnboardingPage() {
  await getUser();
  const [options, profile] = await Promise.all([getAvailableDefaultCategories(), getProfile()]);
  const isFirstTime = !profile.onboardingCompleted;
  const expenseOptions = options.filter((c) => c.type === "EXPENSE");
  const incomeOptions = options.filter((c) => c.type === "INCOME");

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 p-4">
      <div className="flex items-center gap-2">
        <Wallet2 className="size-6 text-accent" strokeWidth={1.5} />
        <h1 className="font-heading text-2xl font-semibold">
          {isFirstTime ? "Escolha suas categorias" : "Importar mais categorias"}
        </h1>
      </div>
      <p className="text-sm opacity-80">
        {isFirstTime
          ? "Este é o pacote inicial de categorias. Escolha as que fazem sentido para sua vida financeira — elas serão copiadas para sua conta e você pode editar ou criar novas depois."
          : "Categorias que você ainda não importou. Útil quando sua vida financeira muda — por exemplo, importar \"Transporte\" só quando você comprar um carro."}
      </p>
      <p className="text-xs opacity-60">
        Cada categoria pode ser aberta pra escolher só as subcategorias que fazem sentido pra você — por exemplo, manter &quot;Moradia&quot; mas só com &quot;Aluguel&quot;, sem &quot;IPTU&quot;.
      </p>

      {options.length === 0 ? (
        <Card frame={false} className="items-center gap-2 text-center">
          <PartyPopper className="size-6 text-accent" strokeWidth={1.5} />
          <CardTitle className="text-base">Você já importou todas as categorias padrão</CardTitle>
          <CardBody>Não sobrou nenhuma categoria nova do pacote inicial. Você pode criar categorias personalizadas nas Configurações.</CardBody>
          <Button asChild size="sm"><Link href={isFirstTime ? "/dashboard" : "/settings"}>Voltar</Link></Button>
        </Card>
      ) : (
        <form action={completeOnboarding} className="flex flex-col gap-6">
          <input type="hidden" name="redirectTo" value={isFirstTime ? "/dashboard" : "/settings"} />

          {expenseOptions.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-accent">Despesas</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {expenseOptions.map((category) => (
                  <CategoryTreeItem key={category.id} category={category} initialChecked={isFirstTime} />
                ))}
              </div>
            </section>
          )}

          {incomeOptions.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-accent">Receitas</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {incomeOptions.map((category) => (
                  <CategoryTreeItem key={category.id} category={category} initialChecked={isFirstTime} />
                ))}
              </div>
            </section>
          )}

          {isFirstTime && (
            <Card frame={false} className="border-dashed">
              <CardTitle className="text-sm">Sempre disponíveis</CardTitle>
              <CardBody>Juros, Rendimentos e Ajuste já ficam disponíveis automaticamente para todos — não precisam ser escolhidos aqui.</CardBody>
            </Card>
          )}

          <div className="flex gap-2">
            {!isFirstTime && (
              <Button asChild variant="secondary" className="flex-1"><Link href="/settings">Cancelar</Link></Button>
            )}
            <Button type="submit" className="flex-1">
              {isFirstTime ? "Continuar para o Dashboard" : "Importar selecionadas"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
