-- Metas — parte 4 de 4: recarrega o schema cache do PostgREST.
--
-- Mesma razão de 0020/0022/0024/0027/0029/0033: `supabase db push` conecta direto no Postgres,
-- que não dispara o refresh de cache que o Dashboard/SQL Editor dispara — sem isto o PostgREST
-- responde "Could not find the table 'public.goals'" (e idem 'public.goal_yields' /
-- 'transactions.goal_id') logo após aplicar a 0035.

notify pgrst, 'reload schema';
