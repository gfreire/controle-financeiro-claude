-- Crédito avulso no cartão ("Lançar crédito" — cards.service#registerCardCredit).
--
-- Decidido 2026-11-22, a pedido do usuário: um crédito que o emissor/lojista lança na fatura sem
-- corresponder ao estorno integral de uma compra cadastrada — ex.: a Amazon creditou R$ 133,44
-- proporcionais na fatura corrente ao migrar a assinatura Prime pro PicPay Plus, mas manteve as
-- parcelas de 13,90 da assinatura anual programadas nos meses seguintes. Também serve pra
-- reembolso do banco por erro, cashback, etc.
--
-- Reaproveita `card_refunds` em vez de criar uma tabela nova: ela já se comporta exatamente como
-- um crédito no cartão em todo lugar (abate a fatura no pool oldest-first de currentMonthPaidAmount,
-- entra em getCardBalanceThroughMonth/getCardTotalCommitted/creditBalance, e é RECEITA do mês de
-- refund_date em dashboard.service#fetchPeriodEntries pela própria category_id). Um crédito avulso
-- é simplesmente um card_refunds SEM compra vinculada:
--   - card_purchase_id passa a aceitar NULL. A constraint UNIQUE continua — em Postgres NULLs não
--     colidem, então o "não estornar a mesma compra duas vezes" do estorno integral segue valendo.
--   - description (nova, opcional) — o detalhe do crédito ("Proporcional Prime — PicPay Plus").
--
-- Categoria: nova is_system INCOME "Crédito no Cartão" (uma linha), NÃO "Estorno". "Estorno" é o
-- estorno integral de uma compra (com reclassificação da compra e antecipação das parcelas); um
-- crédito avulso não reclassifica nada — a despesa original continua na categoria real dela, e o
-- crédito entra como receita própria, então o líquido fica certo sem esconder o que foi cobrado.
-- O detalhe do motivo fica na descrição.

alter table public.card_refunds alter column card_purchase_id drop not null;
alter table public.card_refunds add column description text;

insert into public.categories (id, name, type, icon, color, is_system, is_default)
values
  (gen_random_uuid(), 'Crédito no Cartão', 'INCOME', '💚', '#10b981', true, false);

notify pgrst, 'reload schema';
