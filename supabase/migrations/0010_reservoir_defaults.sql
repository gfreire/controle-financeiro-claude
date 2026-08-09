-- Adiciona defaults opcionais em reservoirs: percentual bruto->líquido e conta de destino do
-- saque, pré-preenchendo AccrualDialog/WithdrawalDialog em vez do usuário digitar/escolher toda
-- vez (AI_CONTEXT.md "Reservoir (Cofre)" — a maioria das receitas programadas tem sempre o mesmo
-- percentual de corte e sempre cai na mesma conta).

ALTER TABLE public.reservoirs
  ADD COLUMN default_percentage numeric(5,2),
  ADD COLUMN default_destination_account_id uuid REFERENCES public.accounts(id);

ALTER TABLE public.reservoirs
  ADD CONSTRAINT reservoirs_default_percentage_range CHECK (default_percentage IS NULL OR (default_percentage > 0 AND default_percentage <= 100));
