-- Mesma razão da 0020: força o PostgREST a reconhecer as colunas novas de public.debts
-- (kind, monthly_amount, due_day) imediatamente, sem depender do próximo reload automático.
NOTIFY pgrst, 'reload schema';
