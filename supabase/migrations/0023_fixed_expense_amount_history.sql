-- Despesa fixa ganha histórico de valor (AI_CONTEXT.md "Despesas fixas — histórico de valor"),
-- a pedido do usuário: hoje `fixed_expenses.amount` é um único valor que vale pra vida inteira da
-- despesa, então subir o aluguel de 1500 pra 2000 reescreve retroativamente todo mês já visto no
-- orçamento (mesmo problema, e mesmo raciocínio, que motivou budgets virar month-scoped na
-- migration 0009 — "subir um orçamento sobrescrevia silenciosamente o histórico").
--
-- fixed_expenses.amount é MANTIDA (não removida) como cache do valor mais recente — usada onde
-- "o valor atual" já bastava (ex: pré-preencher o form de edição, o piso de orçamento pra mês
-- atual/próximo em _shared.ts, que por construção nunca precisa de um valor passado). Só
-- getFixedExpenses(month), que é chamada pra QUALQUER mês incluindo passado, precisa resolver o
-- valor que valia NAQUELE mês — daí a tabela de histórico abaixo.
create table public.fixed_expense_amount_history (
  id uuid not null default gen_random_uuid(),
  fixed_expense_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  effective_from date not null, -- primeiro dia do mês a partir do qual esse valor vale (inclusive)
  created_at timestamp with time zone default now(),
  constraint fixed_expense_amount_history_pkey primary key (id),
  constraint fixed_expense_amount_history_fixed_expense_id_fkey foreign key (fixed_expense_id) references public.fixed_expenses(id) on delete cascade,
  constraint fixed_expense_amount_history_unique unique (fixed_expense_id, effective_from)
);
create index fixed_expense_amount_history_lookup_idx on public.fixed_expense_amount_history (fixed_expense_id, effective_from desc);

alter table public.fixed_expense_amount_history enable row level security;
create policy "own fixed expense amount history" on public.fixed_expense_amount_history
  for all using (exists (select 1 from public.fixed_expenses fe where fe.id = fixed_expense_amount_history.fixed_expense_id and fe.user_id = auth.uid()))
  with check (exists (select 1 from public.fixed_expenses fe where fe.id = fixed_expense_amount_history.fixed_expense_id and fe.user_id = auth.uid()));

-- Backfill: uma entrada por despesa fixa já existente, valendo "desde sempre" (1970-01-01) — isso
-- preserva exatamente o comportamento já visto até hoje (o valor atual sempre valeu em todo mês
-- exibido). Só uma edição de valor FEITA A PARTIR DE AGORA cria um ponto de corte de verdade.
insert into public.fixed_expense_amount_history (fixed_expense_id, amount, effective_from)
select id, amount, '1970-01-01'::date from public.fixed_expenses;
