-- Estorno/reembolso: novo par de categorias is_system "Estorno" (mirroring "Ajuste", que também
-- precisa de duas linhas já que type é obrigatório) + card_refunds, a tabela que registra um
-- crédito no cartão (funciona como um pagamento, mas sem uma conta pagadora real por trás — o
-- dinheiro nunca saiu de uma conta rastreada do usuário, foi a loja/emissor que creditou).
-- Decidido 2026-08-23, a pedido do usuário, depois que a auditoria do sistema apontou que não
-- havia nenhuma forma de registrar um estorno sem inflar RECEITA com uma categoria sem relação,
-- ou sem reescrever a compra original. Ver AI_CONTEXT.md "Estorno" para o desenho completo.

insert into public.categories (id, name, type, icon, color, is_system, is_default)
values
  (gen_random_uuid(), 'Estorno', 'EXPENSE', '↩️', '#0ea5e9', true, false),
  (gen_random_uuid(), 'Estorno', 'INCOME', '↩️', '#0ea5e9', true, false);

-- Rastreabilidade apenas — quem de fato reclassifica a transação original para "Estorno" (EXPENSE)
-- é a própria coluna category_id já existente. Auto-FK, ON DELETE SET NULL pra nunca cascatear
-- a exclusão de um lado pro outro (mesma convenção de reservoir_transactions.linked_transaction_id).
alter table public.transactions
  add column refund_of_transaction_id uuid references public.transactions(id) on delete set null;

create table public.card_refunds (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  card_purchase_id uuid not null,
  credit_card_id uuid not null,
  category_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  refund_date date not null,
  created_at timestamp with time zone default now(),
  constraint card_refunds_pkey primary key (id),
  constraint card_refunds_user_id_fkey foreign key (user_id) references auth.users(id),
  constraint card_refunds_card_purchase_id_fkey foreign key (card_purchase_id) references public.card_purchases(id) on delete cascade,
  constraint card_refunds_credit_card_id_fkey foreign key (credit_card_id) references public.accounts(id),
  constraint card_refunds_category_id_fkey foreign key (category_id) references public.categories(id),
  -- Só estorno integral por enquanto (decidido pelo usuário: "pra ser reembolso creio que tenha
  -- que ser o total") — uma compra só pode ser estornada uma vez.
  constraint card_refunds_card_purchase_id_key unique (card_purchase_id)
);

alter table public.card_refunds enable row level security;
create policy "own card refunds" on public.card_refunds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index card_refunds_credit_card_id_idx on public.card_refunds (credit_card_id);
create index card_refunds_refund_date_idx on public.card_refunds (refund_date);
create index transactions_refund_of_transaction_id_idx on public.transactions (refund_of_transaction_id);
