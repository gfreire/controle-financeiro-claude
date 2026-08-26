-- Mesma razão de 0020/0022/0024/0027: aplicar via CLI/MCP não dispara o refresh de schema cache
-- do PostgREST sozinho.
NOTIFY pgrst, 'reload schema';
