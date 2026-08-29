-- "Pagamento de Cartão": nova categoria is_system EXPENSE (uma linha só).
--
-- Decidido 2026-08-28, a pedido do usuário. Uma transação CREDIT_CARD_PAYMENT (o lado "pagar a
-- fatura" de cards.service#registerCardPayment) nunca teve categoria — o form de "Pagar fatura"
-- não pede uma, e as consultas de analytics ignoram CREDIT_CARD_PAYMENT por completo (ver
-- AI_CONTEXT.md "Transactions" / "Money Reality Rules"). O usuário pediu uma categoria system
-- dedicada pra rotular esses pagamentos: o usuário NUNCA pode escolhê-la num formulário
-- (is_system => fora de CategorySelect, ver "is_default vs is_system"), mas o sistema aplicá-la
-- automaticamente é útil — permite filtrar os pagamentos de fatura por categoria em
-- /transactions e abre espaço pra relatórios futuros.
--
-- Exceção documentada à regra "o type da categoria casa com o type da transação": um
-- CREDIT_CARD_PAYMENT não é INCOME nem EXPENSE, e não existe CategoryType pra ele. O usuário
-- escolheu EXPENSE explicitamente — um pagamento de fatura é conceitualmente uma saída. Isso
-- NÃO faz o pagamento entrar em nenhum total de despesa: fetchPeriodEntries /
-- getTransactionsFiltered / getFinancialSummary restringem `type in ('INCOME','EXPENSE')` na
-- própria query, então esta categoria nunca puxa um CREDIT_CARD_PAYMENT pra um gráfico ou soma.
--
-- Nota histórica: a migration 0006 removeu uma SUBcategoria "Pagamento de Cartão" do pacote
-- is_default (sob "Dívidas") justamente porque ela convidava o usuário a lançar o pagamento do
-- jeito errado (uma despesa categorizada em vez da transferência). Esta é o oposto: is_system,
-- nunca escolhível pelo usuário, aplicada só pelo próprio fluxo de pagamento (registerCardPayment).
--
-- Como 0017/0018/0030, é só um INSERT de catálogo + um UPDATE de dados — nenhuma tabela/coluna
-- nova, então não precisa do NOTIFY pgrst 'reload schema' que 0020/0022/etc. fazem.

insert into public.categories (id, name, type, icon, color, is_system, is_default)
values
  (gen_random_uuid(), 'Pagamento de Cartão', 'EXPENSE', '🧾', '#64748b', true, false);

-- Backfill: todo CREDIT_CARD_PAYMENT já existente (que nunca teve categoria) recebe a nova
-- categoria. Guardado por `category_id is null` pra ser idempotente e nunca sobrescrever algo
-- setado à mão via acesso direto ao banco.
update public.transactions t
set category_id = (
  select id from public.categories
  where is_system = true and name = 'Pagamento de Cartão' and type = 'EXPENSE'
)
where t.type = 'CREDIT_CARD_PAYMENT'
  and t.category_id is null;
