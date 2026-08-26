-- Mesma razão de 0020/0022/0024: supabase db push não dispara o refresh de cache do
-- PostgREST sozinho — sem isso a API continua achando que as colunas novas não existem.
NOTIFY pgrst, 'reload schema';
