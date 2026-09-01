import Link from "next/link";
import { getCategories } from "@/services/categories.service";
import { getProfile } from "@/services/profile.service";
import { Card, CardTitle, CardKicker } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryFormDialog } from "@/features/categories/components/category-form-dialog";
import { SubcategoryFormDialog } from "@/features/categories/components/subcategory-form-dialog";
import { DeleteCategoryDialog } from "@/features/categories/components/delete-category-dialog";
import { User, PackagePlus, Pencil } from "lucide-react";
import { HelpButton } from "@/components/ui/help-button";
import { ResetHelpHintsButton } from "@/features/settings/components/reset-help-hints-button";

export default async function SettingsPage() {
  const [categories, profile] = await Promise.all([getCategories(), getProfile()]);
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const incomeCategories = categories.filter((c) => c.type === "INCOME");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="font-heading text-2xl font-semibold">Configurações</h1>
        <HelpButton title="Configurações">
          <p>Suas categorias e subcategorias — crie, edite ou apague (com opção de reclassificar o que já foi lançado nelas).</p>
          <p>&quot;Importar categorias padrão&quot; reabre o pacote inicial pra pegar algo que faltou, tipo &quot;Transporte&quot; só quando você comprar um carro.</p>
        </HelpButton>
      </div>

      <Card elevation="sm" className="max-w-md">
        <CardKicker className="flex items-center gap-1"><User className="size-3" strokeWidth={1.5} /> Perfil</CardKicker>
        <CardTitle>{profile.name ?? "Sem nome"}</CardTitle>
        <p className="text-sm opacity-70">{profile.email}</p>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Ajuda</h2>
        <p className="text-xs opacity-60">
          Cada gráfico e alguns campos têm um &quot;?&quot; que abre sozinho na primeira vez que você vê a tela. Reative se quiser rever as explicações do começo.
        </p>
        <ResetHelpHintsButton />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Categorias</h2>
          <Button asChild variant="secondary" size="sm">
            <Link href="/onboarding"><PackagePlus className="size-3.5" strokeWidth={1.5} /> Importar categorias padrão</Link>
          </Button>
        </div>
        <p className="text-xs opacity-60">
          Importa mais categorias do pacote inicial que você ainda não usa — útil quando sua vida financeira muda (ex: comprar um carro e importar &quot;Transporte&quot; depois).
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Categorias de despesa</h2>
          <CategoryFormDialog defaultType="EXPENSE" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {expenseCategories.map((category) => (
            <Card key={category.id} elevation="sm" className="gap-2" frame={false}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-heading font-semibold">
                  <span className="size-2.5" style={{ background: category.color }} />
                  {category.icon} {category.name}
                </span>
                {category.isSystem ? (
                  <Badge variant="neutral">sistema</Badge>
                ) : (
                  <div className="flex items-center gap-1">
                    <CategoryFormDialog
                      category={category}
                      trigger={
                        <button className="p-1.5 -m-1.5 text-text/40 hover:text-accent" aria-label="Editar categoria">
                          <Pencil className="size-3.5" strokeWidth={1.5} />
                        </button>
                      }
                    />
                    <DeleteCategoryDialog target={{ kind: "category", id: category.id, name: category.name }} categories={categories} />
                  </div>
                )}
              </div>
              {!category.isSystem && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {category.subcategories.map((s) => (
                    <span key={s.id} className="flex items-center gap-1 bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-800">
                      {s.name}
                      <DeleteCategoryDialog target={{ kind: "subcategory", id: s.id, name: s.name, parentCategoryId: category.id }} categories={categories} />
                    </span>
                  ))}
                  <SubcategoryFormDialog categoryId={category.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Categorias de receita</h2>
          <CategoryFormDialog defaultType="INCOME" />
        </div>
        <p className="text-xs opacity-60">Categorias de receita não têm subcategoria — use a descrição do lançamento para detalhar.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {incomeCategories.map((category) => (
            <Card key={category.id} elevation="sm" className="gap-2" frame={false}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-heading font-semibold">
                  <span className="size-2.5" style={{ background: category.color }} />
                  {category.icon} {category.name}
                </span>
                {category.isSystem ? (
                  <Badge variant="neutral">sistema</Badge>
                ) : (
                  <div className="flex items-center gap-1">
                    <CategoryFormDialog
                      category={category}
                      trigger={
                        <button className="p-1.5 -m-1.5 text-text/40 hover:text-accent" aria-label="Editar categoria">
                          <Pencil className="size-3.5" strokeWidth={1.5} />
                        </button>
                      }
                    />
                    <DeleteCategoryDialog target={{ kind: "category", id: category.id, name: category.name }} categories={categories} />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
