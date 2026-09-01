-- Recarrega o schema cache do PostgREST após a 0038.
--
-- Mesma razão de 0020/0022/0024/0027/0029/0033/0037: `supabase db push` conecta direto no
-- Postgres, que não dispara o refresh de cache que o Dashboard/SQL Editor dispara — sem isto o
-- PostgREST responde "Could not find the table 'public.recurring_incomes'" (e idem
-- 'transactions.recurring_income_id') logo após aplicar a 0038.

notify pgrst, 'reload schema';
