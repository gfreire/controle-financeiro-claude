-- Mesma razão da 0020/0022: força o PostgREST a reconhecer a tabela nova
-- public.fixed_expense_amount_history imediatamente.
NOTIFY pgrst, 'reload schema';
