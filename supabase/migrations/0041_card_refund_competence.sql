-- card_refunds.competence — a fatura em que o crédito cai, editável pelo usuário.
--
-- Decidido 2026-11-22, a pedido do usuário: até aqui a fatura de um crédito era sempre derivada
-- de refund_date + closing_day/due_day do cartão. Na vida real o fechamento pode escorregar (cartões
-- cujo vencimento/fechamento muda quando cai em fim de semana) e o crédito vai parar em outra fatura.
-- Mesmo padrão do "Mês da 1ª parcela" de uma compra: o sistema sugere, o usuário pode corrigir.
--
-- A partir daqui a competência (e não mais refund_date) é o que posiciona o crédito em tudo que é
-- do cartão — lista da fatura, pool oldest-first de pagamento (getCardBalanceThroughMonth /
-- getCardSummary / getCardMonthlyEvolution) — e o mês em que ele conta como RECEITA no dashboard,
-- alinhado à regra "analytics de cartão usam competência, nunca a data". refund_date continua
-- sendo a data real do crédito (exibida na lista).
--
-- Guardado sempre no 1º dia do mês. Backfill = a fatura que estava aberta em refund_date, mesma
-- fórmula de calculateInstallmentCompetences (src/lib/utils/date.ts):
--   + 1 mês se o dia > closing_day (já fechou), + 1 mês se due_day <= closing_day (vence no mês seguinte).

alter table public.card_refunds add column competence date;

update public.card_refunds r
set competence = (
  date_trunc('month', r.refund_date)
  + make_interval(months =>
      (case when extract(day from r.refund_date) > cc.closing_day then 1 else 0 end)
    + (case when cc.due_day <= cc.closing_day then 1 else 0 end))
)::date
from public.credit_cards cc
where cc.account_id = r.credit_card_id
  and r.competence is null;

alter table public.card_refunds alter column competence set not null;
alter table public.card_refunds
  add constraint card_refunds_competence_first_of_month check (extract(day from competence) = 1);

create index if not exists card_refunds_card_competence_idx on public.card_refunds (credit_card_id, competence);

notify pgrst, 'reload schema';
