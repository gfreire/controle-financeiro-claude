-- Metas (feature "Goals" / rota /goals) — parte 1 de 4: os tipos de transação novos.
--
-- Decidido 2026-08-30, a pedido do usuário. Uma Meta é o espelho invertido da "Receita
-- Programada" (reservoirs): dinheiro que o usuário JÁ TEM e está separando ativamente rumo a um
-- objetivo, com um valor-alvo e (opcionalmente) um aporte mensal e/ou prazo. Ver AI_CONTEXT.md
-- "Metas".
--
-- Aportar/resgatar dinheiro de uma meta É um movimento de dinheiro real (sai/entra de uma conta
-- CASH/BANK), mas NÃO é receita nem despesa — é dinheiro seu mudando de bolso, exatamente como
-- TRANSFER. Modelamos isso com dois tipos novos em `transaction_type`:
--   - RESERVE: origin_account_id = conta de origem, goal_id setado, sem destino. Reduz o saldo da
--     conta (getAccountBalance soma toda transação por origin/destination, sem olhar o type).
--   - REDEEM: destination_account_id = conta que recebe, goal_id setado, sem origem. Aumenta o
--     saldo da conta. Carrega category_id = categoria system "Resgate de Meta ..." (migration
--     0036) — rótulo puro, porque toda query de analytics restringe `type in ('INCOME','EXPENSE')`
--     e nunca enxerga RESERVE/REDEEM (mesma proteção de TRANSFER/CREDIT_CARD_PAYMENT).
--
-- O rendimento de uma meta é dinheiro NOVO e conta como receita — mas vive em `goal_yields`
-- (migration 0035) e entra no dashboard como RECEITA sintética sob a categoria "Rendimentos", do
-- mesmo jeito que "Compras retroativas" (migration 0030) faz. Nunca é uma transação real.
--
-- ADD VALUE fica isolado neste arquivo (não usado como literal em nenhum DDL aqui) pra não
-- esbarrar no "unsafe use of new value" do Postgres quando um mesmo migration adiciona e usa um
-- valor de enum na mesma transação — as tabelas que referenciam esses valores vêm na 0035.

alter type transaction_type add value if not exists 'RESERVE';
alter type transaction_type add value if not exists 'REDEEM';
