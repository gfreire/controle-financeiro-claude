# Financial Control System — Architecture

This document defines the architecture, data flow, UI structure, and coding rules for the financial control system.

The goal of this document is to allow AI tools (Codex / Claude Code) to generate most of the application code consistently.

This system is a **personal financial control system with analytics dashboard**, used by the owner and a closed group of friends, each with fully isolated data. Not commercial.

---

# Tech Stack

Frontend: Next.js (App Router), React, TypeScript, TailwindCSS, shadcn/ui, Recharts.
Backend: Supabase, PostgreSQL.
Authentication: Supabase Auth.

Open Finance / bank sync is **out of scope** — evaluated and dropped (see `AI_CONTEXT.md`, section "Open Finance — decisão"). All financial entry is manual.

Visual design: TailwindCSS v4 (CSS-first `@theme`, no `tailwind.config.js`) + hand-built shadcn/ui-style primitives in `src/components/ui`, themed on the "Industry" Claude Design system (steel-blue blueprint aesthetic — square-cornered cards/buttons with "+" corner marks, Barlow Condensed headings over Barlow body). `--color-success`/`--color-danger`/`--color-warning` are a deliberate extension beyond Industry's mono palette — a finance dashboard needs income/expense/alert colors the source system doesn't define.

---

# Implementation Status

Full app is built and running (Next.js 16, App Router, Turbopack) — this isn't a spec waiting to be implemented, it's what's actually in `src/`. Read this section before assuming something is missing; grep `src/` to confirm specifics, not to rediscover whether a feature exists at all.

**Built**: auth (signup/login/signout, email-confirmation-aware), onboarding (category tree-picker, re-openable from Settings to import categories skipped the first time, diffed by name+type so already-imported ones never show again), all 8 services + their Server Actions, Dashboard (filters incl. month-by-month navigator with a native month-picker and prev/next arrows, 4 charts, budgets/fixed-expenses panel, Transaction Explorer with inline category edit + batch reassignment + delete), Transactions (create/delete; no manual "pay card bill" here — see below), Accounts (create with institution-first naming, initial balance for CASH/BANK, Informar Rendimento/Ajustar Saldo), Cards (create/edit/delete a purchase — edit rolls back and regenerates every installment; competence month defaults from `closing_day` but is directly overridable; pay-the-bill flow suggests the statement balance through the current month, not the full future balance; soft credit-limit warning, never blocks), Reservoirs, Debts, Budgets/Fixed Expenses, Settings (category/subcategory CRUD with guided-deletion, curated emoji icon picker — no free-text icon field).

**Deliberate deviations from the original spec below** (each documented at its point of change — see the migration file's own comment for the *why*):
- `bank_accounts.initial_balance` added (0005) — the original schema only gave `CASH` an initial balance, forcing every new `BANK` account through an immediate `Ajustar Saldo`.
- `credit_cards.credit_limit` added (0007), optional, soft-enforced — a purchase that would exceed it shows a warning ("you may have forgotten to log the bill payment, or made a mistake") requiring an explicit "insert anyway" acknowledgment; it never blocks the insert.
- `profiles.onboarding_completed` added (0004) + `on_auth_user_created` trigger (0003) — see `schema.sql`'s comments on `profiles`.
- The `is_system` category seed (`Juros`/`Rendimentos`/`Ajuste`×2) now lives only in `seed.sql`, not duplicated in `schema.sql` — running both used to violate the unique constraint.
- The default `Dívidas` starter pack no longer includes a "Pagamento de Cartão" subcategory — paying a card bill is already implicit in the `CREDIT_CARD_PAYMENT` transfer and never takes a category (the real expense is the card's purchases); the subcategory only invited miscategorized manual entries.
- The manual transaction form (`/transactions`, and the Dashboard's "Novo lançamento") only offers `EXPENSE`/`INCOME`/`TRANSFER` — `CREDIT_CARD_PAYMENT` is created exclusively through the Cards page's "Pagar fatura" flow (`registerCardPayment`), so there's exactly one path to it instead of two doing the same thing differently.
- Dashboard chart clicks that target "no category" pass a `uncategorizedOnly: true` filter flag, never a literal `"uncategorized"` string through `category_id.in(...)` (that string isn't a uuid — Postgres would reject the query).

**Known gaps** (not started, don't assume otherwise): no automated tests yet (see "Testing & Migrations" in `AI_GENERATION_RULES.md` for the intended scope); no account-level edit dialog beyond the type-specific balance/limit actions already listed; OFX import remains out of scope per `AI_CONTEXT.md`.

## Migrations changelog (`supabase/migrations/`)

Applied in order; each is additive (no destructive rewrites of an already-shipped migration — a new file corrects an old one). `schema.sql`/`seed.sql` in this folder always represent the *current* merged state, not migration 0001 alone.

1. `0001_initial_schema.sql` — full base schema (tables, enums, RLS).
2. `0002_seed.sql` — `is_system` categories + `is_default` starter pack + subcategories + `financial_institutions`.
3. `0003_profile_trigger.sql` — `on_auth_user_created` trigger, auto-creates `profiles` on signup.
4. `0004_onboarding_flag.sql` — `profiles.onboarding_completed`.
5. `0005_bank_initial_balance.sql` — `bank_accounts.initial_balance`.
6. `0006_remove_card_payment_subcategory.sql` — drops "Pagamento de Cartão" from the default `Dívidas` subcategories.
7. `0007_credit_card_limit.sql` — `credit_cards.credit_limit`.

---

# Architectural Principles

1. UI must never query Supabase directly.
2. All database access must go through **services**.
3. Services are responsible for queries and aggregations.
4. UI consumes **DTO objects** returned by services — never raw table rows.
5. Charts must receive **aggregated data**, never raw transactions.
6. Dashboard must be **interactive and filter-driven**.
7. **Every user's data is isolated** (multi-tenant). Enforced by Row Level Security (`auth.uid() = user_id`) on every user-scoped table — never only at the application layer.
8. Any value that can be calculated from other rows (balances, totals, remaining amounts) is **never stored as a column** — it is always computed in the service/query layer.

---

# Multi-tenant / Access Model

Each friend is a fully isolated user. There is no sharing, no workspace, no invite/role system.

- Every user-scoped table has a `user_id` column referencing `auth.users`.
- RLS policy `auth.uid() = user_id` on every user-scoped table (see `schema.sql` for the full policy set).
- Global/catalog tables (`financial_institutions`, and `categories`/`subcategories` where `user_id IS NULL`) are public-read, not writable by clients.
- Onboarding: user picks which `is_default` starter categories to use; the system **copies** them (INSERT) into their own `user_id`. No FK back to the source — editing/deleting the copy never affects the catalog. The onboarding screen (`/onboarding`) is reusable — reopen it later from Settings to import categories skipped the first time; it diffs against the user's own categories by `(type, name)` so already-imported ones never show again. Separately, `is_system` rows (`Juros`, `Rendimentos`, `Ajuste`×2) are never copied — they stay global and are queried directly by every user forever. See `AI_CONTEXT.md` for the full distinction and the balance-reconciliation flow that uses them.

---

# Data Fetching Strategy

Next.js App Router with Server Components. Pages fetch data directly from services on the server.

```
page.tsx (Server Component) → service → Supabase → DTO → component
```

API routes should **not** be created unless strictly necessary.

# Mutations

Operations that modify data use **Server Actions**.

```
Server Action → service → Supabase → database updated
```

Examples: `createTransaction`, `updateTransaction`, `deleteTransaction`, `createCardPurchase`, `registerCardPayment`, `createDebt`, `addDebtTransaction`, `createReservoir`, `addReservoirTransaction`, `withdrawReservoir`, `createBudget`, `createFixedExpense`.

---

# Project Structure

Actual current tree (not exhaustive — representative per folder):

```
src
 ├ lib
 │  ├ supabase (client.ts, server.ts, proxy.ts — session refresh, called from src/proxy.ts)
 │  ├ auth (getUser.ts — getUser() redirects, getOptionalUser() doesn't)
 │  ├ utils (cn, currency, date [incl. installment-competence math + month-preset resolution], id, money [cents-safe arithmetic + gross/net split], normalize, number, string)
 │  └ validations (one file per domain — zod. Note: a schema with .superRefine()/.refine() can't itself be .partial()'d; keep a plain base object schema alongside the refined one and .partial() the base, e.g. accounts.ts/transactions.ts)
 ├ services (one per domain: dashboard, transactions, accounts, categories, cards, reservoirs, debts, budgets, fixed-expenses, profile; _shared.ts holds the budget/fixed-expense actualAmount aggregation both reuse)
 ├ features
 │  ├ dashboard/components (dashboard-filters incl. month navigator, summary-cards, income-expense-chart, monthly-chart, category-pie, category-bars, budgets-panel, transaction-explorer, editable-category-cell, batch-reassign-dialog)
 │  ├ transactions/components (transaction-form-dialog, delete-transaction-button)
 │  ├ accounts/components (account-form-dialog, account-card, balance-adjust-dialog)
 │  ├ cards/components (purchase-form-dialog [create+edit, competence override, over-limit warning], payment-form-dialog, delete-purchase-button, month-nav)
 │  ├ reservoirs/components (reservoir-form-dialog, accrual-dialog, withdrawal-dialog)
 │  ├ debts/components (debt-form-dialog, debt-transaction-dialog)
 │  ├ budgets/components (budget-form-dialog, fixed-expense-form-dialog, pay-fixed-expense-dialog)
 │  └ categories/components (category-form-dialog, subcategory-form-dialog, category-tree-item [onboarding], inline-category-create [used from transaction/card-purchase forms], delete-category-dialog)
 ├ components
 │  ├ ui (button, card, input/field/label/textarea, dialog, select, tabs, checkbox, switch, dropdown-menu, popover, table, badge, icon-picker + icon-set, confirm-delete-dialog, corner-marks — the Industry blueprint frame)
 │  └ layout (sidebar, header, bottom-navigation, nav-items)
 ├ types (database.ts — raw row shapes; dto.ts — the DTOs below, source of truth)
 └ app
    ├ (auth)/login, (auth)/signup, (auth)/actions.ts
    ├ onboarding/ (outside the (app) group — no sidebar/nav chrome; reused for the Settings re-import flow too)
    └ (app)/dashboard, transactions, accounts, cards, reservoirs, debts, budgets, settings — layout.tsx here redirects to /onboarding whenever profiles.onboarding_completed is false
```

# Utility Functions

`src/lib/utils` is a pure, framework-agnostic layer. No database access, no UI logic, deterministic, reusable in server and client.

Examples: `normalizeText()`, `formatCurrency()`, `formatDate()`, `formatMonthLabel()`, `generateId()` (UUID v4, matches `gen_random_uuid()` used in Postgres), `formatMoney()`, `calculateGrossNetSplit({ grossAmount, percentage, netAmount }, lastEdited)` (pure — recalculates whichever of `percentage`/`netAmount` wasn't the field just edited, given `grossAmount`; used by the reservoir accrual form, reusable anywhere else a gross/percentage/net split shows up later).

Validation schemas live in `src/lib/validations` (Zod). This is where the "income category has no subcategory" and other cross-field rules are enforced, since the database schema does not constrain this.

Money precision: DB uses `numeric(14,2)`. All arithmetic goes through `src/lib/utils/money.ts` (safe add/subtract, installment rounding). Rounding remainder from installment generation always goes to the **first** installment.

---

# Routing

```
(auth)
 login/page.tsx
 signup/page.tsx

(app)
 dashboard/page.tsx
 transactions/page.tsx
 accounts/page.tsx
 cards/page.tsx
 reservoirs/page.tsx
 debts/page.tsx
 budgets/page.tsx        (inclui despesas fixas)
 settings/page.tsx
```

Navigation: mobile-first, bottom navigation (Dashboard, Transactions, Accounts, Cards, More), desktop sidebar (adds Reservoirs, Debts, Budgets, Settings).

---

# Dashboard Philosophy

Central feature. Interactive, filter-driven, exploratory — not just a transaction log.

Filters (shared across dashboard):

```typescript
type DashboardFilters = {
  periodStart: string
  periodEnd: string
  accounts?: string[]
  categories?: string[]
  subcategories?: string[]
  transactionType?: "INCOME" | "EXPENSE"
  uncategorizedOnly?: boolean // set when a chart's "no category" slice is clicked — never stuff a fake id into `categories`
}
```

Supported periods: single month, custom month range, last 3/6/12 months, full year.

Dashboard layout:

1. Financial Summary Cards (balance, income, expense, result)
2. Income vs Expense (bar)
3. Monthly Evolution (bar)
4. Category Distribution (donut)
5. Category Comparison (horizontal bar)
6. Budgets & Fixed Expenses panel (planned vs actual, alerts)
7. Transaction Explorer (table, reacts to all filters and to chart clicks)

**Inline editing is a requirement, not a nice-to-have.** The Transaction Explorer (and any other dashboard table showing individual records) must allow editing category/subcategory/description directly on the row — never force a detour to a separate menu/form to fix something spotted while browsing the dashboard. A common workflow is reviewing a month with several uncategorized or miscategorized entries and fixing them on the spot, including in batch (reusing `categories.service.ts`'s `reassignCategory`, not exclusive to the category-deletion flow). The exact interaction (click-to-edit, inline dropdown, multi-select, mobile pattern) is a visual design decision — resolve it in Design, not here; what's fixed at this layer is that `updateTransaction`/`reassignCategory` must support partial, low-friction updates callable straight from dashboard components.

Charts must use **aggregated SQL data** from services. Never compute totals in the UI (`reduce()`/`map()` aggregation is forbidden in components).

---

# Service Layer & Contracts

## dashboard.service.ts
```
getFinancialSummary(filters) → FinancialSummaryDTO
getMonthlyEvolution(filters) → MonthlyEvolutionDTO[]
getCategoryDistribution(filters) → CategoryDistributionDTO[]
getCategoryComparison(filters) → CategoryComparisonDTO[]
getTransactionsFiltered(filters) → TransactionViewDTO[]
```

## transactions.service.ts
```
createTransaction(data) / updateTransaction(id, data) / deleteTransaction(id) / getTransactions(filters)
```

## accounts.service.ts
```
getAccounts() / createAccount(data) / updateAccount(id, data) / deleteAccount(id)
getAccountBalance(accountId) → number  -- initial balance + SUM de todas as transactions que afetam a conta
registerYield(accountId, realBalance)
  -- "Informar Rendimento": compara realBalance ao calculado; cria transaction
  -- INCOME/"Rendimentos" pra diferença (uso rotineiro, cofrinho que rende)
reconcileAccountBalance(accountId, realBalance)
  -- "Ajustar Saldo": mesmo cálculo de diferença, mas categoria system "Ajuste"
  -- (INCOME ou EXPENSE conforme o sinal) — usado quando a diferença não é rendimento plausível
```

## categories.service.ts (NOVO — estava faltando)
```
getCategories() / getSubcategories(categoryId)
createCategory(data) / createSubcategory(data)
updateCategory(id, data) / updateSubcategory(id, data)
copyDefaultCategories(selectedCategoryIds)  -- fluxo de onboarding, INSERT de cópia
getCategoryUsage(categoryId) / getSubcategoryUsage(subcategoryId)
  → { count: number, preview: TransactionViewDTO[] }
  -- conta e mostra amostra de transactions/card_purchases (+ sinaliza budgets/
  -- fixed_expenses/reservoirs) que ainda referenciam, pro disclaimer de deleção
reassignCategory(fromCategoryId, { toCategoryId?, toSubcategoryId? } | null)
  -- UPDATE em lote de category_id/subcategory_id em transactions + card_purchases
  -- (e nos configs que ainda apontam pra ela); null = deixa sem categoria
deleteCategory(id) / deleteSubcategory(id)
  -- só sucede depois que reassignCategory zerou as referências — a FK é
  -- RESTRICT por padrão, então a ordem é garantida pelo banco
```

## cards.service.ts
```
createCardPurchase(data)   -- calcula installments a partir de closing_day/due_day do cartão
getCardPurchases(cardId)
getCardInstallments(cardId)
registerCardPayment(data)
```

## reservoirs.service.ts
```
createReservoir(data)
addReservoirTransaction(data)   -- lançamento de acúmulo (amount positivo)
withdrawReservoir(data)         -- saque (amount negativo, cria transaction/card_purchase vinculado)
getReservoirs() → ReservoirDTO[]
getReservoirTransactions(reservoirId) → ReservoirTransactionDTO[]
```

## debts.service.ts (NOVO)
```
createDebt(data)
addDebtTransaction(data)  -- amount positivo=aumento, negativo=pagamento; linked_transaction_id opcional
getDebts() → DebtDTO[]
getDebtTransactions(debtId) → DebtTransactionDTO[]
```

## budgets.service.ts (NOVO)
```
createBudget(data)  -- alvo permanente por categoria/subcategoria, sem mês
getBudgets(month) → BudgetDTO[]   -- month é parâmetro de agregação, não coluna
```

## fixed-expenses.service.ts (NOVO)
```
createFixedExpense(data)
getFixedExpenses(month) → FixedExpenseDTO[]
```

---

# DTO Definitions

Source of truth is `src/types/dto.ts` — this block mirrors it exactly; if they ever drift, the code wins and this block needs fixing, not the other way around.

```typescript
type FinancialSummaryDTO = {
  balance: number; income: number; expense: number; result: number
  adjustmentShare: number // % of period total sitting under "Ajuste" — bookkeeping-looseness signal
}

type MonthlyEvolutionDTO = { month: string; income: number; expense: number }

type CategoryDistributionDTO = { categoryId: string; categoryName: string; total: number; color: string; icon: string | null }

type CategoryComparisonDTO = { categoryName: string; total: number }

type TransactionViewDTO = {
  id: string; date: string; description: string; type: TransactionType
  categoryId: string | null; category: string
  subcategoryId: string | null; subcategory: string
  accountId: string | null; account: string
  amount: number
  source: "transaction" | "installment" // "installment" rows come from card_purchases — edit/delete only from the Cards page, never here
}

type ReservoirDTO = { id: string; name: string; balance: number; categoryId: string | null; categoryName: string | null } // balance = SUM(reservoir_transactions.amount)

type ReservoirTransactionDTO = {
  id: string; reservoirId: string; date: string; description: string | null
  amount: number           // positivo = acúmulo esperado; negativo = saque
  grossAmount?: number     // opcional, só acúmulo; sempre digitado, nunca recalculado
  percentage?: number      // opcional, 0-100; par reativo com `amount` (editar um recalcula o outro, dado grossAmount)
  linkedTransactionId?: string
  linkedCardPurchaseId?: string
}
// validação: se grossAmount preenchido, grossAmount >= amount

type DebtDTO = {
  id: string; side: "PAYABLE" | "RECEIVABLE"; agent: string
  originalAmount: number
  remainingBalance: number // NUNCA é coluna — sempre initial_balance + SUM(debt_transactions.amount), calculado no service
  active: boolean
}

type DebtTransactionDTO = {
  id: string; debtId: string; date: string; description: string | null
  amount: number  // positivo = aumento; negativo = pagamento
  linkedTransactionId?: string // opcional nos dois sentidos — só existe quando dinheiro passou por conta rastreada
}

type CardPurchaseDTO = {
  id: string; creditCardId: string; description: string; totalAmount: number
  installmentsCount: number; purchaseDate: string
  firstCompetenceMonth: string // "YYYY-MM" — competência real da 1ª parcela, pra pré-preencher edição
  categoryId: string | null; categoryName: string | null
  subcategoryId: string | null; subcategoryName: string | null
}

type CardInstallmentDTO = {
  id: string; purchaseId: string
  installmentNumber: number    // derivado — ordenado por competence entre TODAS as parcelas da purchase (não só as do período filtrado), nunca uma coluna
  totalInstallments: number    // = card_purchases.installments
  amount: number; competenceMonth: string; description: string
}

type BudgetDTO = {
  id: string; categoryId: string; categoryName: string; subcategoryId?: string; subcategoryName?: string
  plannedAmount: number       // budgets.amount
  actualAmount: number        // soma real do mês (transactions + card_installments) pra essa categoria
  status: "OK" | "EXCEEDED"   // actualAmount > plannedAmount
}

type FixedExpenseDTO = {
  id: string; name: string; categoryId: string; categoryName: string
  plannedAmount: number; dueDay: number; defaultAccountId?: string
  actualAmount: number         // soma da(s) transaction(s) do mês vinculada(s) via fixed_expense_id
  projectedAmount: number      // exibido no dashboard: actualAmount > 0 ? actualAmount : plannedAmount
  isPaidThisMonth: boolean     // actualAmount > 0
  status: "OK" | "EXCEEDED"
}

// Não listados no MER original, mas seguem a mesma regra "service devolve DTO" — usados por Accounts/Categories/Cards.

type AccountDTO = {
  id: string; type: AccountType; name: string; color: string | null; active: boolean
  institutionId: string | null; institutionName: string | null; institutionColor: string | null
  balance: number
  initialBalance?: number   // CASH, BANK
  overdraftLimit?: number   // BANK
  closingDay?: number       // CREDIT_CARD
  dueDay?: number           // CREDIT_CARD
  creditLimit?: number | null // CREDIT_CARD — opcional, soft-enforced (só aviso na UI, nunca bloqueia)
}

type FinancialInstitutionDTO = { id: string; name: string; color: string | null }

type CategoryDTO = {
  id: string; name: string; type: CategoryType; color: string; icon: string | null
  isSystem: boolean; isDefault: boolean; active: boolean
  subcategories: SubcategoryDTO[]
}

type SubcategoryDTO = { id: string; categoryId: string; name: string; active: boolean }

type CategoryUsageDTO = {
  count: number; preview: TransactionViewDTO[]
  budgetsCount: number; fixedExpensesCount: number; reservoirsCount: number
}
```

---

# Modelo de Entidade-Relacionamento (MER)

Ver `mer-controle-financeiro.mermaid` (diagrama completo) e `schema.sql` (schema executável com RLS). Resumo das relações centrais:

- `accounts` é uma tabela base com extensões 1:1 por subtipo (`cash_accounts`, `bank_accounts`, `credit_cards`) — herança por tabela.
- `transactions` cobre INCOME/EXPENSE/TRANSFER/CREDIT_CARD_PAYMENT com um único par `origin_account_id`/`destination_account_id`.
- `card_purchases` → `card_installments` (1:N), competence calculada a partir de `closing_day`/`due_day` do cartão.
- `reservoirs` → `reservoir_transactions` (1:N, ledger com sinal); saque vincula a `transactions` ou `card_purchases`.
- `debts` → `debt_transactions` (1:N, ledger com sinal); vínculo com `transactions` é opcional.
- `budgets` e `fixed_expenses` nunca geram `transactions` — são puramente informativos/preditivos.

---

# Performance Rules

Charts must use aggregated SQL queries (`SUM`, `GROUP BY`, indexed filters). Never fetch raw transactions to compute totals in the frontend.

# UX Principles

Mobile-first. Desktop: sidebar + header. Mobile: header + bottom navigation. Charts stack vertically on mobile.

# Future Expansion

Potential future modules: investments, loan tracking, advanced analytics, OFX statement import (evaluated, deferred — see `AI_CONTEXT.md`).

The architecture must remain **service-driven, DTO-based, and RLS-isolated per user**.
