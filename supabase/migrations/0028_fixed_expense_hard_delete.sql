-- Despesas Programadas (fixed_expenses) — remove o soft-delete, passa a ser DELETE de verdade.
--
-- Decidido 2026-08-25, a pedido do usuário, depois de encontrar o bug que o "active = false"
-- causava: excluir uma despesa programada só marcava active=false, mas a linha (e o
-- fixed_expense_id que ela deixava em transactions/card_purchases) continuava existindo pra
-- sempre. getUnlinkedExpenseCandidates só lista despesas com fixed_expense_id IS NULL — então uma
-- compra/transação vinculada a uma despesa "excluída" (mas só desativada por baixo dos panos)
-- nunca reaparecia como candidata pra "Vincular lançamento existente" se o usuário recriasse a
-- despesa fixa (exatamente o caso real descrito em AI_CONTEXT.md "Despesas fixas — vincular
-- pagamento já lançado": apagou "Claude" sem querer, a compra do cartão já vinculada ficava presa
-- a um fixed_expense_id órfão, sem forma de linkar de novo).
--
-- O usuário foi explícito: excluir uma despesa programada NUNCA deve apagar ou afetar a compra/
-- transação real que ela gerou — só deve tirar o vínculo, deixando o registro "limpo" (sem
-- fixed_expense_id) pra poder ser relinkado depois. Isso já é exatamente o que
-- transactions.fixed_expense_id / card_purchases.fixed_expense_id fazem hoje (ON DELETE SET NULL,
-- ver schema.sql) — o problema nunca foi o schema, foi o service nunca chegar a rodar um DELETE de
-- verdade. fixed_expense_amount_history (ON DELETE CASCADE) desaparece junto, o que é o esperado:
-- é só o histórico de valor DESTA despesa específica, sem nenhum sentido fora dela.
--
-- Toda linha já desativada (active = false) até hoje é removida de verdade agora — é exatamente
-- o estado que o usuário já esperava que "excluir" significasse. Qualquer transactions/
-- card_purchases ainda apontando pra uma delas fica automaticamente sem o vínculo (SET NULL),
-- nunca apagada.
DELETE FROM public.fixed_expenses WHERE active = false;

ALTER TABLE public.fixed_expenses DROP COLUMN active;
