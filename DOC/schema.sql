-- ============================================================
-- Controle Financeiro Pessoal — Schema consolidado
-- Baseado no schema real do Supabase (colado pelo usuário) + decisões
-- tomadas na sessão de replanejamento. Mudanças em relação ao original
-- estão marcadas com "-- NOVO" ou "-- ALTERADO".
-- ============================================================

-- ============================================================
-- ENUMS
-- O dump original mostrava "USER-DEFINED" sem revelar o nome/valores
-- do enum. Nomeando explicitamente aqui.
-- ============================================================
CREATE TYPE account_type AS ENUM ('CASH', 'BANK', 'CREDIT_CARD');
CREATE TYPE category_type AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE transaction_type AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'CREDIT_CARD_PAYMENT');
CREATE TYPE debt_side AS ENUM ('PAYABLE', 'RECEIVABLE');

-- ============================================================
-- PROFILES
-- onboarding_completed: ADICIONADO — "usuário não tem categoria nenhuma" não é
-- um sinal seguro de "precisa fazer onboarding" (ele pode legitimamente
-- escolher zero categorias na primeira vez, ou apagar todas depois), então
-- vira um loop infinito de redirect. Esta flag é a fonte de verdade real.
-- ============================================================
CREATE TABLE public.profiles (
  user_id uuid NOT NULL,
  name text,
  email text,
  phone text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Cria a linha de profiles automaticamente quando um usuário se cadastra —
-- ADICIONADO porque um INSERT feito pelo client logo após auth.signUp()
-- esbarra na RLS sempre que o projeto exige confirmação de e-mail (nesse
-- caso signUp() ainda não estabelece sessão, então auth.uid() é null no
-- momento do insert). Uma trigger SECURITY DEFINER não depende do estado da
-- sessão do cliente e funciona igual com ou sem confirmação de e-mail, OAuth
-- futuro, etc.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'name', NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-recuperação: contas criadas ANTES desta trigger existir não têm linha
-- em profiles. Em vez de deixar isso quebrar pra sempre, getProfile()
-- (src/services/profile.service.ts) cria a linha sob demanda no primeiro
-- acesso se não encontrar nenhuma — não depende só da trigger.

-- ============================================================
-- FINANCIAL INSTITUTIONS
-- Catálogo global (sem user_id) — bancos disponíveis pra vincular a uma conta.
-- ============================================================
CREATE TABLE public.financial_institutions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT financial_institutions_pkey PRIMARY KEY (id)
);

-- ============================================================
-- ACCOUNTS (tabela base + extensões por subtipo)
-- ============================================================
CREATE TABLE public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type account_type NOT NULL,
  name text NOT NULL,
  institution_id uuid,
  color text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT accounts_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.financial_institutions(id)
);

CREATE TABLE public.cash_accounts (
  account_id uuid NOT NULL,
  initial_balance numeric(14,2) DEFAULT 0,
  CONSTRAINT cash_accounts_pkey PRIMARY KEY (account_id),
  CONSTRAINT cash_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);

CREATE TABLE public.bank_accounts (
  account_id uuid NOT NULL,
  initial_balance numeric(14,2) NOT NULL DEFAULT 0, -- ADICIONADO: sem isso toda conta banco nasce em zero e força um "Ajustar Saldo" imediato
  overdraft_limit numeric(14,2) DEFAULT 0,
  CONSTRAINT bank_accounts_pkey PRIMARY KEY (account_id),
  CONSTRAINT bank_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);

CREATE TABLE public.credit_cards (
  account_id uuid NOT NULL,
  closing_day integer NOT NULL,   -- dia de fechamento da fatura
  due_day integer NOT NULL,       -- dia de vencimento da fatura
  credit_limit numeric(14,2) NOT NULL CONSTRAINT credit_cards_credit_limit_positive CHECK (credit_limit > 0), -- ALTERADO (0008): obrigatório e sempre > 0; só o EXCESSO de compra contra o limite é soft-enforced na UI, nunca bloqueia o insert; nome da constraint preservado igual ao de 0008_credit_card_limit_required.sql (achado em auditoria 2026-08-23: estava sem nome aqui, gerando um nome diferente do real se o schema fosse recriado do zero a partir deste arquivo)
  CONSTRAINT credit_cards_pkey PRIMARY KEY (account_id),
  CONSTRAINT credit_cards_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);

-- ============================================================
-- CATEGORIES / SUBCATEGORIES
-- is_default: pacote inicial de onboarding (Moradia, Alimentação, Salário, etc.)
--             — o usuário escolhe quais quer, o sistema COPIA (INSERT) pra
--             o user_id dele. Nunca é consultado direto depois disso.
-- is_system: catálogo global PERMANENTE, nunca copiado, disponível direto
--            pra todo usuário pra sempre (query: user_id = auth.uid() OR is_system).
--            Hoje são 4 linhas: Juros (EXPENSE), Rendimentos (INCOME),
--            Ajuste-INCOME e Ajuste-EXPENSE — ver AI_CONTEXT.md pra
--            distinção entre "Informar Rendimento" e "Ajustar Saldo".
-- is_default e is_system nunca são true ao mesmo tempo na mesma linha.
-- Não existe FK entre a categoria copiada do usuário e a categoria default
-- que a originou — a cópia no onboarding é um INSERT único, sem vínculo.
--
-- Unicidade de nome é por "árvore", não global:
-- - categories: nome único por (user_id, type) — "Ajuste" pode existir uma
--   vez em INCOME e outra em EXPENSE pro mesmo user_id (inclusive NULL, no
--   catálogo system), mas não duas vezes com o mesmo type.
-- - subcategories: nome único por category_id — "Outros" pode se repetir
--   em categorias diferentes (árvores diferentes), mas não duas vezes na
--   mesma categoria. Nomes semanticamente parecidos mas diferentes (ex.:
--   "iFood" e "Delivery" na mesma categoria) são permitidos — só a
--   igualdade literal do nome é bloqueada.
-- ============================================================
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  type category_type NOT NULL,
  color text NOT NULL,
  icon text,
  is_system boolean DEFAULT false,
  is_default boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT categories_user_type_name_unique UNIQUE NULLS NOT DISTINCT (user_id, type, name)
  -- NULLS NOT DISTINCT exige Postgres 15+ (Supabase já roda em 15+ por padrão);
  -- sem isso, várias linhas com user_id NULL do catálogo system não seriam
  -- pegas pela constraint (Postgres trata NULL <> NULL por padrão).
);

CREATE TABLE public.subcategories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  category_id uuid NOT NULL,
  name text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subcategories_pkey PRIMARY KEY (id),
  CONSTRAINT subcategories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
  CONSTRAINT subcategories_category_name_unique UNIQUE (category_id, name)
);
-- Regra de negócio (não é constraint de banco, validar em src/lib/validations):
-- categorias do tipo INCOME não podem ter subcategoria.

-- Seed das categorias globais permanentes (is_system = true) — Juros,
-- Rendimentos e as duas linhas de Ajuste (INCOME/EXPENSE) — vive só em
-- seed.sql, não aqui. Manter num único lugar evita duplicidade quando
-- schema e seed rodam juntos (ver ARCHITECTURE.md nota de implementação).

-- ============================================================
-- FIXED EXPENSES (despesas fixas recorrentes — aluguel, streaming, etc.)
-- Existe ANTES de transactions porque transactions referencia esta tabela.
-- ============================================================
CREATE TABLE public.fixed_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL,
  category_id uuid,
  subcategory_id uuid,
  default_account_id uuid,
  due_day integer NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fixed_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT fixed_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fixed_expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT fixed_expenses_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id),
  CONSTRAINT fixed_expenses_default_account_id_fkey FOREIGN KEY (default_account_id) REFERENCES public.accounts(id)
);

-- ============================================================
-- TRANSACTIONS
-- origin_account_id + destination_account_id no mesmo registro cobrem
-- INCOME (só destino), EXPENSE (só origem), TRANSFER (os dois) e
-- CREDIT_CARD_PAYMENT (origem = conta, destino = cartão).
-- ============================================================
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type transaction_type NOT NULL,
  origin_account_id uuid,
  destination_account_id uuid,
  amount numeric(14,2) NOT NULL,
  date date NOT NULL,
  description text,
  category_id uuid,
  subcategory_id uuid,
  is_reservoir boolean DEFAULT false,
  fixed_expense_id uuid, -- NOVO: liga o lançamento real à despesa fixa que ele quita
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT transactions_origin_account_id_fkey FOREIGN KEY (origin_account_id) REFERENCES public.accounts(id),
  CONSTRAINT transactions_destination_account_id_fkey FOREIGN KEY (destination_account_id) REFERENCES public.accounts(id),
  CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT transactions_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id),
  CONSTRAINT transactions_fixed_expense_id_fkey FOREIGN KEY (fixed_expense_id) REFERENCES public.fixed_expenses(id) ON DELETE SET NULL
);

-- ============================================================
-- CREDIT CARD PURCHASES / INSTALLMENTS / PAYMENTS
-- ============================================================
CREATE TABLE public.card_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credit_card_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  purchase_date date NOT NULL,
  description text,
  category_id uuid,
  subcategory_id uuid,
  installments integer NOT NULL,
  is_reservoir boolean DEFAULT false,
  fixed_expense_id uuid, -- NOVO (0012): liga a compra (sempre 1x) à despesa fixa que ela quita,
                          -- pra despesas fixas pagas no cartão (ex: streaming na fatura)
  paid_through_competence date, -- NOVO (0014): compra retroativa ("já paguei até este mês") —
                                 -- define quais parcelas geradas nascem com card_installments.paid_before_system = true
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT card_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT card_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT card_purchases_credit_card_id_fkey FOREIGN KEY (credit_card_id) REFERENCES public.accounts(id),
  CONSTRAINT card_purchases_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT card_purchases_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id),
  CONSTRAINT card_purchases_fixed_expense_id_fkey FOREIGN KEY (fixed_expense_id) REFERENCES public.fixed_expenses(id) ON DELETE SET NULL
);

CREATE TABLE public.card_installments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  credit_card_id uuid NOT NULL,
  competence date NOT NULL, -- calculada a partir de purchase_date + closing_day/due_day do cartão
  amount numeric(14,2) NOT NULL,
  paid_before_system boolean NOT NULL DEFAULT false, -- NOVO (0014): parcela de compra retroativa
                                                       -- já paga antes do usuário usar o sistema —
                                                       -- some do saldo/fatura em aberto do cartão, mas
                                                       -- continua contando normal em despesa por categoria
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT card_installments_pkey PRIMARY KEY (id),
  CONSTRAINT card_installments_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.card_purchases(id) ON DELETE CASCADE,
  CONSTRAINT card_installments_credit_card_id_fkey FOREIGN KEY (credit_card_id) REFERENCES public.accounts(id)
);
-- installment_number / total_installments não são colunas: dá pra derivar
-- ordenando as parcelas de uma mesma purchase_id por competence (a contagem
-- total já está em card_purchases.installments).

CREATE TABLE public.card_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credit_card_id uuid NOT NULL,
  account_id uuid NOT NULL,
  transaction_id uuid NOT NULL UNIQUE,
  amount numeric(14,2) NOT NULL,
  payment_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT card_payments_pkey PRIMARY KEY (id),
  CONSTRAINT card_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT card_payments_credit_card_id_fkey FOREIGN KEY (credit_card_id) REFERENCES public.accounts(id),
  CONSTRAINT card_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT card_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id)
);

-- ============================================================
-- DEBTS + DEBT_TRANSACTIONS (NOVA TABELA)
-- Espelha o padrão já usado em reservoirs/reservoir_transactions:
-- saldo nunca fica armazenado, é sempre initial_balance + SUM(debt_transactions.amount).
-- amount positivo = aumento da dívida; amount negativo = pagamento/redução.
-- linked_transaction_id só existe quando dinheiro passou de fato por uma
-- conta rastreada (dinheiro em mãos ou PIX) — pagamento direto a terceiro
-- (ex.: pai paga um boleto por você) não gera transaction, só debt_transaction.
-- ============================================================
CREATE TABLE public.debts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent text NOT NULL,
  side debt_side NOT NULL,
  initial_balance numeric(14,2) NOT NULL,
  default_category_id uuid, -- NOVO (0015): pré-preenche (e é sempre sobrescrevível) a categoria de um pagamento registrado contra a dívida
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT debts_pkey PRIMARY KEY (id),
  CONSTRAINT debts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT debts_default_category_id_fkey FOREIGN KEY (default_category_id) REFERENCES public.categories(id)
);

CREATE TABLE public.debt_transactions ( -- NOVO
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  description text,
  linked_transaction_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE, -- NOVO (0016): editável, independente de created_at
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT debt_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT debt_transactions_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES public.debts(id) ON DELETE CASCADE,
  CONSTRAINT debt_transactions_linked_transaction_id_fkey FOREIGN KEY (linked_transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL
);

-- ============================================================
-- RESERVOIRS + RESERVOIR_TRANSACTIONS
-- amount positivo = acúmulo esperado; amount negativo = saque (valor
-- realmente recebido, que pode diferir do acumulado — a diferença
-- simplesmente permanece no saldo pra próxima conferência).
-- ============================================================
CREATE TABLE public.reservoirs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category_id uuid,
  subcategory_id uuid,
  default_percentage numeric(5,2), -- NOVO (0010): pré-preenche o % no AccrualDialog
  default_destination_account_id uuid, -- NOVO (0010): pré-preenche a conta no WithdrawalDialog
  active boolean DEFAULT true, -- CORRIGIDO: faltava, inconsistente com accounts/debts/fixed_expenses
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reservoirs_pkey PRIMARY KEY (id),
  CONSTRAINT reservoirs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT reservoirs_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT reservoirs_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id),
  CONSTRAINT reservoirs_default_destination_account_id_fkey FOREIGN KEY (default_destination_account_id) REFERENCES public.accounts(id),
  CONSTRAINT reservoirs_default_percentage_range CHECK (default_percentage IS NULL OR (default_percentage > 0 AND default_percentage <= 100))
);

CREATE TABLE public.reservoir_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reservoir_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  gross_amount numeric(14,2),  -- NOVO: opcional, só em acúmulo; nunca recalculado, sempre digitado
  percentage numeric(5,2),     -- NOVO: opcional, 0-100; par reativo com `amount` quando gross_amount existe
  description text,
  linked_transaction_id uuid,
  linked_card_purchase_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE, -- NOVO (0011): editável — antes só existia created_at, e o date picker do AccrualDialog era descartado
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reservoir_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT reservoir_transactions_reservoir_id_fkey FOREIGN KEY (reservoir_id) REFERENCES public.reservoirs(id) ON DELETE CASCADE,
  CONSTRAINT reservoir_transactions_linked_transaction_id_fkey FOREIGN KEY (linked_transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL,
  CONSTRAINT reservoir_transactions_gross_gte_amount CHECK (gross_amount IS NULL OR gross_amount >= amount),
  CONSTRAINT reservoir_transactions_percentage_range CHECK (percentage IS NULL OR (percentage > 0 AND percentage <= 100)),
  CONSTRAINT reservoir_transactions_linked_card_purchase_id_fkey FOREIGN KEY (linked_card_purchase_id) REFERENCES public.card_purchases(id) ON DELETE SET NULL,
  CONSTRAINT reservoir_transactions_one_link_only CHECK (linked_transaction_id IS NULL OR linked_card_purchase_id IS NULL) -- CORRIGIDO: nada impedia os dois setados ao mesmo tempo
);

-- ============================================================
-- BUDGETS
-- ALTERADO (0009, 2026-08-08): agora tem coluna `month` — cada linha pertence a exatamente um
-- mês, então subir um valor (ex: aluguel) nunca mais sobrescreve o histórico do mês anterior.
-- Antes disso era um "alvo permanente" sem coluna de mês (o mês era só parâmetro de consulta) —
-- essa frase não vale mais para esta tabela.
-- ============================================================
CREATE TABLE public.budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid,
  subcategory_id uuid,
  amount numeric(14,2) NOT NULL,
  month date NOT NULL, -- ADICIONADO (0009): primeiro dia do mês ao qual este orçamento pertence
  active boolean DEFAULT true, -- CORRIGIDO: faltava, mesma inconsistência do reservoirs
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT budgets_pkey PRIMARY KEY (id),
  CONSTRAINT budgets_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id),
  CONSTRAINT budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT budgets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
-- Índice único PARCIAL (WHERE active = true), não uma constraint UNIQUE simples: budgets usa o
-- mesmo soft-delete (`active`) do resto do schema, e o mecanismo de auto-desativação
-- (deactivateCategoryBudgetIfOverCommitted, _shared.ts) pode deixar uma linha desativada pra
-- trás numa tupla (user_id, category_id, subcategory_id, month) que uma linha NOVA ativa
-- reaproveita depois — uma constraint simples colidiria errado contra a linha antiga inativa.
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_category_subcategory_month_unique
  ON public.budgets (user_id, category_id, subcategory_id, month)
  NULLS NOT DISTINCT
  WHERE active = true;
CREATE INDEX IF NOT EXISTS budgets_user_month_idx ON public.budgets (user_id, month);

-- ============================================================
-- ÍNDICES DE PERFORMANCE (migration 0013, 2026-08-10)
-- Postgres nunca indexa FK automaticamente (só PRIMARY KEY/UNIQUE ganham índice de graça) —
-- antes desta migration só existia o índice de budgets acima. Cobrem as colunas que os
-- services de fato filtram/joinam (confirmado grepando .eq()/.gte()/.lte()/.in() em
-- src/services/*.ts): o auth.uid() = user_id de toda RLS, mais os filtros de data/categoria/
-- conta/despesa fixa em cima disso. Com o volume atual de linhas o planner majoritariamente
-- faz seq scan de qualquer forma — não é isto que explica a lentidão percebida hoje (ver
-- getOptionalUser() com React cache() em src/lib/auth/getUser.ts e os loops for-await
-- paralelizados em debts/reservoirs/fixed-expenses/budgets.service.ts) — mas são caminhos de
-- join/filtro reais que degradam conforme o histórico cresce.
-- ============================================================
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON public.transactions (user_id, date);
CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON public.transactions (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_subcategory_id_idx ON public.transactions (subcategory_id) WHERE subcategory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_origin_account_id_idx ON public.transactions (origin_account_id) WHERE origin_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_destination_account_id_idx ON public.transactions (destination_account_id) WHERE destination_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_fixed_expense_id_idx ON public.transactions (fixed_expense_id) WHERE fixed_expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS card_purchases_credit_card_id_idx ON public.card_purchases (credit_card_id);
CREATE INDEX IF NOT EXISTS card_purchases_category_id_idx ON public.card_purchases (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_purchases_subcategory_id_idx ON public.card_purchases (subcategory_id) WHERE subcategory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_purchases_fixed_expense_id_idx ON public.card_purchases (fixed_expense_id) WHERE fixed_expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS card_installments_purchase_id_idx ON public.card_installments (purchase_id);
CREATE INDEX IF NOT EXISTS card_installments_credit_card_competence_idx ON public.card_installments (credit_card_id, competence);

CREATE INDEX IF NOT EXISTS reservoir_transactions_reservoir_id_idx ON public.reservoir_transactions (reservoir_id);
CREATE INDEX IF NOT EXISTS debt_transactions_debt_id_idx ON public.debt_transactions (debt_id);

CREATE INDEX IF NOT EXISTS fixed_expenses_user_id_idx ON public.fixed_expenses (user_id);
CREATE INDEX IF NOT EXISTS fixed_expenses_category_id_idx ON public.fixed_expenses (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fixed_expenses_subcategory_id_idx ON public.fixed_expenses (subcategory_id) WHERE subcategory_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON public.accounts (user_id);
CREATE INDEX IF NOT EXISTS debts_user_id_idx ON public.debts (user_id);
CREATE INDEX IF NOT EXISTS reservoirs_user_id_idx ON public.reservoirs (user_id);

-- ============================================================
-- POLÍTICA DE DELEÇÃO (CORRIGIDO: estava implícita, agora explícita)
-- - accounts, categories, subcategories, debts, fixed_expenses, reservoirs,
--   budgets: têm `active`. Preferir desativar (active=false) a apagar de
--   verdade quando já existe histórico ligado — apagar é permitido pelo
--   schema (RESTRICT é o padrão do Postgres), mas services devem preferir
--   updateX({active:false}) na prática.
-- - card_installments, subcategories, reservoir_transactions,
--   debt_transactions: CASCADE — não têm sentido sem o pai.
-- - reservoir_transactions.linked_*, debt_transactions.linked_transaction_id,
--   transactions.fixed_expense_id, card_purchases.fixed_expense_id: SET NULL —
--   apagar a transaction/compra real ou a despesa fixa não deve travar nem
--   arrastar o outro lado, só solta o link.
-- - category_id/subcategory_id em transactions, card_purchases, budgets,
--   fixed_expenses, reservoirs: DE PROPÓSITO sem ON DELETE (RESTRICT padrão
--   do Postgres). Apagar uma categoria/subcategoria só pode acontecer depois
--   que o app zera essas referências via reassignCategory() — ver
--   "Deleting a category or subcategory" em AI_CONTEXT.md. Nunca trocar isso
--   por CASCADE/SET NULL, senão a deleção vira silenciosa.
-- ============================================================

-- ============================================================
-- ROW LEVEL SECURITY
-- Padrão: tabelas com user_id direto usam auth.uid() = user_id.
-- Tabelas-filha sem user_id próprio (subtipos de account, installments,
-- debt_transactions, reservoir_transactions) verificam via EXISTS na tabela pai.
-- Catálogos globais (financial_institutions, categorias/subcategorias de
-- sistema) têm leitura pública e escrita bloqueada pro cliente.
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.financial_institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read institutions" ON public.financial_institutions
  FOR SELECT USING (true);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cash accounts" ON public.cash_accounts
  FOR ALL USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = cash_accounts.account_id AND a.user_id = auth.uid()));

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank accounts" ON public.bank_accounts
  FOR ALL USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = bank_accounts.account_id AND a.user_id = auth.uid()));

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own credit cards" ON public.credit_cards
  FOR ALL USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = credit_cards.account_id AND a.user_id = auth.uid()));

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or system categories" ON public.categories
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "insert own categories" ON public.categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own categories" ON public.categories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own categories" ON public.categories
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or system subcategories" ON public.subcategories
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "insert own subcategories" ON public.subcategories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own subcategories" ON public.subcategories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own subcategories" ON public.subcategories
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fixed expenses" ON public.fixed_expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.card_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own card purchases" ON public.card_purchases
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.card_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own card installments" ON public.card_installments
  FOR ALL USING (EXISTS (SELECT 1 FROM public.card_purchases p WHERE p.id = card_installments.purchase_id AND p.user_id = auth.uid()));

ALTER TABLE public.card_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own card payments" ON public.card_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own debts" ON public.debts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.debt_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own debt transactions" ON public.debt_transactions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_transactions.debt_id AND d.user_id = auth.uid()));

ALTER TABLE public.reservoirs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reservoirs" ON public.reservoirs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.reservoir_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reservoir transactions" ON public.reservoir_transactions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.reservoirs r WHERE r.id = reservoir_transactions.reservoir_id AND r.user_id = auth.uid()));

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own budgets" ON public.budgets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
