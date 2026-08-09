-- ============================================================================
-- reset_environment.sql
--
-- Reseta o ambiente de teste para o estado "recém-instalado": apaga TODOS os
-- dados gerados por uso (contas, transações, cartões, orçamentos, dívidas,
-- reservatórios, categorias/subcategorias copiadas por usuário) e os dois
-- usuários de teste do Supabase Auth, mantendo apenas os SEEDs globais
-- (categorias/subcategorias is_system + is_default com user_id IS NULL, e
-- financial_institutions) definidos em seed.sql.
--
-- Por quê: o projeto amadureceu o suficiente (ver ARCHITECTURE.md
-- "Implementation Status") que os dados de teste acumulados até aqui não
-- refletem mais um fluxo de uso limpo (onboarding, budgets mensais, etc.
-- mudaram de formato várias vezes). Isto NÃO é uma migration — não deve ir
-- para supabase/migrations/, é um script de manutenção rodado manualmente
-- uma vez, direto no SQL Editor do projeto Supabase.
--
-- COMO USAR
-- 1. Confirme que está no projeto Supabase correto (linked-project.json).
-- 2. Cole este arquivo inteiro no SQL Editor e rode de uma vez.
-- 3. Depois de rodar, os dois usuários precisarão se cadastrar novamente
--    (signup) e passarão pelo /onboarding do zero.
--
-- Este script é destrutivo e IRREVERSÍVEL. Rode apenas em ambiente de teste.
-- ============================================================================

begin;

-- 1. Apaga todo dado transacional e de configuração por usuário.
--    CASCADE cobre as tabelas-filha sem precisar listar a ordem manualmente
--    (card_installments, cash/bank/credit_cards, debt_transactions,
--    reservoir_transactions) — todas referenciam, direta ou indiretamente,
--    uma das tabelas abaixo.
truncate table
  public.card_payments,
  public.card_installments,
  public.card_purchases,
  public.transactions,
  public.debt_transactions,
  public.debts,
  public.reservoir_transactions,
  public.reservoirs,
  public.budgets,
  public.fixed_expenses,
  public.credit_cards,
  public.bank_accounts,
  public.cash_accounts,
  public.accounts
  cascade;

-- 2. Remove apenas as categorias/subcategorias PRÓPRIAS de cada usuário
--    (cópias feitas no onboarding, user_id preenchido). Preserva as linhas
--    globais do catálogo (is_system + is_default, user_id IS NULL) que
--    seed.sql já define — não apaga e não recria essas.
delete from public.subcategories where user_id is not null;
delete from public.categories where user_id is not null;

-- 3. Remove os profiles (perfis dos dois usuários de teste).
delete from public.profiles;

-- 4. Remove os usuários do Supabase Auth.
--    Isso invalida sessões ativas e exige novo signup + confirmação de
--    e-mail. `auth.users` não tem FK de cascata a partir das tabelas acima,
--    então só pode ser apagado depois que profiles/accounts/etc. (que
--    referenciam auth.users diretamente) já estiverem limpos, o que os
--    passos 1-3 já garantiram.
delete from auth.users;

commit;

-- ============================================================================
-- Verificação pós-reset (rode separadamente, opcional):
--
--   select count(*) from auth.users;               -- esperado: 0
--   select count(*) from public.profiles;           -- esperado: 0
--   select count(*) from public.accounts;            -- esperado: 0
--   select count(*) from public.categories where user_id is not null; -- 0
--   select count(*) from public.categories where user_id is null;     -- seeds
--   select count(*) from public.financial_institutions;               -- seeds
-- ============================================================================
