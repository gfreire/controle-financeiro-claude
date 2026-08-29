-- Mesma razão de 0020/0022/0024/0027/0029: aplicar via CLI/MCP não dispara o refresh de schema
-- cache do PostgREST sozinho, e a 0032 adiciona debts.start_competence.
NOTIFY pgrst, 'reload schema';
