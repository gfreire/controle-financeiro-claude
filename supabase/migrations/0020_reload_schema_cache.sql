-- Sem mudança de schema. A migration 0019 criou public.card_refunds via conexão direta ao
-- Postgres (supabase db push), que não passa pelo hook que o Dashboard/SQL Editor usa pra avisar
-- o PostgREST de mudanças de schema — resultando em "Could not find the table 'public.card_refunds'
-- in the schema cache" até o próximo reload automático. Este NOTIFY força o reload na hora.
NOTIFY pgrst, 'reload schema';
