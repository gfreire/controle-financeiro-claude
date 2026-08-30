-- Metas — parte 3 de 4: as categorias system de resgate.
--
-- Um REDEEM (saque de uma meta pra uma conta) carrega uma dessas duas categorias, escolhida
-- automaticamente pelo saldo vs. alvo no momento do saque (sobrescrevível por um toggle dedicado
-- de 2 opções no dialog — nunca pelo CategorySelect, que filtra is_system):
--   - "Resgate de Meta Concluída": o saldo já tinha atingido o goal_target — resgate legítimo,
--     objetivo cumprido.
--   - "Resgate de Meta Antecipado": o saldo estava abaixo do alvo — o sinal de "tive que mexer
--     no dinheiro guardado" (emergência / descuido), no espírito do sinal de "Ajuste".
--
-- Tipo INCOME (o dinheiro volta pro bolso do usuário) — mas isso é irrelevante pra analytics:
-- REDEEM já é excluído por `type in ('INCOME','EXPENSE')` em toda query de gráfico/soma, então a
-- categoria é rótulo puro + alça de filtro em /transactions (getTransactions não restringe type).
-- Mesma mecânica de "Pagamento de Cartão" (migration 0031). Ver AI_CONTEXT.md "Metas".
--
-- O rendimento de meta NÃO ganha categoria nova — reusa a "Rendimentos" já existente (cofrinho
-- rende igual conta, só separado). Como 0017/0018/0030/0031, é só um INSERT de catálogo — nenhuma
-- tabela/coluna nova, sem NOTIFY pgrst.

insert into public.categories (id, name, type, icon, color, is_system, is_default)
values
  (gen_random_uuid(), 'Resgate de Meta Concluída', 'INCOME', '🎯', '#16a34a', true, false),
  (gen_random_uuid(), 'Resgate de Meta Antecipado', 'INCOME', '⚠️', '#f59e0b', true, false);
