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

**Built**: auth (signup/login/signout, email-confirmation-aware), onboarding (category tree-picker, re-openable from Settings to import categories skipped the first time, diffed by name+type so already-imported ones never show again), all 8 services + their Server Actions, Dashboard (filters incl. month-by-month navigator via the shared `MonthPicker` — click-anywhere-on-label opens the native picker, not just the browser's own tiny icon hit-area —, account filter shows each account's type icon, category filter grouped under "Receitas"/"Despesas" `SelectGroup`s, 4 charts, budgets/fixed-expenses panel scoped to the filtered period (not always the current month) with fixed expenses nested under their parent budget, Transaction Explorer with inline category edit + delete + account-type icon per row — no standalone batch-reassign button, that only lives inside category deletion now), Transactions (month-scoped like Cards/Dashboard — a `MonthNav` filters the list to one month at a time instead of loading every transaction ever logged; create/delete; no manual "pay card bill" here — see below; `CREDIT_CARD_PAYMENT` rows show a "Pagamento de Cartão" label instead of a category), Accounts (create with institution-first naming — no institution field for `CASH`; initial balance for CASH/BANK; Informar Rendimento restricted to `BANK` since cash doesn't yield; Ajustar Saldo for CASH+BANK; Ajustar Limite/Ajustar Cartão quick action for `credit_limit`/`overdraft_limit`, editable anytime, and for `CREDIT_CARD` also `closing_day`/`due_day` in the same dialog; account-type icon — Banknote/Wallet/CreditCard — shown consistently on the Accounts page, transaction lists, and the dashboard's account filter), Cards (create/edit/delete a purchase — edit rolls back and regenerates every installment; competence month defaults from `closing_day` but is directly overridable; pay-the-bill flow suggests the statement balance through TODAY's real month regardless of the page's month filter; soft credit-limit warning, never blocks; card summary shows usado/total against the full committed balance incl. future installments, the VIEWED month's invoice, and the overdue amount), "Receita Programada" — displayed name for the Reservoir feature, route/table/service/DTO names still `reservoir*` (accrual/withdrawal entries, description defaults to "Movimentação da receita programada {nome}"), Debts (pie charts for "a pagar"/"a receber" at the top, each shown only when that side has data; payment/increase dialog defaults its description to "Movimentação da dívida {nome}"; a payment that fully settles or overpays a debt is soft-deleted automatically after a confirm-again warning), Budgets/Fixed Expenses (create + edit + soft-delete dialogs; a fixed expense is a committed floor on its category/subcategory's budget — auto-raises or creates the budget with a notice, never blocks; a budget can never be manually lowered below what its subcategory budgets + fixed expenses commit to, a hard block; a tree-based "Planejar orçamentos" screen plans a whole category + subcategories in one place, reusing the onboarding tree-picker's visual pattern; "Registrar pagamento" defaults its description to "Pagamento — {nome da despesa fixa}"), Settings (category/subcategory CRUD with guided-deletion, curated emoji icon picker — no free-text icon field).

**Deliberate deviations from the original spec below** (each documented at its point of change — see the migration file's own comment for the *why*):
- `bank_accounts.initial_balance` added (0005) — the original schema only gave `CASH` an initial balance, forcing every new `BANK` account through an immediate `Ajustar Saldo`.
- `credit_cards.credit_limit` added (0007), optional, soft-enforced — a purchase that would exceed it shows a warning ("you may have forgotten to log the bill payment, or made a mistake") requiring an explicit "insert anyway" acknowledgment; it never blocks the insert. Both this and `overdraft_limit` are editable anytime via "Ajustar Limite" (decided 2026-08-07) — see `AI_CONTEXT.md` → "Accounts".
- `profiles.onboarding_completed` added (0004) + `on_auth_user_created` trigger (0003) — see `schema.sql`'s comments on `profiles`.
- The `is_system` category seed (`Juros`/`Rendimentos`/`Ajuste`×2) now lives only in `seed.sql`, not duplicated in `schema.sql` — running both used to violate the unique constraint.
- The default `Dívidas` starter pack no longer includes a "Pagamento de Cartão" subcategory — paying a card bill is already implicit in the `CREDIT_CARD_PAYMENT` transfer and never takes a category (the real expense is the card's purchases); the subcategory only invited miscategorized manual entries.
- The manual transaction form (`/transactions`, and the Dashboard's "Novo lançamento") only offers `EXPENSE`/`INCOME`/`TRANSFER` — `CREDIT_CARD_PAYMENT` is created exclusively through the Cards page's "Pagar fatura" flow (`registerCardPayment`), so there's exactly one path to it instead of two doing the same thing differently.
- Dashboard chart clicks that target "no category" pass a `uncategorizedOnly: true` filter flag, never a literal `"uncategorized"` string through `category_id.in(...)` (that string isn't a uuid — Postgres would reject the query).
- The Budget/Fixed-Expense hierarchy (decided 2026-08-07, see `AI_CONTEXT.md` → "Budget hierarchy") deliberately breaks from the credit-limit soft-enforce pattern in one direction only: manually lowering a budget below its committed children (subcategory budgets + fixed expenses) is a **hard block**, not a warning — the reasoning is that a budget contradicting its own committed children is simply wrong, not a maybe-forgot-something judgment call. Raising never blocks — fixed expenses/subcategory budgets auto-raise (or create) their parent budget with a notice instead.
- The dashboard's Budgets/Fixed-Expenses panel (`dashboard/page.tsx`) now aggregates against `filters.periodEnd` instead of always `todayIso()` (fixed 2026-08-07) — a user browsing a past or future month via the period filter expects the panel to follow the same month, not silently stay pinned to today while every other dashboard section moves. `getBudgets(month)`/`getFixedExpenses(month)` already accepted any date within the target month, so this was a caller-side fix, not a service change.
- `/transactions` (fixed 2026-08-07) is now month-scoped the same way `/cards` already was, instead of loading every transaction the user has ever logged with no period filter — consistent with the rest of the app being month-driven by default. Reuses the same shared `MonthPicker`/`MonthNav` pattern as Cards; `getTransactions()` already accepted `periodStart`/`periodEnd`, so this only touched the page and added `src/features/transactions/components/month-nav.tsx`.
- The month-label-click bug (fixed 2026-08-07): the month navigator overlays an invisible native `<input type="month">` on top of the label to open the picker on click. Browsers only react to a click on their own built-in calendar-icon hit-area (usually near the right edge), not anywhere in the input's box — so clicking the label text itself did nothing while clicking near the arrow did. Fixed by extracting the navigator into a shared `src/components/ui/month-picker.tsx` that calls the input's `showPicker()` from the wrapping label's `onClick`, so the whole label opens the picker. Dashboard, Cards, and Transactions all now share this one component instead of three copies of the same (buggy) markup.
- The Transaction Explorer's standalone "Reclassificar em lote" button/dialog was removed (fixed 2026-08-07, at the user's explicit request) — bulk category reassignment is now reachable only through `DeleteCategoryDialog`'s own guided-deletion step, never as a general-purpose action available at any time. `bulkReassignTransactions` (the dashboard action wrapping it) and `batch-reassign-dialog.tsx` were deleted outright rather than left unused.
- Cards page "usado/total" now reads `CardSummaryDTO.totalCommitted` instead of `usedThroughCurrentMonth` (fixed 2026-08-07) — the latter deliberately excludes future not-yet-due installments (it drives the "Pagar fatura" suggestion, see `AI_CONTEXT.md` → "Credit Card Purchases"), so using it for the against-the-limit figure undercounted anything already committed via an installment plan but not yet billed. `getCardSummary`'s month parameter was also split in meaning: `currentMonthInvoice` now follows the page's `MonthNav` filter (previously it silently ignored the filter and always showed today's real month's invoice), while `usedThroughCurrentMonth`/`overdueAmount` stay anchored to today regardless of what month is being viewed, since they represent "what a real payment today should be," not a historical snapshot.
- `LimitAdjustDialog` (Accounts) now doubles as the credit card's closing-day/due-day editor, not just its limit — same dialog, same "Ajustar Limite" mechanic, just a different trigger label ("Ajustar Cartão") for `CREDIT_CARD` accounts (fixed 2026-08-07, at the user's request: "pode ser o mesmo menu ou um diferente... só mudar o label"). `updateAccount` already supported partial updates to `credit_cards.closing_day`/`due_day` in the same call as `credit_limit`, so this was UI-only.
- Debts: `addDebtTransaction` now defaults an empty `description` to `"Movimentação da dívida {agent}"` (fixed 2026-08-07, previously a generic "Movimentação de dívida" with no debt name) and auto soft-deletes the debt when a payment brings its real remaining balance to zero or below — an overpayment (e.g. interest the payer/creditor decided to settle) still zeroes it out intentionally, it isn't treated as an error. `DebtTransactionDialog` warns the user before submitting such a payment and requires a second explicit confirm ("Confirmar quitação"), so the debt disappearing from the list is never a surprise.
- The Reservoir feature is now **displayed** as "Receita Programada" with a `Vault` icon instead of "Reservatórios"/`Droplets` (fixed 2026-08-07, at the user's explicit request — display-only, see AI_CONTEXT.md "Reservoir (Cofre)"). Route (`/reservoirs`), tables (`reservoirs`, `reservoir_transactions`), service (`reservoirs.service.ts`), and DTOs (`ReservoirDTO`, `ReservoirTransactionDTO`) are untouched on purpose — only Portuguese UI strings and the nav icon changed, across `nav-items.ts`, `reservoirs/page.tsx`, `reservoir-form-dialog.tsx`, `withdrawal-dialog.tsx`, and `delete-category-dialog.tsx`'s usage-count text.
- Default-description convention broadened to every system-generated transaction that names an entity but had no free-text description field of its own (fixed 2026-08-07, generalizing the Debts fix from the same day): `addReservoirTransaction`/`withdrawReservoir` → `"Movimentação da receita programada {nome}"`; `registerCardPayment` → `"Pagamento da fatura do cartão {nome}"`; `registerYield`/`reconcileAccountBalance` → `"Informar Rendimento — {conta}"`/`"Ajustar Saldo — {conta}"`; `payFixedExpenseAction` → `"Pagamento — {nome da despesa fixa}"`. Previously several of these left `transactions.description` `null` or a generic string with no entity name, showing as blank/indistinguishable in Lançamentos and the Dashboard's Transaction Explorer.

**Known gaps** (not started, don't assume otherwise): no automated tests yet (see "Testing & Migrations" in `AI_GENERATION_RULES.md` for the intended scope); still no *general* account-level edit dialog (name/institution) — only the type-specific actions (balance, yield/reconcile, limit) exist, by design; OFX import remains out of scope per `AI_CONTEXT.md`.

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
 │  ├ dashboard/components (dashboard-filters incl. shared MonthPicker + account-type icons per account + categories grouped by INCOME/EXPENSE, summary-cards, income-expense-chart, monthly-chart, category-pie, category-bars, budgets-panel [nests fixed expenses under their parent budget], transaction-explorer [account-type icon per row — no longer has its own "Reclassificar em lote" trigger, see below], editable-category-cell)
 │  ├ transactions/components (transaction-form-dialog, delete-transaction-button, month-nav — Lançamentos is month-scoped like Cards/Dashboard, not an unfiltered all-time list)
 │  ├ accounts/components (account-form-dialog [no institution field for CASH], account-card, balance-adjust-dialog [Informar Rendimento BANK-only], limit-adjust-dialog [Ajustar Limite/Ajustar Cartão — credit_limit/overdraft_limit editable anytime; for CREDIT_CARD also edits closing_day/due_day in the same dialog, just a different trigger label])
 │  ├ cards/components (purchase-form-dialog [create+edit, competence override, over-limit warning], payment-form-dialog, delete-purchase-button, month-nav)
 │  ├ reservoirs/components (reservoir-form-dialog, accrual-dialog [description pre-filled with "Movimentação da receita programada {nome}"], withdrawal-dialog — feature displayed as "Receita Programada" in the UI, folder/file names unchanged)
 │  ├ debts/components (debt-form-dialog, debt-transaction-dialog [defaults description to "Movimentação da dívida {nome}"; warns and requires a second confirm before a payment that fully settles/overpays the debt], debts-charts ["Dívidas a pagar"/"Dívidas a receber" pies, each rendered only when that side has data])
 │  ├ budgets/components (budget-form-dialog [create+edit], fixed-expense-form-dialog [create+edit], budget-tree-editor ["Planejar orçamentos" — whole category+subcategory tree in one screen, reuses onboarding's tree pattern], deactivate-budget-button, deactivate-fixed-expense-button, pay-fixed-expense-dialog)
 │  └ categories/components (category-form-dialog, subcategory-form-dialog, category-tree-item [onboarding], inline-category-create [used from transaction/card-purchase forms], delete-category-dialog)
 ├ components
 │  ├ ui (button, card, input/field/label/textarea, dialog, select [incl. SelectGroup/SelectLabel for grouped options], tabs, checkbox, switch, dropdown-menu, popover, table, badge, icon-picker + icon-set, account-type-icon [CASH/BANK/CREDIT_CARD → Banknote/Wallet/CreditCard, shared by Accounts + transaction lists], month-picker [prev/next + click-anywhere-on-label native month picker, shared by Dashboard/Cards/Transactions month navigators], confirm-delete-dialog, corner-marks — the Industry blueprint frame)
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

Navigation: mobile-first, bottom navigation (Dashboard, Transactions, Accounts, Cards, More), desktop sidebar (adds Receita Programada [`/reservoirs` — see AI_CONTEXT.md "Reservoir (Cofre)" for why the route/table names stay `reservoir*` while the UI label doesn't], Debts, Budgets, Settings).

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
6. Budgets & Fixed Expenses panel (planned vs actual, alerts; fixed expenses nested under their parent category/subcategory budget — see AI_CONTEXT.md "Budget hierarchy")
7. Transaction Explorer (table, reacts to all filters and to chart clicks)

**Inline editing is a requirement, not a nice-to-have.** The Transaction Explorer (and any other dashboard table showing individual records) must allow editing category/subcategory/description directly on the row — never force a detour to a separate menu/form to fix something spotted while browsing the dashboard. The exact interaction (click-to-edit, inline dropdown, mobile pattern) is a visual design decision — resolve it in Design, not here; what's fixed at this layer is that `updateTransaction` must support partial, low-friction updates callable straight from dashboard components.

**`reassignCategory` (`categories.service.ts`) is exclusive to the category/subcategory deletion flow — fixed 2026-08-07.** The Transaction Explorer used to also expose a standalone "Reclassificar em lote" button (`batch-reassign-dialog.tsx`, now removed) letting a user bulk-move transactions between categories at any time, independent of deleting anything. That duplicated a capability that only makes sense as part of guided deletion (see "Deleting a category or subcategory" in `AI_CONTEXT.md`) and was removed at the user's request — bulk reassignment now only happens through `DeleteCategoryDialog`'s own reassignment step. Per-row inline edits (`EditableCategoryCell` → `inlineEditTransaction`) are unaffected and remain on every dashboard/Lançamentos row.

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
  -- updateAccount aceita Partial<AccountInput> — usado pelo "Ajustar Limite" pra editar só
  -- creditLimit ou overdraftLimit a qualquer momento, sem tela de edição geral de conta
getAccountBalance(accountId) → number  -- initial balance + SUM de todas as transactions que afetam a conta
registerYield(accountId, realBalance)
  -- "Informar Rendimento": só oferecido na UI para contas BANK (CASH não rende sozinho) —
  -- compara realBalance ao calculado; cria transaction INCOME/"Rendimentos" pra diferença
reconcileAccountBalance(accountId, realBalance)
  -- "Ajustar Saldo": mesmo cálculo de diferença, mas categoria system "Ajuste"
  -- (INCOME ou EXPENSE conforme o sinal) — disponível pra CASH e BANK
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
getCardBalanceThroughMonth(creditCardId, throughMonth) → number
  -- installments com competence <= throughMonth, menos pagamentos já feitos, floor em 0
getCardTotalCommitted(creditCardId) → number
  -- TODAS as installments já geradas pro cartão (passadas, do mês atual e futuras ainda não
  -- vencidas) menos TODOS os pagamentos já feitos, floor em 0 — a figura correta de "usado
  -- contra o limite" (fixed 2026-08-07). Deliberadamente diferente de getCardBalanceThroughMonth,
  -- que exclui parcelas futuras ainda não vencidas de propósito (ver AI_CONTEXT.md
  -- "CREDIT_CARD_PAYMENT" — essa outra alimenta a sugestão do "Pagar fatura", não o card "usado/total")
getCardSummary(creditCardId, viewedMonth, creditLimit) → CardSummaryDTO
  -- dois conceitos de mês independentes, de propósito não são o mesmo parâmetro:
  -- usedThroughCurrentMonth/overdueAmount ficam SEMPRE ancorados no mês real de hoje (o quanto
  -- devo agora — alimenta a sugestão do "Pagar fatura"), mesmo que a página esteja navegando
  -- por outro mês via o filtro; currentMonthInvoice reflete `viewedMonth` (o mês filtrado na
  -- página); totalCommitted (= getCardTotalCommitted) não depende de mês nenhum — é o "usado/total"
  -- correto contra o limite. Ver AI_CONTEXT.md "Credit Card Purchases" pro raciocínio completo.
registerCardPayment(data)
```

## reservoirs.service.ts
```
-- feature exibida na UI como "Receita Programada" (renomeado 2026-08-07, só o label/ícone —
-- ver AI_CONTEXT.md "Reservoir (Cofre)"); nomes de rota/tabela/service/DTO permanecem reservoir*
createReservoir(data)
addReservoirTransaction(data)   -- lançamento de acúmulo (amount positivo); description default
  -- = "Movimentação da receita programada {nome}" quando não informada
withdrawReservoir(data)         -- saque (amount negativo, cria transaction vinculada); mesmo
  -- default de description do acúmulo, aplicado tanto no ledger quanto na transaction vinculada
getReservoirs() → ReservoirDTO[]
getReservoirTransactions(reservoirId) → ReservoirTransactionDTO[]
```

## debts.service.ts (NOVO)
```
createDebt(data)
addDebtTransaction(data) → { settled: boolean }
  -- amount positivo=aumento, negativo=pagamento; linked_transaction_id opcional. Se
  -- `description` vier vazio, usa "Movimentação da dívida {agent}" como default — tanto na
  -- linked transaction quanto na própria linha do ledger (fixed 2026-08-07). Depois de
  -- inserir, recalcula o saldo restante real do banco; se <= 0 (quitou ou pagou a mais —
  -- ex.: juros que o pagador/credor decidiu acertar), chama deactivateDebt automaticamente —
  -- soft delete, a dívida some de getDebts(). A UI avisa ANTES de enviar quando o pagamento
  -- vai fazer isso (DebtTransactionDialog), mas a decisão de fato é sempre pelo saldo real
  -- pós-insert, não pela previsão do client.
getDebts() → DebtDTO[]   -- filtra active = true, então uma dívida quitada já não aparece
getDebtTransactions(debtId) → DebtTransactionDTO[]
deactivateDebt(id)  -- soft delete; chamado automaticamente por addDebtTransaction ao zerar o saldo
```

## budgets.service.ts (NOVO)
```
createBudget(data) → { id, notices[] }
updateBudget(id, data) → { notices[] }
  -- ambos aplicam o piso da hierarquia (ver AI_CONTEXT.md "Budget hierarchy") antes de
  -- salvar: se amount < floor (soma de budgets de subcategoria + fixed_expenses diretas),
  -- lança erro — bloqueio duro, nunca silencioso. Depois de salvar um orçamento de
  -- subcategoria, chama reconcileBudgetFloors (_shared.ts) pra propagar o floor pro
  -- orçamento da categoria; `notices[]` traz o texto pronto pra UI quando isso acontece
deactivateBudget(id)  -- soft delete
getBudgets(month) → BudgetDTO[]   -- month é parâmetro de agregação, não coluna
```

## fixed-expenses.service.ts (NOVO)
```
createFixedExpense(data) → { id, notices[] }
updateFixedExpense(id, data) → { notices[] }
  -- uma despesa fixa é um piso comprometido do orçamento da sua categoria/subcategoria —
  -- nunca bloqueia; ambas chamam reconcileBudgetFloors (_shared.ts) depois de salvar, que
  -- cria ou aumenta o(s) orçamento(s) afetado(s) e devolve `notices[]` com o texto pronto
deactivateFixedExpense(id)  -- soft delete
getFixedExpenses(month) → FixedExpenseDTO[]
```

## _shared.ts
```
getActualAmountForCategory(...)  -- reusado por budgets e fixed-expenses pro actualAmount do mês
getCategoryBudgetFloor(supabase, userId, categoryId) → number
  -- SUM(budgets de subcategoria ativos da categoria) + SUM(fixed_expenses ativas direto
  -- na categoria, sem subcategoria)
getSubcategoryBudgetFloor(supabase, userId, subcategoryId) → number
  -- SUM(fixed_expenses ativas daquela subcategoria)
reconcileBudgetFloors(supabase, userId, categoryId, subcategoryId) → string[]
  -- chamada depois de criar/editar uma fixed expense (ou salvar um orçamento de
  -- subcategoria, passando subcategoryId=null pra só propagar pra cima): nunca bloqueia,
  -- só cria/aumenta o(s) orçamento(s) cujo floor passou do valor atual, devolvendo avisos
  -- legíveis pra UI mostrar
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
  accountType: AccountType | null // drives the account-type icon (Banknote/Wallet/CreditCard) in transaction lists
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
  subcategoryId?: string; subcategoryName?: string
  plannedAmount: number; dueDay: number; defaultAccountId?: string
  actualAmount: number         // soma da(s) transaction(s) do mês vinculada(s) via fixed_expense_id
  projectedAmount: number      // exibido no dashboard: actualAmount > 0 ? actualAmount : plannedAmount
  isPaidThisMonth: boolean     // actualAmount > 0
  status: "OK" | "EXCEEDED"
}

type CardSummaryDTO = {
  accountId: string; creditLimit: number | null
  usedThroughCurrentMonth: number // = getCardBalanceThroughMonth(cardId, todayMonth) — sempre ancorado no mês real de hoje, alimenta a sugestão do "Pagar fatura"
  currentMonthInvoice: number     // soma de card_installments.amount no mês VISUALIZADO (filtro de mês da página), não necessariamente hoje
  overdueAmount: number           // = usedThroughCurrentMonth - (fatura do mês de hoje), floor em 0 — sempre ancorado em hoje
  totalCommitted: number          // = getCardTotalCommitted — TODAS as installments (incl. futuras) menos pagamentos, floor em 0 — a figura correta de "usado/total" contra o limite
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
