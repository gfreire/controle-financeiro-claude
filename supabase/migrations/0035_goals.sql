-- Metas — parte 2 de 4: as tabelas.
--
-- `goals` é o cabeçalho (nome + alvo + cronograma). Ver AI_CONTEXT.md "Metas" pro modelo completo.
--   - goal_target: obrigatório e > 0 — é o "valor total" do donut e a coisa que se "alcança".
--   - monthly_contribution: OPCIONAL — dá pra guardar sem um aporte fixo ("junto o que der").
--   - end_date: OPCIONAL — se preenchido, o aporte mensal é (re)calculado pra concluir a tempo.
--   - start_competence: mês a partir do qual o cronograma conta (primeiro dia do mês, mesma
--     convenção de debts.start_competence / fixed_expenses.start_competence).
--   - anchor_date: onde a "perna" atual do cronograma começa. Nasce = start_competence; o
--     "Recalcular" (ou editar a end_date) tira um snapshot e passa anchor_date = hoje,
--     regravando monthly_contribution a partir do saldo atual. O ledger (RESERVE/REDEEM/
--     goal_yields) NUNCA é tocado por um rebase — "o que já foi feito" é sempre o saldo
--     calculado ao vivo em anchor_date. Ver AI_CONTEXT.md "Metas" → "Recalcular".
--   Sem coluna de saldo: currentBalance = Σ RESERVE − Σ REDEEM + Σ goal_yields, calculado no
--   service, igual reservoirs/debts.
--
-- `goal_yields` é o registro de rendimento informado ("Informar rendimento", delta contra o
-- saldo calculado — mesma UX de accounts.service#registerYield) E o rendimento reconhecido no
-- resgate (quando se saca acima do saldo de livro). Só valores positivos na v1. Entra no
-- dashboard como RECEITA sintética sob "Rendimentos" (nunca uma transação real — igual "Compras
-- retroativas", migration 0030), então NÃO aparece no Explorador de Lançamentos.
--   - origin_redeem_transaction_id: NULL para um rendimento informado; setado (FK ON DELETE
--     CASCADE) quando o rendimento foi reconhecido dentro de um resgate — apagar aquele REDEEM
--     apaga junto essa linha, sem matching frágil por data.
--
-- `transactions.goal_id`: liga um RESERVE/REDEEM à meta. ON DELETE SET NULL — apagar a meta
-- deixa o histórico de dinheiro real intacto em Movimentações, só solta o vínculo (mesma ideia
-- de reservoir_transactions.linked_transaction_id).

create table public.goals (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  goal_target numeric(14,2) not null check (goal_target > 0),
  start_competence date not null,
  end_date date,
  monthly_contribution numeric(14,2) check (monthly_contribution is null or monthly_contribution > 0),
  anchor_date date not null,
  created_at timestamp with time zone default now(),
  constraint goals_pkey primary key (id),
  constraint goals_user_id_fkey foreign key (user_id) references auth.users(id),
  constraint goals_end_after_start check (end_date is null or end_date >= start_competence)
);

create table public.goal_yields (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null,
  description text,
  origin_redeem_transaction_id uuid, -- NULL = rendimento informado; setado = reconhecido num resgate (cascateia com ele)
  created_at timestamp with time zone default now(),
  constraint goal_yields_pkey primary key (id),
  constraint goal_yields_user_id_fkey foreign key (user_id) references auth.users(id),
  constraint goal_yields_goal_id_fkey foreign key (goal_id) references public.goals(id) on delete cascade,
  constraint goal_yields_origin_redeem_transaction_id_fkey foreign key (origin_redeem_transaction_id) references public.transactions(id) on delete cascade
);

alter table public.transactions add column goal_id uuid;
alter table public.transactions
  add constraint transactions_goal_id_fkey foreign key (goal_id) references public.goals(id) on delete set null;

create index goals_user_id_idx on public.goals (user_id);
create index goal_yields_goal_id_idx on public.goal_yields (goal_id);
create index goal_yields_user_id_idx on public.goal_yields (user_id);
create index transactions_goal_id_idx on public.transactions (goal_id) where goal_id is not null;

alter table public.goals enable row level security;
create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.goal_yields enable row level security;
create policy "own goal yields" on public.goal_yields
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
