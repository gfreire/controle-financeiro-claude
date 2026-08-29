-- Parcelamento Programado (debts.kind = INSTALLMENT_PLAN) ganha um mês de competência inicial, a
-- pedido do usuário: sem ele o sistema não sabia "desde quando" o parcelamento corre, então não
-- dava pra dizer se está adiantado ou atrasado, e "pago" era decidido por mês de calendário
-- (existe um debt_transactions.amount < 0 datado no mês corrente).
--
-- Agora o pagamento é atribuído a MÊS DE COMPETÊNCIA, alocado automaticamente do mais antigo pro
-- mais novo — a mesma heurística de fatura de cartão (cards.service.ts#getCardSummary
-- currentMonthPaidAmount). total pago ÷ valor mensal = nº de competências cobertas, a partir de
-- start_competence. Pagar dois boletos hoje cobre as próximas duas competências e carrega crédito
-- pra frente (diferente do "antecipar" do cartão, que remove parcela). "Se eu pago hoje uma
-- fatura de setembro fica como pago em setembro." Ver AI_CONTEXT.md "Parcelamento Programado —
-- competência e adiantado/atrasado".
--
-- Nullable e sem CHECK: só faz sentido pra INSTALLMENT_PLAN, obrigatório nesse caso é validado em
-- src/lib/validations/debts.ts (mesma convenção de monthly_amount/due_day, migration 0021).
-- Convenção primeiro-dia-do-mês, igual fixed_expenses.start_competence (0026) e
-- card_purchases.paid_through_competence (0014).
alter table public.debts add column start_competence date;

-- Backfill dos parcelamentos já cadastrados: o recurso INSTALLMENT_PLAN é de 2026-08-23 (6 dias
-- atrás), então o mês de created_at é um default seguro e defensável — nenhum deles tem histórico
-- longo o suficiente pra o mês de criação estar errado.
update public.debts
set start_competence = date_trunc('month', created_at)::date
where kind = 'INSTALLMENT_PLAN' and start_competence is null;
