-- Receitas Recorrentes ("Receita Recorrente" na UI — NÃO "Receita Programada", que é o /reservoirs) — o espelho de "Despesas Programadas" para entradas previsíveis
-- (salário, mesada, aluguel recebido). Ver AI_CONTEXT.md "Receitas Recorrentes".
--
-- É um TEMPLATE + checklist do mês, nada mais: NÃO gera lançamento sintético no dashboard, NÃO
-- projeta em nenhum gráfico, NÃO impõe piso de orçamento. O ganho previsível só vira número
-- quando o dinheiro entra de verdade — aí `registerReceipt` cria uma transação INCOME normal
-- ligada por `transactions.recurring_income_id`. Isso mantém as "Money Reality Rules" intactas
-- (diferente da exceção de despesas projetadas do dashboard) e deixa o cadastro mensal de quem
-- tem salário fixo em um clique.
--
-- Por que NÃO estender `fixed_expenses` com uma direção: aquela tabela está amarrada à lógica de
-- piso de orçamento (`_shared.ts`) — uma linha de receita teria que ser blindada em toda função
-- de floor / na árvore / no reconcile. Tabela própria e isolada é mais simples e não toca em nada.
--
-- Convenções herdadas de fixed_expenses/reservoirs:
--   - amount: cache do valor atual (não há histórico por mês na v1 — o valor real de cada mês
--     está na transação que ele gera). > 0.
--   - day_of_month 1-28 (mesma faixa de credit_cards.closing_day/due_day e debts.due_day, pra
--     nunca precisar tratar fevereiro).
--   - start_competence / end_competence: janela de vigência (primeiro dia do mês). Fora dela a
--     receita não aparece no mês. Mesma ideia de fixed_expenses.start_competence/end_competence.
--   - active: soft-delete (como reservoirs/budgets). getRecurringIncomes() filtra active = true.
--
-- category_id é `ON DELETE SET NULL` (NÃO RESTRICT como fixed_expenses/reservoirs): uma receita
-- programada não carrega histórico próprio — o histórico vive nas transações que ela gera, e
-- essas mantêm a categoria delas. Perder a categoria-padrão (uma dica de preenchimento) é
-- inofensivo e não justifica ligar isto no fluxo guiado de exclusão de categoria.
create table public.recurring_incomes (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 28),
  default_account_id uuid,
  category_id uuid,
  start_competence date not null default '1970-01-01',
  end_competence date,
  active boolean not null default true,
  created_at timestamp with time zone default now(),
  constraint recurring_incomes_pkey primary key (id),
  constraint recurring_incomes_user_id_fkey foreign key (user_id) references auth.users(id),
  constraint recurring_incomes_default_account_id_fkey foreign key (default_account_id) references public.accounts(id) on delete set null,
  constraint recurring_incomes_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null,
  constraint recurring_incomes_competence_window check (end_competence is null or end_competence >= start_competence)
);

-- Liga a transação INCOME criada por registerReceipt à receita programada — espelho exato de
-- transactions.fixed_expense_id / transactions.goal_id. ON DELETE SET NULL: apagar a receita
-- programada deixa a transação real intacta em Movimentações, só solta o vínculo.
alter table public.transactions add column recurring_income_id uuid;
alter table public.transactions
  add constraint transactions_recurring_income_id_fkey foreign key (recurring_income_id) references public.recurring_incomes(id) on delete set null;

create index recurring_incomes_user_id_idx on public.recurring_incomes (user_id);
create index transactions_recurring_income_id_idx on public.transactions (recurring_income_id) where recurring_income_id is not null;

alter table public.recurring_incomes enable row level security;
create policy "own recurring incomes" on public.recurring_incomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
