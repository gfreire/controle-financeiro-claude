-- Despesas Programadas (ex-"Despesas Fixas") ganham uma janela de competência opcional:
-- start_competence obrigatório, end_competence opcional (NULL = ainda vigente). Resolve o
-- problema de uma despesa recorrente empurrar o piso do orçamento em meses onde ela nem
-- deveria contar ainda (ex: assinatura que só começa mês que vem) ou onde ela já não conta
-- mais (ex: assinatura cancelada). Decidido 2026-08-25, a pedido do usuário. Ver
-- AI_CONTEXT.md "Despesas Programadas — janela de competência".
--
-- Backfill: toda despesa já cadastrada recebe start_competence = '1970-01-01' (mesmo
-- sentinela "desde sempre" já usado em fixed_expense_amount_history.effective_from,
-- migration 0023) e end_competence = NULL — preserva o comportamento "perpétuo" que já
-- tinham, sem nenhuma mudança visível até a próxima edição.
alter table public.fixed_expenses
  add column start_competence date not null default '1970-01-01',
  add column end_competence date,
  add constraint fixed_expenses_competence_window_check
    check (end_competence is null or end_competence >= start_competence);
