-- Dívidas ganham subtipos (AI_CONTEXT.md "Dívidas — subtipos"), a pedido do usuário: até aqui
-- toda dívida era "pessoal" (empréstimo entre amigos/família, nunca afeta o dashboard). O usuário
-- pediu mais dois subtipos com comportamento diferente:
--   - OVERDUE_BILL ("conta em atraso"): água/luz/telefone/aluguel não pago — deve aparecer com
--     alerta claro e sempre negativar o dashboard (nunca fica invisível como uma dívida pessoal).
--   - INSTALLMENT_PLAN ("parcelamento combinado"): boleto ou acordo informal com valor mensal
--     combinado — também deve refletir no dashboard e gerar um lembrete todo mês (nunca um
--     lançamento automático, ver AI_CONTEXT.md "Dívidas — subtipos" pra a decisão de "lembrete +
--     1 clique" em vez de 100% automático).
-- default 'PERSONAL' preserva o comportamento e os dados de toda dívida já cadastrada.
alter table public.debts
  add column kind text not null default 'PERSONAL' check (kind in ('PERSONAL', 'OVERDUE_BILL', 'INSTALLMENT_PLAN'));

-- Só usados por INSTALLMENT_PLAN (obrigatórios nesse caso, validado em src/lib/validations/debts.ts
-- — não em CHECK de banco, mesma convenção já usada pra credit_cards CREDIT_CARD-only fields).
alter table public.debts add column monthly_amount numeric(14,2);
alter table public.debts add column due_day integer check (due_day is null or (due_day >= 1 and due_day <= 28));

create index debts_kind_idx on public.debts (kind);
