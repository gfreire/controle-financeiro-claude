-- "Compras retroativas": nova categoria is_system, só INCOME (uma linha, não um par como Ajuste/
-- Estorno) — a parte de DESPESA de uma parcela retroativa já carrega a categoria de gasto real
-- da compra, então só falta o lado RECEITA ter uma categoria própria.
--
-- Contexto: uma parcela de "compra retroativa" (card_installments.paid_before_system = true, ver
-- AI_CONTEXT.md "Compras retroativas") já contava como RECEITA no resumo e na evolução mensal do
-- dashboard — dinheiro real pagou aquilo sem uma origem rastreada — mas esse valor era calculado
-- solto (dashboard.service.ts#fetchRetroactiveIncomeEntries) e ficava FORA do donut/barras de
-- categoria de RECEITA, porque não tinha categoria nenhuma pra agrupar. Resultado: o donut de
-- receita mostrava um total menor que a barra de receita da evolução mensal, sem explicação
-- visível. Decidido 2026-08-28, a pedido do usuário ("as parcelas retroativas têm categoria
-- então devem ser mostradas também... na parte de receita este valor está faltando ser listado").
--
-- Com esta categoria, fetchPeriodEntries passa a emitir essas parcelas como entradas INCOME
-- marcadas com esta categoria (mesma abordagem de "Estorno" INCOME em 0019), então os dois
-- gráficos reconciliam e a fatia é clicável sem o risco de um categoryId falso vazar num filtro
-- category_id.in(...) que espera uuid.

insert into public.categories (id, name, type, icon, color, is_system, is_default)
values
  (gen_random_uuid(), 'Compras retroativas', 'INCOME', '🕓', '#0d9488', true, false);
