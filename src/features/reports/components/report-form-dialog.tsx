"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogActions, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CategoryCheckboxFilter } from "@/components/ui/category-checkbox-filter";
import { cn } from "@/lib/utils/cn";
import { Plus, SlidersHorizontal } from "lucide-react";
import { reportSchema } from "@/lib/validations/reports";
import { createReportAction, updateReportAction } from "../actions";
import { CARD_BASIS_LABELS, PERIOD_OPTIONS } from "../period-labels";
import type { AccountDTO, CategoryDTO, ReportDTO, ReportPeriodPreset } from "@/types/dto";

const ACCOUNT_GROUP_LABELS: Record<AccountDTO["type"], string> = {
  CASH: "Dinheiro",
  BANK: "Bancos",
  CREDIT_CARD: "Cartões",
};

type FormState = {
  name: string;
  periodPreset: ReportPeriodPreset;
  periodStart: string;
  periodEnd: string;
  cardBasis: ReportDTO["cardBasis"];
  includeProjections: boolean;
  categoryIds: string[];
  subcategoryIds: string[];
  accountIds: string[];
  descriptionSearch: string;
};

function initialState(report?: ReportDTO): FormState {
  return {
    name: report?.name ?? "",
    periodPreset: report?.periodPreset ?? "month",
    periodStart: report?.periodStart ?? "",
    periodEnd: report?.periodEnd ?? "",
    cardBasis: report?.cardBasis ?? "competence",
    includeProjections: report?.includeProjections ?? true,
    categoryIds: report?.categoryIds ?? [],
    subcategoryIds: report?.subcategoryIds ?? [],
    accountIds: report?.accountIds ?? [],
    descriptionSearch: report?.descriptionSearch ?? "",
  };
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function setGroupIds(list: string[], ids: string[], checked: boolean): string[] {
  const next = new Set(list);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return [...next];
}

/** Create / edit a saved report — every filter the dashboard has, plus period, description and card basis. */
export function ReportFormDialog({
  report,
  categories,
  accounts,
}: {
  report?: ReportDTO;
  categories: CategoryDTO[];
  accounts: AccountDTO[];
}) {
  const isEdit = !!report;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initialState(report));

  // Re-sync from the saved report every time the dialog opens (same pattern as the other edit dialogs).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(initialState(report));
      setError(null);
    }
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Ids that no longer exist (a deleted category/account) are silently dropped on the next save.
  const knownCategoryIds = new Set(categories.map((c) => c.id));
  const knownAccountIds = new Set(accounts.map((a) => a.id));
  const selectedCategoryIds = form.categoryIds.filter((id) => knownCategoryIds.has(id));

  const categoryGroups = [
    { label: "Receitas", items: categories.filter((c) => c.type === "INCOME") },
    { label: "Despesas", items: categories.filter((c) => c.type === "EXPENSE") },
  ];

  // Subcategories offered: those of the chosen categories (or of every category when none is chosen).
  const subcategoryParents = categories.filter(
    (c) => c.subcategories.length > 0 && (selectedCategoryIds.length === 0 || selectedCategoryIds.includes(c.id))
  );
  const subcategoryGroups = subcategoryParents.map((c) => ({
    label: `${c.icon ?? ""} ${c.name}`.trim(),
    items: c.subcategories.map((s) => ({ id: s.id, name: s.name, icon: null })),
  }));
  const offeredSubcategoryIds = new Set(subcategoryGroups.flatMap((g) => g.items.map((i) => i.id)));
  const selectedSubcategoryIds = form.subcategoryIds.filter((id) => offeredSubcategoryIds.has(id));

  const accountGroups = (["CASH", "BANK", "CREDIT_CARD"] as const)
    .map((type) => ({
      label: ACCOUNT_GROUP_LABELS[type],
      items: accounts.filter((a) => a.type === type).map((a) => ({ id: a.id, name: a.name, icon: null })),
    }))
    .filter((g) => g.items.length > 0);

  function handleSubmit() {
    setError(null);
    const parsed = reportSchema.safeParse({
      name: form.name,
      periodPreset: form.periodPreset,
      periodStart: form.periodPreset === "custom" ? form.periodStart || null : null,
      periodEnd: form.periodPreset === "custom" ? form.periodEnd || null : null,
      cardBasis: form.cardBasis,
      includeProjections: form.includeProjections,
      categoryIds: selectedCategoryIds,
      subcategoryIds: selectedSubcategoryIds,
      accountIds: form.accountIds.filter((id) => knownAccountIds.has(id)),
      descriptionSearch: form.descriptionSearch.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateReportAction(report.id, parsed.data);
          setOpen(false);
          router.refresh();
        } else {
          const id = await createReportAction(parsed.data);
          setOpen(false);
          router.push(`/reports/${id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar relatório");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="sm" variant="secondary">
            <SlidersHorizontal className="size-3.5" strokeWidth={1.5} /> Editar filtros
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-3.5" strokeWidth={1.5} /> Novo relatório
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isEdit ? "Editar relatório" : "Novo relatório"}</DialogTitle>

        <Field>
          <Label>Nome</Label>
          <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex: Poker, Viagem Chile..." />
        </Field>

        <Field>
          <Label>Período</Label>
          <Select value={form.periodPreset} onValueChange={(v) => update("periodPreset", v as ReportPeriodPreset)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {form.periodPreset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <Label>De</Label>
              <Input type="date" value={form.periodStart} onChange={(e) => update("periodStart", e.target.value)} />
            </Field>
            <Field>
              <Label>Até</Label>
              <Input type="date" value={form.periodEnd} min={form.periodStart || undefined} onChange={(e) => update("periodEnd", e.target.value)} />
            </Field>
          </div>
        )}

        <Field>
          <Label>Categorias</Label>
          <CategoryCheckboxFilter
            groups={categoryGroups}
            activeIds={selectedCategoryIds}
            onToggle={(id) => update("categoryIds", toggleId(selectedCategoryIds, id))}
            onToggleGroup={(ids, checked) => update("categoryIds", setGroupIds(selectedCategoryIds, ids, checked))}
            onClear={() => update("categoryIds", [])}
            triggerClassName="w-full"
          />
        </Field>

        {subcategoryGroups.length > 0 && (
          <Field>
            <Label>Subcategorias</Label>
            <CategoryCheckboxFilter
              groups={subcategoryGroups}
              activeIds={selectedSubcategoryIds}
              onToggle={(id) => update("subcategoryIds", toggleId(selectedSubcategoryIds, id))}
              onClear={() => update("subcategoryIds", [])}
              placeholder="Todas as subcategorias"
              triggerClassName="w-full"
            />
            {selectedSubcategoryIds.length > 0 && (
              <p className="text-xs opacity-60">Só entram lançamentos dessas subcategorias — receitas não têm subcategoria, então ficam de fora.</p>
            )}
          </Field>
        )}

        <Field>
          <Label>Contas e cartões</Label>
          <CategoryCheckboxFilter
            groups={accountGroups}
            activeIds={form.accountIds.filter((id) => knownAccountIds.has(id))}
            onToggle={(id) => update("accountIds", toggleId(form.accountIds, id))}
            onToggleGroup={(ids, checked) => update("accountIds", setGroupIds(form.accountIds, ids, checked))}
            onClear={() => update("accountIds", [])}
            placeholder="Todas as contas"
            triggerClassName="w-full"
          />
        </Field>

        <Field>
          <Label>Descrição contém</Label>
          <Input
            value={form.descriptionSearch}
            onChange={(e) => update("descriptionSearch", e.target.value)}
            placeholder="Ex: Chile (opcional)"
          />
        </Field>

        <Field>
          <Label>Compras no cartão</Label>
          <div className="grid grid-cols-2 border border-divider text-sm">
            {(["competence", "purchase"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => update("cardBasis", value)}
                className={cn(
                  "border-l border-divider px-2 py-1.5 first:border-l-0",
                  form.cardBasis === value ? "bg-accent text-bg" : "hover:bg-text/[0.06]"
                )}
              >
                {CARD_BASIS_LABELS[value]}
              </button>
            ))}
          </div>
          <p className="text-xs opacity-60">
            {form.cardBasis === "competence"
              ? "Cada parcela entra no mês da fatura — mostra o impacto mês a mês."
              : "Cada compra entra uma vez, pelo valor total, na data da compra — mostra quanto aquilo custou."}
          </p>
        </Field>

        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">Incluir despesas previstas</span>
            <span className="text-xs opacity-60">Despesas programadas e parcelamentos ainda não pagos, do mês atual em diante — igual ao dashboard.</span>
          </span>
          <Switch checked={form.includeProjections} onCheckedChange={(v) => update("includeProjections", v)} />
        </label>

        <FieldError>{error}</FieldError>
        <DialogActions>
          <DialogClose asChild>
            <Button variant="secondary" size="sm" type="button">Cancelar</Button>
          </DialogClose>
          <Button size="sm" type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? "Salvando..." : isEdit ? "Salvar" : "Criar relatório"}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
