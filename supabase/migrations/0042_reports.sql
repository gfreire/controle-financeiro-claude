-- Relatórios salvos (/reports) — um conjunto de filtros com nome que o usuário reabre e edita
-- (ex.: "Poker" = categorias de entrada/saída de poker em "Todo o período"; "Viagem Chile" =
-- datas da viagem + "descrição contém Chile" + compras pelo valor cheio). Ver AI_CONTEXT.md
-- "Relatórios".
--
-- A tabela guarda SÓ a definição dos filtros, nunca números: tudo que o relatório mostra é
-- recalculado a cada abertura pelo dashboard.service (mesma regra de "nunca guardar o que dá pra
-- calcular").
--
-- period_preset é o período RELATIVO ("últimos 3 meses" continua significando os últimos 3 meses
-- quando o relatório for reaberto daqui a um ano); period_start/period_end só valem para
-- 'custom'. Valores = DashboardPeriodPreset em src/lib/utils/date.ts.
--
-- card_basis: 'competence' = parcelas pela competência (o impacto mês a mês, igual ao dashboard);
-- 'purchase' = cada compra pelo valor cheio na data da compra (quanto aquilo custou de fato).
-- Decisão do usuário: os dois pontos de vista são úteis, então é uma escolha por relatório.
--
-- category_ids/subcategory_ids/account_ids são arrays sem FK (de propósito): um filtro salvo não
-- é histórico, e prender categorias/contas por RESTRICT obrigaria o fluxo guiado de exclusão de
-- categoria a conhecer relatórios. Um id que deixou de existir simplesmente não casa com nada —
-- o editor descarta ids desconhecidos ao salvar de novo.
create table public.reports (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  period_preset text not null default 'month'
    check (period_preset in ('month', 'lastMonth', 'last3', 'last6', 'last12', 'year', 'lastYear', 'all', 'custom')),
  period_start date,
  period_end date,
  card_basis text not null default 'competence' check (card_basis in ('competence', 'purchase')),
  include_projections boolean not null default true,
  category_ids uuid[] not null default '{}',
  subcategory_ids uuid[] not null default '{}',
  account_ids uuid[] not null default '{}',
  description_search text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint reports_pkey primary key (id),
  constraint reports_user_id_fkey foreign key (user_id) references auth.users(id),
  constraint reports_custom_period check (
    period_preset <> 'custom' or (period_start is not null and period_end is not null and period_end >= period_start)
  )
);

create index reports_user_id_idx on public.reports (user_id);

alter table public.reports enable row level security;
create policy "own reports" on public.reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- `db push` não recarrega o schema cache do PostgREST (ver 0020).
notify pgrst, 'reload schema';
