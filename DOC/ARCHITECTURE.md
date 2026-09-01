# Financial Control System — Architecture

Architecture, data flow, UI structure, and coding rules. Goal: let AI tools generate most of
the app code consistently.

A **personal financial control system with analytics dashboard**, for the owner and a closed
group of friends, each with fully isolated data. Not commercial.

**Scope of this file: current architecture, contracts, and DTOs.** The dated chronology of
how features and deviations were reached lives in `DOC/HISTORY.md` (not auto-loaded). Read
together with `AI_CONTEXT.md` (domain rules), `schema.sql`/`seed.sql`, and
`supabase/migrations/`.

---

# Tech Stack

Frontend: Next.js 16 (App Router, Turbopack), React 19, TypeScript, TailwindCSS v4 (CSS-first
`@theme`, no `tailwind.config.js`), hand-built shadcn/ui-style primitives in
`src/components/ui`, Recharts.
Backend: Supabase, PostgreSQL. Auth: Supabase Auth.

Visual design: the "Industry" Claude Design system (steel-blue blueprint — square-cornered
cards/buttons with "+" corner marks, Barlow Condensed headings over Barlow body).
`--color-success`/`--color-danger`/`--color-warning` are a deliberate extension beyond
Industry's mono palette.

Open Finance / bank sync is **out of scope** (see `AI_CONTEXT.md`). All financial entry is
manual.

---

# Implementation Status

The full app is built and running — this isn't a spec waiting to be implemented, it's what's
in `src/`. Read this before assuming something is missing; grep `src/` to confirm specifics,
not to rediscover whether a feature exists.

## Built

- **Auth** — signup/login/signout, email-confirmation-aware.
- **Onboarding** — first-time order account → categories → budget (all outside the `(app)`
  layout). `/onboarding/account` confirms the auto-created "Carteira" balance;
  `/onboarding` is the category tree-picker (5 pre-checked, `QUICK_START_CATEGORY_NAMES`),
  re-openable from Settings showing the FULL `is_default` catalog with already-imported items
  checked+disabled; `/onboarding/budget` is a skippable first-time budget step.
- **Dashboard** — single month only (period presets removed), navigated by the shared
  `MonthPicker`. Filters: category (multi-select, grouped under Receitas/Despesas with a
  per-group select-all — this replaced the standalone "Tipo" dropdown) + account (with type
  icons). Charts: monthly evolution (always 12 months back + 3 forward) + expense/income
  category donuts side by side (the expense donut segmentable by account type via
  `ExpenseSourceToggle`). A "Despesas de {mês}" card (`MonthObligationsCard`): donut +
  actionable list of what's still to pay (card invoices by competence, fixed expenses,
  `OVERDUE_BILL`/`INSTALLMENT_PLAN` debts, each with a "Pagar" button). The DESPESAS/Balanço
  cards, the expense donut, and the viewed-month evolution bar fold in that same
  unpaid-obligations projection (a documented break from "Money Reality Rules" — see
  `AI_CONTEXT.md`). Budgets/fixed-expenses panel scoped to the viewed month. Transaction
  Explorer with inline category edit + a full-edit dialog (`source: "transaction"` rows only)
  + delete + account-type icon per row; below `sm:` it renders a stacked card list. A "Metas"
  block of compact donuts + a "Guardado (metas)" evolution bar + a "guardado em metas" Saldo
  sub-line.
- **Transactions** (`/transactions`) — month-scoped like Cards/Dashboard; create/edit/delete;
  no manual "pay card bill". `CREDIT_CARD_PAYMENT` rows show a fixed "Pagamento de Cartão"
  label (also the `is_system` category they carry, migration `0031`). `RESERVE`/`REDEEM` rows
  are read-only ("Edite pela tela de Metas").
- **Accounts** — create (institution-first naming, no institution for `CASH`; initial balance
  for CASH/BANK). "Informar Rendimento" (BANK only), "Ajustar Saldo" (CASH+BANK), "Lançar
  Juros" (BANK only). "Editar Conta"/"Editar Cartão" quick action — name (all types),
  institution + `credit_limit`/`overdraft_limit` (BANK/CREDIT_CARD), `closing_day`/`due_day`
  (CREDIT_CARD). Each `CREDIT_CARD` card shows the same `totalCommitted / creditLimit` figure
  as the Cards page + the paid/partial invoice badge + the open-invoice line. A red icon-only
  inconsistency warning (`getInconsistency`). Account-type icon (Banknote/Wallet/CreditCard)
  everywhere.
- **Cards** — create/edit/delete a purchase (edit rolls back and regenerates every
  installment); competence month defaults from the card + overridable via a month picker;
  inline category/subcategory editing per installment row; a "Fatura ▾" menu ("Pagar fatura"
  + "Lançar juros"); soft credit-limit warning; usado/total against the full committed
  balance, the viewed month's invoice, overdue amount, `creditBalance` (saldo a favor from a
  refund/overpayment); a purchase can be backfilled as retroactive ("compra antiga" +
  "pago até" → `paid_before_system` prefix); "Antecipar parcelas" and "Estornar compra" per
  purchase; `getDefaultCardsMonth` auto-advances to next month when every card is settled;
  "Evolução mensal do cartão" chart (`CardEvolutionChart`, ±6 months, green/red paid split
  or stacked-by-category under a filter).
- **Receita Programada** (`/reservoirs`) — accrual/withdrawal entries, gross/net split,
  reservoir-level defaults, hard delete.
- **Metas** (`/goals`) — the mirror of Receita Programada; see `AI_CONTEXT.md` → "Metas".
  Aporte/resgate = `transactions` RESERVE/REDEEM; rendimento = `goal_yields` (synthetic
  INCOME); ahead/behind badge; "Recalcular" rebases without touching the ledger; hard delete;
  an "Acumulado guardado" chart.
- **Debts** — three sibling screens (`/debts` = PERSONAL, `/overdue-bills` = OVERDUE_BILL,
  `/installment-plans` = INSTALLMENT_PLAN), each with its own kind-specific form (no kind
  selector). Pie charts for a pagar/a receber (only `/debts`, only shown when the side has
  data); default description; auto soft-delete on settle-to-zero after a confirm-again
  warning; default category typed by side, pre-filled on the payment dialog only; debt +
  ledger entries editable/deletable with direction locked; `INSTALLMENT_PLAN` ahead/behind
  badge by competence.
- **Budgets / Despesas Programadas** — month-scoped budgets (`MonthNav` browses any month;
  only the current real month + the next once the current has a budget are editable; earlier
  is read-only). "Clonar de {mês}" from `lastRegisteredMonth`. A category's number is always
  real-or-absent, never an implicit sum. A fixed expense is a committed floor
  (auto-raises/creates a budget with a notice, never blocks; lowering below the floor is a
  hard block; a budget that's a fixed-expense floor can't be deleted, only raised). One
  unified tree (shared read-only by the dashboard panel); "Planejar orçamentos" plans /
  bulk-deletes a whole tree for one month; the page lists the month's transactions at the
  bottom. Also carries a **"Receitas Recorrentes"** block (migration 0038) — predictable-income
  templates with a per-month "Registrar recebimento", the mirror of the fixed-expense rows;
  purely a convenience, never projected into any analytic (AI_CONTEXT.md "Receitas Recorrentes").
  (Named "Receita Recorrente", NOT "Receita Programada" — that label is the reservoirs feature's.)
- **Per-screen help** — a page-level `HelpButton` ("?") in every header, plus granular `HelpHint`
  ("?") on every chart (and, planned, on the trickier form fields). A `HelpHint` auto-opens once
  on the first visit to a screen (one per visit, `localStorage`-tracked), auto-closes after a few
  seconds, and can be replayed from Settings → "Rever dicas das telas".
- **Settings** — category/subcategory CRUD with guided deletion, curated emoji icon picker,
  "Rever dicas das telas" (resets the `HelpHint` first-visit flags).

## Deviations from the original MER spec

Each is documented at its point of change in `AI_CONTEXT.md` and/or the migration comment;
the dated reasoning is in `DOC/HISTORY.md`. Current state:

- **`bank_accounts.initial_balance`** exists (migration `0005`) — CASH and BANK both work as
  `initial_balance + SUM(transactions)`.
- **`credit_cards.credit_limit` is required and `> 0`** (`0007`/`0008`), reversing the
  original "optional" design. Only the purchase-exceeds-limit *warning* is soft-enforced.
- **`budgets` is month-scoped** (`budgets.month`, `0009`) — the original spec's "month is a
  query parameter, never a column" no longer applies to this table. A category's ceiling is
  never a computed sum of its subcategories.
- **`profiles.onboarding_completed`** (`0004`) + the `on_auth_user_created` trigger (`0003`,
  updated `0025` to also create the "Carteira" account).
- **The `is_system` category seed lives only in `seed.sql`**, not duplicated in `schema.sql`.
- **The manual transaction form never offers `CREDIT_CARD_PAYMENT`** — it's created only
  through "Pagar fatura" (`registerCardPayment`).
- **`is_system` categories are never form-selectable** — `CategorySelect` filters
  `!c.isSystem`; each is applied only by its own dedicated flow. The filter dropdowns still
  list them.
- **Dashboard chart clicks that target "no category"** pass `uncategorizedOnly: true`, never
  a literal `"uncategorized"` string through `category_id.in(...)` (not a uuid — Postgres
  rejects it).
- **The Budget/Fixed-Expense hierarchy** breaks from the soft-enforce pattern in one
  direction: lowering a budget below its committed children is a **hard block**. Raising is
  automatic + a notice.
- **The dashboard expense side projects unpaid obligations** — a deliberate, documented break
  from "Money Reality Rules", dashboard-presentation only.

## Known gaps (not started)

- No automated tests yet (see `AI_GENERATION_RULES.md` → "Testing & Migrations" for the
  intended scope: installment rounding, reservoir/debt/goal balance, RLS isolation).
- OFX import — out of scope per `AI_CONTEXT.md`.

## Open issues / caveats

- **Found, not fixed** — a "Despesa Programada" paid via a credit card whose invoice already
  closed can stay showing as unpaid/overdue for the month it was due (the installment bills
  to *next* month's competence, and `isPaidThisMonth` matches competence to the viewed
  month). Needs a product decision, not a unilateral fix. Full repro in `DOC/HISTORY.md`.
- **`reservoirs.active`** is vestigial (nothing writes `false` anymore) — a future cleanup
  migration could drop it.
- **`percentage` range disagreement** — zod allows `0`, the DB `CHECK` requires `> 0`.
  Submitting exactly `0` fails with a raw Postgres error. Probably align zod to `> 0`.

## Migrations changelog (`supabase/migrations/`)

Applied in order; each additive (a new file corrects an old one, never a rewrite).
`schema.sql`/`seed.sql` always represent the *current merged* state.

| # | File | What |
|---|---|---|
| 0001 | `initial_schema` | full base schema (tables, enums, RLS) |
| 0002 | `seed` | `is_system` categories + `is_default` starter pack + subcategories + `financial_institutions` |
| 0003 | `profile_trigger` | `on_auth_user_created` — auto-creates `profiles` on signup |
| 0004 | `onboarding_flag` | `profiles.onboarding_completed` |
| 0005 | `bank_initial_balance` | `bank_accounts.initial_balance` |
| 0006 | `remove_card_payment_subcategory` | drops "Pagamento de Cartão" from default `Dívidas` subcategories (a no-op against a fresh DB — see `HISTORY.md` on the `0002` hand-edit) |
| 0007 | `credit_card_limit` | `credit_cards.credit_limit` |
| 0008 | `credit_card_limit_required` | `credit_limit` → `NOT NULL CHECK (> 0)` |
| 0009 | `monthly_budgets` | `budgets.month` `NOT NULL` + partial unique index `NULLS NOT DISTINCT (user_id, category_id, subcategory_id, month) WHERE active` + `(user_id, month)` index |
| 0010 | `reservoir_defaults` | `reservoirs.default_percentage`, `default_destination_account_id` |
| 0011 | `reservoir_transaction_date` | `reservoir_transactions.date`, backfilled from `created_at` |
| 0012 | `card_purchase_fixed_expense` | `card_purchases.fixed_expense_id` (`ON DELETE SET NULL`) — pay a fixed expense on a card as a 1x purchase |
| 0013 | `performance_indexes` | indexes on every hot FK/filter column. Shipped with two code fixes: `getOptionalUser()` wrapped in `cache()`; sequential `for...await` loops parallelized |
| 0014 | `card_installment_paid_before_system` | `card_purchases.paid_through_competence` + `card_installments.paid_before_system` — backfilled retroactive purchases |
| 0015 | `debt_default_category` | `debts.default_category_id` (nullable `RESTRICT` FK) |
| 0016 | `debt_transaction_date` | `debt_transactions.date` (`NOT NULL DEFAULT CURRENT_DATE`, backfilled) |
| 0017 | `supermercado_own_category` | data-only: "Supermercado" promoted from a subcategory under "Alimentação" to its own `is_default` `EXPENSE` category |
| 0018 | `supermercado_color` | data-only: gives "Supermercado" its own color (`0017` left it identical to "Alimentação") |
| 0019 | `estorno_refunds` | `Estorno` `is_system` pair (EXPENSE + INCOME), `transactions.refund_of_transaction_id` (self-FK), `card_refunds` table (`card_purchase_id` UNIQUE) |
| 0020 | `reload_schema_cache` | `NOTIFY pgrst, 'reload schema'` — `db push` doesn't refresh PostgREST's cache the way the SQL Editor does |
| 0021 | `debt_kinds` | `debts.kind` (`PERSONAL`/`OVERDUE_BILL`/`INSTALLMENT_PLAN`, default `PERSONAL`), `debts.monthly_amount`, `debts.due_day` |
| 0022 | `reload_schema_cache` | as `0020`, for the `debts` columns |
| 0023 | `fixed_expense_amount_history` | `fixed_expense_amount_history` (`{fixed_expense_id, amount, effective_from}`, unique per pair), backfilled at `effective_from = '1970-01-01'` |
| 0024 | `reload_schema_cache` | as `0020` |
| 0025 | `default_wallet_account` | `CREATE OR REPLACE FUNCTION handle_new_user()` — also inserts a "Carteira" `CASH` account on signup |
| 0026 | `fixed_expense_competence_window` | `fixed_expenses.start_competence` (`NOT NULL`, backfilled) + `end_competence` (nullable) + `CHECK` |
| 0027 | `reload_schema_cache` | as `0020` |
| 0028 | `fixed_expense_hard_delete` | drops `fixed_expenses.active` after hard-deleting every already-soft-deleted row |
| 0029 | `reload_schema_cache` | as `0020` |
| 0030 | `compras_retroativas_category` | data-only: `is_system` INCOME "Compras retroativas" (one row) |
| 0031 | `card_payment_category` | data-only: `is_system` EXPENSE "Pagamento de Cartão" + backfill onto every existing `CREDIT_CARD_PAYMENT` |
| 0032 | `debt_installment_start_competence` | `debts.start_competence` (nullable, required-in-zod for `INSTALLMENT_PLAN`), backfilled `date_trunc('month', created_at)` |
| 0033 | `reload_schema_cache` | as `0020` |
| 0034 | `goal_transaction_types` | adds `RESERVE` / `REDEEM` to the `transaction_type` enum (isolated file — Postgres can't add and use an enum value in one transaction) |
| 0035 | `goals` | `goals` + `goal_yields` + `transactions.goal_id`; RLS `auth.uid() = user_id` on both new tables |
| 0036 | `goal_redeem_categories` | data-only: 2 `is_system` INCOME categories — "Resgate de Meta Concluída" / "Antecipado" |
| 0037 | `reload_schema_cache` | as `0020`, for the `goals` tables |
| 0038 | `recurring_incomes` | `recurring_incomes` (predictable-income template) + `transactions.recurring_income_id` (`ON DELETE SET NULL`); RLS `auth.uid() = user_id`. `category_id`/`default_account_id` are `SET NULL`, not `RESTRICT` — a template carries no history of its own |
| 0039 | `reload_schema_cache` | as `0020`, for `recurring_incomes` |

---

# Architectural Principles

1. UI never queries Supabase directly.
2. All DB access goes through **services**.
3. Services do queries and aggregations, return **DTOs**.
4. UI consumes DTOs, never raw table rows.
5. Charts receive **aggregated data**, never raw transactions (no `reduce()`/`map()`
   aggregation in components).
6. The Dashboard is interactive and filter-driven.
7. **Every user's data is isolated** — RLS `auth.uid() = user_id` on every user-scoped table,
   never only at the application layer.
8. Any value computable from other rows (balances, totals, remaining amounts) is **never
   stored as a column** — always computed in the service/query layer.

---

# Multi-tenant / Access Model

Each friend is a fully isolated user. No sharing, no workspace, no invite/role system.

- Every user-scoped table has a `user_id` referencing `auth.users`, with RLS `auth.uid() =
  user_id`. Tables without a direct `user_id` (`card_installments`, `debt_transactions`,
  `goal_yields`, …) check via `EXISTS` against their parent.
- Global/catalog tables (`financial_institutions`, `categories`/`subcategories` where
  `user_id IS NULL`) are public-read, not client-writable.
- Onboarding **copies** the selected `is_default` starter categories into the user's own
  `user_id` (no FK back to the source). `is_system` rows are never copied — they stay global
  and are queried directly (`user_id = auth.uid() OR is_system = true`).
- Never trust a `user_id` from the client — always derive it from the session (`getUser()` in
  `src/lib/auth`) server-side. Never use a service-role key from anything the client can
  reach.

---

# Data Fetching & Mutations

Server Components. Pages fetch directly from services on the server:

```
page.tsx (Server Component) → service → Supabase → DTO → component
```

Mutations use **Server Actions** calling services:

```
Server Action → service → Supabase → DB updated
```

API routes are not created unless strictly necessary.

---

# Project Structure

```
src
 ├ lib
 │  ├ supabase (client.ts, server.ts, proxy.ts — session refresh, called from src/proxy.ts)
 │  ├ auth (getUser.ts — getUser() redirects, getOptionalUser() doesn't; both cached())
 │  ├ utils (cn, currency, date [incl. installment-competence math, daysUntilDueThisMonth,
 │  │        month-preset resolution — resolvePeriodPreset unused, kept for a future reports
 │  │        tab], id, money [cents-safe arithmetic + calculateGrossNetSplit], normalize,
 │  │        number, string)
 │  └ validations (one file per domain — Zod. A schema with .superRefine()/.refine() can't
 │                 be .partial()'d; keep a plain base object schema alongside the refined one,
 │                 e.g. accounts.ts / transactions.ts)
 ├ services (one per domain: dashboard, transactions, accounts, categories, cards, reservoirs,
 │           goals, debts, budgets, fixed-expenses, recurring-incomes, profile; _shared.ts holds
 │           the budget/fixed-expense actualAmount + floor aggregation both reuse)
 ├ features
 │  ├ dashboard/components (dashboard-filters [MonthPicker + account-type icons +
 │  │   category-multi-select]; use-category-filter.ts; filters.ts [parseDashboardFilters —
 │  │   always single-month]; month-obligations-card.tsx ["Despesas de {mês}"];
 │  │   summary-cards; monthly-chart [15-month window]; category-pie [expense + income donuts,
 │  │   additive multi-select]; expense-source-toggle; goals-overview.tsx; budgets-panel
 │  │   [shares BudgetTree read-only]; transaction-explorer [table above sm:, stacked cards
 │  │   below]; editable-category-cell)
 │  ├ transactions/components (transaction-form-dialog, delete-transaction-button,
 │  │   refund-transaction-dialog.tsx, month-nav, transaction-filters.tsx)
 │  ├ accounts/components (account-form-dialog [no institution for CASH],
 │  │   account-card [getInconsistency warning], accounts-overview-charts.tsx,
 │  │   balance-adjust-dialog [Informar Rendimento / Ajustar Saldo],
 │  │   interest-dialog.tsx [InterestDialog — "Lançar Juros", optional base×% calculator],
 │  │   limit-adjust-dialog.tsx [LimitAdjustDialog — "Editar Conta"/"Editar Cartão"; name all
 │  │   types, +institution/limits BANK+CARD, +closing/due CARD])
 │  ├ cards/components (purchase-form-dialog [create+edit, competence override, over-limit
 │  │   warning], payment-form-dialog, refund-purchase-dialog.tsx [full refund only],
 │  │   advance-installments-dialog.tsx ["Antecipar parcelas"], delete-purchase-button,
 │  │   month-nav, card-filters.tsx, card-expense-donut.tsx, card-evolution-chart
 │  │   [±6 months by competence, own local multi-select category filter via
 │  │   use-evolution-category-filter.ts])
 │  ├ reservoirs/components (reservoir-form-dialog, accrual-dialog, withdrawal-dialog,
 │  │   delete-reservoir-button.tsx, delete-reservoir-transaction-button.tsx)
 │  ├ goals/components (goal-form-dialog [create+edit; start/end month pickers; live
 │  │   contribution suggestion; optional initial reserve], reserve-dialog, redeem-dialog
 │  │   [Concluída/Antecipado toggle], goal-yield-dialog, edit-goal-entry-dialog,
 │  │   recalculate-goal-button [only when the goal has a deadline], delete-goal-button,
 │  │   delete-goal-entry-button, goal-card.tsx [async], goal-accumulation-chart.tsx)
 │  ├ debts/components (shared by /debts, /overdue-bills, /installment-plans:
 │  │   debts-view.tsx [async — filters getDebts() by kind + optional side],
 │  │   debt-card.tsx [async — one card, fetches its own getDebtTransactions],
 │  │   debt-form-dialog [create+edit, kind fixed by the screen, NO kind selector; direction
 │  │   picker only for PERSONAL; monthlyAmount/dueDay/startCompetence only for
 │  │   INSTALLMENT_PLAN; default category], debt-transaction-dialog [create+edit; default
 │  │   description; optional interest-% calculator on mode="increase"; defaultAmount prop
 │  │   for quick-pay; second-confirm before a settling/overpaying payment; propagates to the
 │  │   linked transaction, direction locked], delete-debt-button, delete-debt-transaction-button,
 │  │   debt-side-filter.tsx [/debts only], debts-charts [payableTitle/receivableTitle props])
 │  ├ budgets/components (budget-form-dialog, fixed-expense-form-dialog, budget-tree-editor
 │  │   ["Planejar orçamentos" — clearing a field deletes that row, same guards],
 │  │   budget-tree-fields [shared with the onboarding budget step], budget-tree [the only
 │  │   list on /budgets; renderFixedExpenseActions slot per nested fixed-expense row],
 │  │   progress-row, clone-budget-button, deactivate-budget-button [hidden + blocked when
 │  │   fixed expenses depend on the row], delete-fixed-expense-button [hard delete],
 │  │   pay-fixed-expense-dialog [branches on isPaidThisMonth: pay form / summary +
 │  │   "Cancelar pagamento"; also a "Já lancei isso manualmente" link-existing mode])
 │  ├ recurring-incomes/components (recurring-incomes-section [block on /budgets],
 │  │   recurring-income-form-dialog [create+edit], register-receipt-dialog [branches on
 │  │   receivedThisMonth: receipt form / summary + "Cancelar recebimento"],
 │  │   delete-recurring-income-button) — migration 0038, mirror of the fixed-expense flow;
 │  │   template-only, never projected (AI_CONTEXT.md "Receitas Recorrentes")
 │  └ categories/components (category-form-dialog, subcategory-form-dialog, category-tree-item
 │     [full is_default catalog, already-imported checked+disabled], category-select
 │     [CategorySelect/SubcategorySelect — standard picker, "Nova …" item in the dropdown,
 │     filters !c.isSystem], delete-category-dialog)
 ├ components
 │  ├ ui (button, card, input/field/label/textarea, dialog [inner scroll div — CornerMarks
 │  │   bleed must not count as overflow], select [+ SelectGroup/SelectLabel; SelectTrigger
 │  │   truncates], tabs, checkbox [+ indeterminate glyph], switch, dropdown-menu, popover,
 │  │   table, badge, icon-picker + icon-set, color-picker.tsx, account-type-icon,
 │  │   account-select [grouped CASH→BANK→CREDIT_CARD with type icon], month-picker
 │  │   [click-anywhere-on-label showPicker(); shared by Dashboard/Cards/Transactions],
 │  │   loading-overlay [full-screen "Carregando…"], chart-tooltip [chartTooltipStyle],
 │  │   category-checkbox-filter [generic additive multi-select popover; optional
 │  │   onToggleGroup for the group select-all], donut-with-total.tsx, invoice-paid-badge.tsx,
 │  │   help-button.tsx [static per-page "?" popover], help-hint.tsx [HelpHint + HelpTourProvider
 │  │   + CardTitleWithHelp + resetHelpHints — granular per-chart/per-field "?"; auto-opens once
 │  │   per screen visit (localStorage `help-seen:<id>`), auto-closes after a few seconds],
 │  │   confirm-delete-dialog, corner-marks)
 │  ├ layout (sidebar, header, bottom-navigation, nav-items)
 │  └ providers (navigation-progress.tsx — NavigationProgressProvider/useNavigationProgress,
 │     mounted once in (app)/layout.tsx; every filter/month-nav calls navigate() from this
 │     instead of router.push directly, so searchParams-only changes still show the overlay)
 ├ types (database.ts — raw row shapes; dto.ts — the DTOs below, source of truth)
 └ app
    ├ page.tsx (root — redirects into (auth) or (app) by session state)
    ├ (auth)/login, (auth)/signup, (auth)/actions.ts
    ├ onboarding/ (outside (app) — no nav chrome; reused for the Settings re-import too;
    │   first-time order account → categories → budget: onboarding/account/ [+
    │   onboarding-account-form.tsx], onboarding/page.tsx [categories], onboarding/budget/
    │   [+ onboarding-budget-form.tsx])
    └ (app)/dashboard, transactions, accounts, cards, reservoirs, goals, debts, overdue-bills,
       installment-plans, budgets, settings — layout.tsx redirects to /onboarding/account
       while profiles.onboarding_completed is false; every route has its own loading.tsx.
       debts / overdue-bills / installment-plans are the three debts.kind values as dedicated
       screens (presentation only — same service/DTOs/rules), thin pages over the shared
       features/debts DebtsView/DebtCard.
```

`src/lib/utils` is pure and framework-agnostic — no DB, no UI, deterministic, reusable
server+client. Money: `numeric(14,2)`, all arithmetic through `src/lib/utils/money.ts`,
installment rounding remainder → first installment. Validation cross-field rules (e.g. "income
category has no subcategory") live in `src/lib/validations` (Zod).

---

# Routing

```
(auth)/login, (auth)/signup

(app)/dashboard
     /transactions
     /accounts
     /cards
     /reservoirs            ("Receita Programada" — route/table/service names stay reservoir*)
     /goals                 ("Metas")
     /debts                 ("Dívidas Pessoais" — debts.kind = PERSONAL)
     /overdue-bills         ("Contas em Atraso" — debts.kind = OVERDUE_BILL)
     /installment-plans     ("Parcelamento Programado" — debts.kind = INSTALLMENT_PLAN)
     /budgets               (includes Despesas Programadas + Receitas Recorrentes)
     /settings
```

Navigation: mobile-first bottom nav (Dashboard, Transactions, Accounts, Cards, More); desktop
sidebar adds the rest.

---

# Dashboard Philosophy

Central feature. Interactive, filter-driven, exploratory.

```typescript
type DashboardFilters = {
  periodStart: string
  periodEnd: string          // always a single month; parseDashboardFilters resolves both
                             //   to the start/end of ?month= (or today's month)
  accounts?: string[]
  categories?: string[]      // additive/multi-select — checking a second category adds it
  subcategories?: string[]
  transactionType?: "INCOME" | "EXPENSE"  // no longer a URL control — parseDashboardFilters
                             //   always leaves it undefined; only page.tsx's two category
                             //   donuts set it per-call. "só receitas"/"só despesas" is now
                             //   checking a whole "Receitas"/"Despesas" group.
  uncategorizedOnly?: boolean // set when a chart's "no category" slice is clicked — never a
                             //   fake id in `categories`
  source?: "all" | "liquid" | "cards"  // account-type segmentation for the expense donut
                             //   only. "liquid" = transactions only, "cards" =
                             //   card_installments only. Not in the global filter bar.
}
```

The category filter popover (`CategoryCheckboxFilter`, shared with the Cards evolution chart)
gives the "Receitas"/"Despesas" group headers a tri-state select-all checkbox when the caller
passes `onToggleGroup` (the dashboard does; the Cards page doesn't). Not identical to the old
`transactionType` (all-categories-of-a-type excludes *uncategorized* rows of that type) —
accepted.

Period: **single month only**, navigated by the shared `MonthPicker`. `getDefaultDashboardMonth()`
decides the initial month without `?month=`. The Monthly Evolution chart's own 15-month
window is built separately in `dashboard/page.tsx`.

Layout:
1. Financial Summary cards (balance, income, expense, result) — `expense`/`result` include
   the viewed month's unpaid projected obligations.
1b. "Despesas de {mês}" card (`MonthObligationsCard`) — donut (`total` in the center) +
   actionable list. Follows the viewed month. Hidden when a category filter is active.
2. Monthly Evolution (bar) — 12 months back + 3 forward from the viewed month. The viewed
   month's bar folds in that month's unpaid projected obligations; the rest are actuals-only.
3. Category Distribution — EXPENSE (segmentable by account type via `ExpenseSourceToggle`) and
   INCOME donuts side by side (each forces its own `transactionType` per-call). When a
   category filter produces no data for one side while the other has data, that empty side's
   whole block is not rendered (gated so at least one donut with its "limpar filtro"
   affordance survives). The EXPENSE donut shows the viewed month's unpaid obligations as
   slices on their real category, unless the account filter or the liquid/cards toggle is
   active.
4. Budgets & Fixed Expenses panel (planned vs actual, alerts, fixed expenses nested).
5. Transaction Explorer (table, reacts to all filters and chart clicks).

**Inline editing is a requirement.** The Transaction Explorer must allow editing
category/subcategory/description directly on the row (`EditableCategoryCell` →
`inlineEditTransaction`), never forcing a detour to a form. `updateTransaction` supports
partial low-friction updates callable straight from dashboard components. There is no
standalone bulk-reassign action — `reassignCategory` is exclusive to the category-deletion
flow.

---

# Service Layer & Contracts

## dashboard.service.ts
```
getFinancialSummary(filters, obligationsMonth?) → FinancialSummaryDTO
getMonthlyEvolution(filters, obligationsMonth?) → MonthlyEvolutionDTO[]
  -- page.tsx overrides periodStart/periodEnd to 11 months before + the reference month + 3
  -- months after; MonthlyChart is always this 15-month window.
getCategoryDistribution(filters, obligationsMonth?) → CategoryDistributionDTO[]
  -- filters.source ("liquid"/"cards") narrows fetchPeriodEntries to one query — expense
  -- donut's account-type toggle only.
getTransactionsFiltered(filters) → TransactionViewDTO[]
getCurrentMonthObligations(month?) → MonthObligationsDTO
  -- "Despesas de {mês}" card. `month` = the dashboard's viewed month
  -- (monthKey(filters.periodEnd)); no arg = today's real month. INSTALLMENT_PLAN gated by
  -- competence (startCompetence/paidThroughCompetence). Card counted BY COMPETENCE
  -- (getCardSummary → currentMonthInvoice / currentMonthPaidAmount). total = paidTotal +
  -- remainingTotal. paidTotal = Σ transactions EXPENSE dated in the month + Σ
  -- currentMonthPaidAmount per card (CREDIT_CARD_PAYMENT NOT summed). items = unpaid only.
  -- Self-contained (does its own fetches). No reduce() in the component.
getDefaultDashboardMonth() → string
  -- month the dashboard opens on with no ?month=. Mirrors getDefaultCardsMonth: next month
  -- when getCurrentMonthObligations(todayMonth).remainingTotal === 0 AND
  -- getCurrentMonthObligations(nextMonth).total > 0; else today's month.
```
`fetchPeriodEntries` (module-local, feeds every function above) pulls from `transactions`
(`type in ('INCOME','EXPENSE')`), `card_installments` (EXPENSE, by competence), `card_refunds`
(INCOME, "Estorno", for the month of `refund_date`), `card_installments.paid_before_system`
amounts (INCOME, `is_system` "Compras retroativas", via cached `getRetroactiveIncomeCategory`),
and `goal_yields` (INCOME, `is_system` "Rendimentos", via cached `getRendimentosCategory`).
The last two are income-side only, skip `uncategorizedOnly`/subcategory filters, and their
category filter matches the system-category id (not a spending category). `obligationsMonth?`,
when set, appends that month's unpaid projected obligations via
`fetchUnpaidObligationEntries(supabase, filters, month)` — synthetic EXPENSE entries for
unpaid fixed expenses (`plannedAmount`, own category) + `PAYABLE` `INSTALLMENT_PLAN` whose
competence isn't covered (`monthlyAmount`, `default_category_id`) + `OVERDUE_BILL`
(`remainingBalance`, `default_category_id`), each dated `"${month}-01"`. Skipped for an
account filter, `source=liquid/cards`, or an INCOME-only view. None of these last three are
added to `getTransactionsFiltered` (no real row).

## transactions.service.ts
```
createTransaction(data) / updateTransaction(id, data) / deleteTransaction(id) / getTransactions(filters)
refundTransaction(transactionId, refundDate)
  -- full refund of an off-card expense: reclassify the original to Estorno (EXPENSE), create
  -- a new INCOME transaction (Estorno) same amount, same origin account, dated when the
  -- refund happened. refund_of_transaction_id is traceability only. Blocks a second refund.
```

## accounts.service.ts
```
getAccounts() / getFinancialInstitutions() / createAccount(data) / updateAccount(id, data)
  -- updateAccount accepts Partial<AccountInput> — "Editar Conta"/"Editar Cartão"
  -- (LimitAdjustDialog). updateAccountAction runs updateAccountSchema.parse({ id, ...input }).
  -- institutionId: null clears it.
deactivateAccount(id) / deleteAccount(id)   -- deactivate = soft delete; delete = last resort
getAccountBalance(accountId) → number
  -- CASH/BANK: initial_balance + SUM of transactions affecting the account (every type,
  -- incl. RESERVE/REDEEM). CREDIT_CARD: −(Σ card_installments − Σ card_payments) — a negative
  -- "owed to date" figure on RAW sums (includes paid_before_system, does NOT net card_refunds,
  -- NOT floored at 0); it is NOT getCardTotalCommitted. The Cards screen / AccountCard usage
  -- figures all come from getCardSummary instead, and dashboard "Saldo" filters CREDIT_CARD
  -- accounts out entirely, so this value has effectively no consumer today.
registerYield(accountId, realBalance)          -- "Informar Rendimento", BANK-only → INCOME/"Rendimentos" for the delta
reconcileAccountBalance(accountId, realBalance) -- "Ajustar Saldo", CASH+BANK → "Ajuste" (INCOME or EXPENSE by sign)
registerInterest({ accountId, amount, date? }) -- "Lançar Juros". EXPLICIT amount. Branches on
  -- the DB-read account type: CASH/BANK → EXPENSE transaction "Juros"; CREDIT_CARD → 1x
  -- card_purchases "Juros". amount <= 0 → no-op.
```

## categories.service.ts
```
getCategories(type?) / getSubcategories(categoryId)
createCategory(data) / createSubcategory(data)   -- createSubcategory throws for an INCOME parent
updateCategory(id, data) / updateSubcategory(id, data)
getDefaultCategoryImportOptions() → CategoryImportOptionDTO[]
  -- the ENTIRE is_default catalog, each item annotated alreadyImported (+ userCategoryId when
  -- true). The onboarding/Settings picker renders already-imported items checked+disabled.
copyDefaultCategories(selectedCategoryIds, selectedSubcategoryIds)
  -- copy-INSERT. A subcategory whose parent isn't in selectedCategoryIds attaches to the
  -- user's existing category copy (resolved by type+name), not a duplicate.
getCategoryUsage(categoryId) / getSubcategoryUsage(subcategoryId)
  → { count, preview: TransactionViewDTO[], budgetsCount, fixedExpensesCount, reservoirsCount, debtsCount }
reassignCategory(input: ReassignCategoryInput)
  -- { fromCategoryId?, fromSubcategoryId?, fromUncategorized?, toCategoryId, toSubcategoryId? }
  -- batch UPDATE of category_id/subcategory_id on transactions + card_purchases (+ the
  -- configs still pointing at it); toCategoryId: null = leave uncategorized. When reassigning
  -- away from a subcategory it writes BOTH category_id and subcategory_id. Exclusive to the
  -- guided-deletion flow.
deleteCategory(id) / deleteSubcategory(id)   -- only succeeds once reassignCategory zeroed the refs (RESTRICT FKs)
```

## profile.service.ts
```
getProfile() → ProfileDTO   -- self-healing: creates the profiles row on first call if absent
updateProfile({ name?, phone? })
markOnboardingCompleted()
```

## cards.service.ts
```
createCardPurchase(data)   -- computes installments from the card's closing_day/due_day.
  -- data.paidThroughCompetence marks the purchase retroactive — every installment with
  -- competence <= it is born paid_before_system = true (contiguous prefix).
getCardPurchases(cardId) / getCardInstallments(cardId, filters?)
updateCardPurchase(id, input) / deleteCardPurchase(id)
  -- updateCardPurchase = rollback-and-re-register (deletes and regenerates all installments).
  -- delete cascades. updateCardPurchaseAction runs updateCardPurchaseSchema.parse first.
  -- Merge uses `input.x !== undefined ? input.x : current.x` (not ??) so an explicit null
  -- (clear the field) persists.
getCardBalanceThroughMonth(creditCardId, throughMonth) → number
  -- installments with competence <= throughMonth AND paid_before_system = false, minus
  -- payments AND card_refunds through that month, floored at 0.
getCardTotalCommitted(creditCardId) → number
  -- ALL installments ever generated (incl. future) with paid_before_system = false, minus ALL
  -- payments AND ALL card_refunds, floored at 0. The against-the-limit figure.
refundCardPurchase(purchaseId, refundDate)
  -- full refund. (1) reclassify the purchase to Estorno (EXPENSE); (2) advance every
  -- not-yet-billed installment (competence > the invoice open at refundDate) to that
  -- competence; (3) insert card_refunds at the full purchase amount (never client-supplied).
  -- UNIQUE (card_purchase_id) blocks a double refund.
getCardSummary(creditCardId, viewedMonth, creditLimit) → CardSummaryDTO
  -- usedThroughCurrentMonth/overdueAmount are ALWAYS anchored to today's real month (drive
  -- "Pagar fatura"), even while the page browses another month. currentMonthInvoice follows
  -- viewedMonth, gross (does NOT exclude paid_before_system). currentMonthPaidAmount = how
  -- much of currentMonthInvoice is covered — derived (card_payments has no month column),
  -- oldest-competence-first allocation of (Σ payments + Σ card_refunds through the viewed
  -- month). creditBalance (>= 0) = (Σ payments + Σ refunds) − Σ installments
  -- !paid_before_system, floored at 0. totalCommitted = getCardTotalCommitted.
  -- openInvoiceMonth/openInvoiceAmount = the competence a purchase made TODAY would fall in,
  -- always anchored to today.
registerCardPayment(data)
  -- creates the CREDIT_CARD_PAYMENT transaction + the linked card_payments row. description
  -- default "Pagamento da fatura do cartão {nome}". Tags the transaction with the is_system
  -- EXPENSE category "Pagamento de Cartão" (getCardPaymentCategoryId) — automatic, label
  -- only.
getDefaultCardsMonth() → string
  -- month /cards opens on with no ?month=. Next month when getCardBalanceThroughMonth(card,
  -- todayMonth) === 0 for EVERY card AND next month has installments; else today's month.
getPurchaseFutureInstallments(purchaseId) → { id, competence, amount }[]
advancePurchaseInstallments(purchaseId, count)
  -- "Antecipar parcelas". The `count` nearest not-yet-billed installments → the open-invoice
  -- competence; the rest renumbered contiguously right after, shortening the plan by `count`
  -- months. NEVER creates a payment/transaction — pure UPDATE card_installments.competence.
getCardMonthlyEvolution(cardIds, referenceMonth, categoryIds?) → CardMonthlyEvolutionDTO[]
  -- 6 months before + 6 after referenceMonth (13), card_installments.amount by competence.
  -- total = historical billed total (does NOT exclude paid_before_system). paid/unpaid split
  -- that total (oldest-first allocation, same as currentMonthPaidAmount) — only != 0 when
  -- categoryIds is NOT passed. byCategory[] breaks the total down per category — used to
  -- stack bars when a category filter is active.
```

## reservoirs.service.ts
```
-- UI label "Receita Programada"; route/table/service/DTO names stay reservoir*.
createReservoir(data) / updateReservoir(data)   -- data may include defaultPercentage/defaultDestinationAccountId
addReservoirTransaction(data)   -- accrual (positive). description default "Movimentação da receita programada {nome}".
updateReservoirTransaction(data)   -- edits an accrual entry; blocks if it's a withdrawal
withdrawReservoir(data)   -- withdrawal (negative), creates the linked transaction
getReservoirs() → ReservoirDTO[] / getReservoirTransactions(reservoirId) → ReservoirTransactionDTO[]
deleteReservoirTransaction(id)   -- deletes the ledger row; if a withdrawal, deletes the linked transactions/card_purchases too
deleteReservoir(id)   -- HARD delete; reservoir_transactions cascade; a withdrawal's linked real row is untouched
```

## goals.service.ts (feature "Metas", migrations 0034-0037)
```
-- currentBalance = Σ RESERVE − Σ REDEEM + Σ goal_yields, always computed. Aporte/resgate =
-- transactions RESERVE/REDEEM (CASH/BANK only, checked server-side; move account balances,
-- never INCOME/EXPENSE). Yield = goal_yields (synthetic INCOME under "Rendimentos").
createGoal(data) → id
  -- data.endDate without monthlyContribution → contribution = (target − initialReserve) /
  -- months. data.initialReserve{AccountId,Amount} → a first RESERVE dated at start_competence.
updateGoal(id, data)   -- partial. rebase:true (or any endDate change) → anchor_date = today
  -- and, without an explicit monthlyContribution, rewrite it from the current balance. The
  -- LEDGER IS NEVER TOUCHED.
deleteGoal(id)   -- hard delete. goal_yields cascade; RESERVE/REDEEM survive with goal_id NULL.
addReserve(data)   -- RESERVE, origin = account, description default "Aporte para meta {nome}"
redeemGoal(data)   -- one REDEEM at the FULL amount withdrawn (destination = account, category
  -- = "Resgate de Meta Concluída"/"Antecipado" — auto by balance vs. target, overridable by a
  -- toggle). amount > book balance → the excess becomes a goal_yields dated on the day,
  -- origin_redeem_transaction_id = the REDEEM.
registerGoalYield(data)   -- "Informar rendimento": delta between realBalance and the computed
  -- balance → goal_yields (origin_redeem_transaction_id NULL). Positive delta only in v1.
updateGoalEntry(data)   -- edit a RESERVE/REDEEM (value/date/account/description), propagate to
  -- transactions. Direction never flips. Does not recompute a recognized goal_yields.
updateGoalYield(data) / deleteGoalYield(id)   -- deleteGoalYield only an INFORMED yield
deleteGoalEntry(id)   -- hard delete of a RESERVE/REDEEM (spurious entry). For a typo, edit.
getGoals() → GoalDTO[]   -- currentBalance + schedule (scheduleFor). 2 queries total.
getGoalEntries(goalId) → GoalEntryDTO[]   -- RESERVE/REDEEM (+ account name) + goal_yields, merged, date desc
getReservedTotal() → number   -- Σ balance of every live goal. Feeds FinancialSummaryDTO.reservedTotal (global).
getGoalsOverview() → GoalsOverviewDTO   -- compact per-goal figures for the dashboard block
getGoalAccumulation() → GoalAccumulationDTO   -- cumulative total saved at the end of each of the last 13 months + Σ targets
```

## debts.service.ts
```
createDebt(data)   -- data.kind (PERSONAL default | OVERDUE_BILL | INSTALLMENT_PLAN).
  -- monthlyAmount/dueDay/startCompetence required in zod only for INSTALLMENT_PLAN.
  -- data.defaultCategoryId (EXPENSE for PAYABLE, INCOME for RECEIVABLE).
updateDebt(id, data)   -- partial: agent/side/kind/initialBalance/defaultCategoryId/
  -- monthlyAmount/dueDay/startCompetence.
addDebtTransaction(data) → { settled: boolean }
  -- amount positive = increase, negative = payment; linked_transaction_id optional. Blank
  -- description → "Movimentação da dívida {agent}". Recomputes the real balance post-insert;
  -- <= 0 → deactivateDebt (soft delete). data.categoryId → the linked transaction's
  -- category_id; if omitted AND it's a payment, falls back to debts.default_category_id (an
  -- increase never inherits the default).
updateDebtTransaction(data) → { settled }   -- edits the ledger row, propagating
  -- amount/date/description/categoryId to the linked transaction. Rejects a Math.sign flip.
  -- Recomputes + reapplies the settle-to-zero auto-deactivation.
deleteDebtTransaction(id)   -- deletes the ledger row + the linked transaction
getDebts() → DebtDTO[]   -- active only. INSTALLMENT_PLAN: paidThroughCompetence = start_competence
  -- + (floor(totalPaid / monthlyAmount, cents) − 1) months (oldest-first allocation);
  -- scheduleOffset = covered − expected (expected = months from start_competence to today,
  -- capped at the plan's total installment count). paidThisMonth still computed, no UI uses it.
getDebtTransactions(debtId) → DebtTransactionDTO[]
deactivateDebt(id)   -- soft delete; called automatically on settle-to-zero and manually by "Excluir dívida"
```

## budgets.service.ts
```
createBudget(data) → { id, notices[] }   -- data includes month (immutable after creation)
updateBudget(id, data) → { notices[] }
  -- both apply the hierarchy floor before saving: amount < floor (Σ subcategory budgets + Σ
  -- direct fixed expenses, same month) → throws (HARD BLOCK). After saving a SUBcategory
  -- budget, calls deactivateCategoryBudgetIfOverCommitted (never reconcileBudgetFloors — a
  -- subcategory must never create/raise the category, only invalidate an insufficient row).
deactivateBudget(id)   -- soft delete; blocks if the row is the floor of an active fixed expense
getBudgets(month) → BudgetDTO[]
getBudgetTree(month, fixedExpenses) → BudgetTreeCategoryDTO[]
  -- grouped/tree read for /budgets and the dashboard panel. Each category's `budget` is the
  -- real row or null, never an implicit sum.
getBudgetMonthWindow() → BudgetMonthWindowDTO
  -- currentMonth/nextMonth/hasCurrentMonthBudget/lastRegisteredMonth (MAX(month) over active budgets)
cloneBudgetMonth(fromMonth, toMonth) → { count }   -- copies every active row verbatim, no floor re-validation
getBudgetFloor(categoryId, subcategoryId, month) → number
  -- thin wrapper over getCategoryBudgetFloor/getSubcategoryBudgetFloor, exposed via
  -- getBudgetFloorAction so the client shows/applies the floor on the value input.
```

## fixed-expenses.service.ts
```
createFixedExpense(data) → { id, notices[] }   -- also writes the first fixed_expense_amount_history
  -- row (effective_from = '1970-01-01')
updateFixedExpense(id, data) → { notices[] }
  -- never blocks; calls reconcileFixedExpenseFloors after saving (current month always + next
  -- month if a budget exists AT THAT SAME LEVEL). A category-level fixed expense creates/raises
  -- the category budget; a subcategory-level one only creates/raises the subcategory row, then
  -- deactivateCategoryBudgetIfOverCommitted may erase (never inflate) an existing category row.
  -- Changing `amount` upserts a fixed_expense_amount_history row at effective_from = the
  -- current real month — never rewrites a past month. fixed_expenses.amount stays as a cache
  -- of the latest value.
deleteFixedExpense(id)   -- HARD DELETE (ex-deactivateFixedExpense) — fixed_expenses has no
  -- `active` column. ON DELETE SET NULL on the linked transaction/purchase clears the link
  -- without touching the real record.
getFixedExpenses(month) → FixedExpenseDTO[]
  -- actualAmount = Σ transactions.fixed_expense_id (by date) + Σ card_installments of linked
  -- card_purchases (by competence). plannedAmount resolves from fixed_expense_amount_history
  -- for the requested month. Only returns a row whose start_competence <= month <=
  -- (end_competence or infinity).
getUnlinkedExpenseCandidates(categoryId) → { id, date, description, amount }[]
  -- EXPENSE rows with fixed_expense_id IS NULL, filtered by the fixed expense's category
linkExistingTransaction(fixedExpenseId, transactionId)   -- only UPDATE transactions SET fixed_expense_id
payFixedExpense(data)   -- branches on the DB-read account type: CASH/BANK → EXPENSE
  -- transaction (fixedExpenseId); CREDIT_CARD → 1x card_purchases (fixedExpenseId,
  -- installments: 1), competence derived normally. description default "Pagamento — {nome}".
cancelFixedExpensePayment(fixedExpenseId, month)   -- deletes the record(s) that make
  -- getFixedExpenses() compute isPaidThisMonth = true for that ONE month (linked transactions
  -- in the month's range, and/or linked card_purchases whose installments have competence in
  -- the month). The inverse of whichever branch payFixedExpense took.
```

## recurring-incomes.service.ts (migration 0038)
```
-- Receitas Recorrentes (UI label "Receita Recorrente" — NOT "Receita Programada", which is the
-- reservoirs feature) — the mirror of fixed-expenses for predictable income (salary, allowance).
-- Deliberately isolated: NEVER feeds dashboard.service's fetchPeriodEntries, NEVER a budget floor
-- (_shared.ts), NEVER a synthetic entry. Only the real INCOME transactions registerReceipt
-- creates (linked via transactions.recurring_income_id) ever move a number. See AI_CONTEXT.md
-- "Receitas Recorrentes".
getRecurringIncomes(month) → RecurringIncomeDTO[]
  -- competence-window filtered (start_competence <= month <= end_competence or ∞), same rule as
  -- getFixedExpenses. receivedThisMonth/receivedAmount/receivedDate derived from linked INCOME
  -- transactions dated in the month (never a stored flag).
createRecurringIncome(data) → id / updateRecurringIncome(id, data)
  -- category must be INCOME-typed (asserted server-side, like categories.service#createSubcategory).
deactivateRecurringIncome(id)   -- soft delete (active = false), like reservoirs/budgets
registerReceipt(data)   -- creates a plain INCOME transaction linked via recurring_income_id.
  -- Account type read server-side, must be CASH/BANK (never "onto a card"). description default
  -- "Recebimento — {nome}"; categoryId falls back to the template's category_id.
cancelReceipt(recurringIncomeId, month)   -- deletes the linked INCOME transaction(s) dated in
  -- the month. Mirror of cancelFixedExpensePayment.
```

## _shared.ts
```
getActualAmountForCategory(...)   -- reused by budgets and fixed-expenses for the month's actualAmount
getCategoryBudgetFloor(supabase, userId, categoryId, month) → number
  -- Σ active subcategory budgets of the category for `month` + Σ active fixed expenses
  -- directly on the category, within their start/end competence window for `month`.
getSubcategoryBudgetFloor(supabase, userId, subcategoryId, month) → number
  -- Σ active fixed expenses on that subcategory, within their window for `month`. (Gained the
  -- `month` parameter with migration 0026.)
reconcileBudgetFloors(supabase, userId, categoryId, subcategoryId, month) → string[]
  -- auto-raise/create for one month, only called from reconcileFixedExpenseFloors. With
  -- subcategoryId set, only creates/raises the SUBcategory, then calls
  -- deactivateCategoryBudgetIfOverCommitted. With subcategoryId null, creates/raises the
  -- category from getCategoryBudgetFloor.
reconcileFixedExpenseFloors(supabase, userId, categoryId, subcategoryId) → string[]
  -- decides the months (current always + next if a budget exists at the same level) and calls
  -- reconcileBudgetFloors per month.
deactivateCategoryBudgetIfOverCommitted(supabase, userId, categoryId, month) → string | null
  -- called after creating/editing a SUBcategory budget or raising a subcategory via a fixed
  -- expense — never creates or raises the category, only deactivates the category's active row
  -- (for `month`) if it isn't LARGER than the Σ of its subcategories (an exact fill also
  -- deactivates). Never deactivates a category with direct fixed expenses.
```

---

# DTO Definitions

Source of truth is `src/types/dto.ts` — this mirrors it. If they drift, the code wins.

```typescript
type FinancialSummaryDTO = {
  balance: number; income: number
  expense: number    // includes the viewed month's UNPAID projected obligations (a documented
                     //   break from "Money Reality Rules")
  result: number     // income − expense, so it projects too
  adjustmentAmount: number         // R$ under "Ajuste" in the period — a "warning" badge next to Balanço Mensal
  retroactiveIncomeAmount: number  // R$ from paid_before_system installments in the period — no UI consumer
  refundAmount: number             // R$ through "Estorno" in the period (both directions) — no UI consumer
  reservedTotal: number            // Σ current balance of every Meta — "guardado em metas" sub-line on the Saldo card (global)
}

type MonthlyEvolutionDTO = { month: string; income: number; expense: number; reserved: number }
// the viewed month's `expense` also includes that month's unpaid projected obligations; the
// other 14 months are actuals-only. `reserved` = net Σ RESERVE − Σ REDEEM dated in that month
// (a monthly flow, not cumulative).

type MonthObligationItemDTO = {
  id: string            // account-card / fixed-expense / debt id — matches the source object for the payment dialog
  kind: "CARD" | "FIXED_EXPENSE" | "DEBT"
  description: string   // "Fatura {cartão}" / fixed-expense name / debt agent
  amount: number
  dueDay?: number       // absent for OVERDUE_BILL → fixed "Atrasada" badge
}
type MonthObligationsDTO = {
  month: string          // the viewed month "YYYY-MM"
  items: MonthObligationItemDTO[]  // unpaid only, descending by amount (the donut's order)
  paidTotal: number      // Σ transactions EXPENSE dated in the month + Σ currentMonthPaidAmount per card
  remainingTotal: number // Σ items[].amount
  total: number          // paidTotal + remainingTotal — big in the donut's center
}

type CategoryDistributionDTO = { categoryId: string; categoryName: string; total: number; color: string; icon: string | null }

type TransactionViewDTO = {
  id: string; date: string; description: string; type: TransactionType
  categoryId: string | null; category: string
  subcategoryId: string | null; subcategory: string
  accountId: string | null; account: string
  accountType: AccountType | null   // drives the account-type icon
  amount: number
  source: "transaction" | "installment"   // "installment" rows come from card_purchases —
                     //   amount/date/count edit + delete stay Cards-page-only; category can be
                     //   inline-edited from either place via purchaseId
  purchaseId?: string          // set only for source === "installment" — the id inline edits must target
  paidBeforeSystem?: boolean   // set only for source === "installment"
  originAccountId?: string | null       // set only for source === "transaction" — the full-edit dialog needs both sides (e.g. a TRANSFER)
  destinationAccountId?: string | null  // set only for source === "transaction"
}

type ReservoirDTO = {
  id: string; name: string; balance: number   // SUM(reservoir_transactions.amount)
  categoryId: string | null; categoryName: string | null
  defaultPercentage?: number; defaultDestinationAccountId?: string
}
type ReservoirTransactionDTO = {
  id: string; reservoirId: string; date: string; description: string | null
  amount: number           // positive = accrual, negative = withdrawal
  grossAmount?: number      // accrual only; always user-entered, never recalculated
  percentage?: number       // accrual only, 0-100; reactive pair with `amount` given grossAmount
  linkedTransactionId?: string; linkedCardPurchaseId?: string
}

type GoalStatus = "REACHED" | "AHEAD" | "ON_TRACK" | "BEHIND" | "NO_SCHEDULE"
type GoalDTO = {
  id: string; name: string; goalTarget: number
  currentBalance: number; contributedTotal: number; withdrawnTotal: number; yieldTotal: number
  progressPercent: number              // min(100, currentBalance / goalTarget * 100)
  startCompetence: string              // "YYYY-MM"
  anchorDate: string                   // "YYYY-MM-DD" — start of the current schedule leg
  endDate?: string                     // "YYYY-MM"
  monthlyContribution?: number         // absent ⇒ NO_SCHEDULE (progress tracker only)
  status: GoalStatus
  scheduleOffsetMonths?: number        // signed: > 0 ahead, < 0 behind; only with monthlyContribution and status != REACHED
  expectedByNow?: number
  projectedCompletionMonth?: string    // "YYYY-MM"
}
type GoalEntryDTO = {
  id: string; kind: "RESERVE" | "REDEEM" | "YIELD"
  date: string; description: string | null
  amount: number                       // always positive — `kind` carries the direction
  accountId?: string; accountName?: string   // RESERVE/REDEEM
  withdrawalReason?: "COMPLETED" | "EARLY"    // REDEEM — from the linked system category
}
type GoalsOverviewDTO = { goals: { id; name; goalTarget; currentBalance; progressPercent; status: GoalStatus; scheduleOffsetMonths? }[] }
type GoalAccumulationDTO = { points: { month: string; total: number }[]; targetTotal: number }   // 13 months, cumulative

type DebtDTO = {
  id: string; side: "PAYABLE" | "RECEIVABLE"; agent: string
  kind: "PERSONAL" | "OVERDUE_BILL" | "INSTALLMENT_PLAN"   // PERSONAL never affects the dashboard; the other two project
  originalAmount: number
  remainingBalance: number   // NEVER a column — initial_balance + SUM(debt_transactions.amount)
  active: boolean
  defaultCategoryId?: string
  monthlyAmount?: number         // INSTALLMENT_PLAN only
  dueDay?: number                // INSTALLMENT_PLAN only (1-28)
  startCompetence?: string       // INSTALLMENT_PLAN only, "YYYY-MM"
  paidThroughCompetence?: string // INSTALLMENT_PLAN only, "YYYY-MM" — last competence covered (oldest-first); absent when nothing paid
  scheduleOffset?: number        // INSTALLMENT_PLAN only, signed months: > 0 ahead, < 0 behind, 0 on track
  paidThisMonth?: boolean        // INSTALLMENT_PLAN only — still computed, no UI consumer
}
type DebtTransactionDTO = {
  id: string; debtId: string; date: string; description: string | null
  amount: number   // positive = increase, negative = payment
  linkedTransactionId?: string
  categoryId?: string   // set only when linkedTransactionId is — the linked transaction's own category, for prefilling the edit
}

type CardPurchaseDTO = {
  id: string; creditCardId: string; description: string; totalAmount: number
  installmentsCount: number; purchaseDate: string
  firstCompetenceMonth: string   // "YYYY-MM" — real competence of the 1st installment
  categoryId: string | null; categoryName: string | null
  subcategoryId: string | null; subcategoryName: string | null
  paidThroughCompetence?: string // "YYYY-MM" — retroactive purchase
  refundedAt?: string            // set when a card_refunds row exists (full refund only)
  remainingUnbilledAmount: number       // Σ this purchase's not-yet-billed installments, 0 when none
  remainingInstallmentsCount: number    // the max for "Antecipar parcelas"
}
type CardMonthlyEvolutionDTO = {
  month: string; total: number   // historical billed total (does NOT exclude paid_before_system)
  paid: number; unpaid: number   // split `total` (oldest-first allocation) — only != 0 with no category filter
  byCategory: { categoryId: string; categoryName: string; color: string; amount: number }[]
}
type CardInstallmentDTO = {
  id: string; purchaseId: string
  installmentNumber: number    // derived — ordered by competence over ALL the purchase's installments (unfiltered), never a column
  totalInstallments: number    // = card_purchases.installments
  amount: number; competenceMonth: string; description: string
  purchaseDate: string         // real purchase date (not the competence)
  paidBeforeSystem: boolean
}
type CardSummaryDTO = {
  accountId: string; creditLimit: number | null
  usedThroughCurrentMonth: number  // = getCardBalanceThroughMonth(cardId, todayMonth) — anchored to today; drives "Pagar fatura"
  currentMonthInvoice: number      // Σ card_installments.amount in the VIEWED month (follows the page filter); gross
  currentMonthPaidAmount: number   // how much of currentMonthInvoice is covered — derived, oldest-competence-first,
                                   //   includes card_refunds through the viewed month. 0 <= this <= currentMonthInvoice
  overdueAmount: number            // = usedThroughCurrentMonth − (today's month invoice), floored at 0; anchored to today
  totalCommitted: number           // = getCardTotalCommitted — the against-the-limit figure
  creditBalance: number            // >= 0 — "saldo a favor" from a refund/overpayment; never withdrawable
  openInvoiceMonth: string         // "YYYY-MM" — competence a purchase made TODAY would fall in; anchored to today
  openInvoiceAmount: number        // Σ card_installments.amount for openInvoiceMonth; gross
}

type BudgetDTO = {
  id: string; categoryId: string; categoryName: string; subcategoryId?: string; subcategoryName?: string
  plannedAmount: number   // budgets.amount
  actualAmount: number    // real month sum (transactions + card_installments) for that category/subcategory
  status: "OK" | "EXCEEDED"
}
type FixedExpenseDTO = {
  id: string; name: string; categoryId: string; categoryName: string
  subcategoryId?: string; subcategoryName?: string
  plannedAmount: number; dueDay: number; defaultAccountId?: string
  startCompetence: string       // "YYYY-MM", required
  endCompetence?: string        // "YYYY-MM", optional; absent = still active
  actualAmount: number          // Σ linked transactions (by date) + Σ linked card_installments (by competence)
  projectedAmount: number       // dashboard: actualAmount > 0 ? actualAmount : plannedAmount
  isPaidThisMonth: boolean      // actualAmount > 0
  paidDate?: string             // set only when isPaidThisMonth — for the "já pago" summary text
  status: "OK" | "EXCEEDED"
}
type RecurringIncomeDTO = {     // migration 0038 — mirror of FixedExpenseDTO for predictable income; NEVER projected into analytics
  id: string; name: string
  plannedAmount: number; dayOfMonth: number   // dayOfMonth 1-28
  defaultAccountId?: string; categoryId?: string; categoryName?: string
  startCompetence: string       // "YYYY-MM", required
  endCompetence?: string        // "YYYY-MM", optional; absent = still active
  receivedThisMonth: boolean    // a linked INCOME transaction is dated in the queried month
  receivedAmount: number        // Σ linked transactions in the month (0 when not received)
  receivedDate?: string         // set only when receivedThisMonth — for the "já recebi" summary text
}
type BudgetTreeSubcategoryDTO = {
  budgetId: string; subcategoryId: string; subcategoryName: string
  plannedAmount: number; actualAmount: number; status: "OK" | "EXCEEDED"
  fixedExpenses: FixedExpenseDTO[]
}
type BudgetTreeCategoryDTO = {
  categoryId: string; categoryName: string; icon: string | null
  budget: { id: string; plannedAmount: number; actualAmount: number; status: "OK" | "EXCEEDED" } | null   // null = no active category row (never a computed sum)
  subcategories: BudgetTreeSubcategoryDTO[]
  directFixedExpenses: FixedExpenseDTO[]   // implies budget !== null, by construction
}
type BudgetMonthWindowDTO = {
  currentMonth: string; nextMonth: string
  hasCurrentMonthBudget: boolean; lastRegisteredMonth: string | null
}

type AccountDTO = {
  id: string; type: AccountType; name: string; color: string | null; active: boolean
  institutionId: string | null; institutionName: string | null; institutionColor: string | null
  balance: number
  initialBalance?: number     // CASH, BANK
  overdraftLimit?: number     // BANK
  closingDay?: number; dueDay?: number   // CREDIT_CARD
  creditLimit?: number | null            // CREDIT_CARD — required and > 0; null only on non-CREDIT_CARD
}
type FinancialInstitutionDTO = { id: string; name: string; color: string | null }
type ProfileDTO = { name: string | null; email: string | null; phone: string | null; onboardingCompleted: boolean }
type CategoryDTO = {
  id: string; name: string; type: CategoryType; color: string; icon: string | null
  isSystem: boolean; isDefault: boolean; active: boolean
  subcategories: SubcategoryDTO[]
}
type SubcategoryDTO = { id: string; categoryId: string; name: string; active: boolean }
type CategoryUsageDTO = {
  count: number; preview: TransactionViewDTO[]
  budgetsCount: number; fixedExpensesCount: number; reservoirsCount: number; debtsCount: number
}
type CategoryImportOptionDTO = {
  id: string; name: string; type: CategoryType; color: string; icon: string | null
  alreadyImported: boolean
  userCategoryId: string | null   // set when alreadyImported — the user's existing copy
  subcategories: { id: string; name: string; alreadyImported: boolean }[]
}
```

---

# MER

See `mer-controle-financeiro.mermaid` (full diagram) and `schema.sql` (executable schema with
RLS). Central relations:

- `accounts` is a base table with 1:1 subtype extensions (`cash_accounts`, `bank_accounts`,
  `credit_cards`) — table-per-type inheritance.
- `transactions` covers all six types (`INCOME`, `EXPENSE`, `TRANSFER`, `CREDIT_CARD_PAYMENT`,
  `RESERVE`, `REDEEM`) with one `origin_account_id`/`destination_account_id` pair.
- `card_purchases` → `card_installments` (1:N), competence from `closing_day`/`due_day`.
- `reservoirs` → `reservoir_transactions` (1:N, signed ledger); a withdrawal links to
  `transactions`/`card_purchases`.
- `goals` → `goal_yields` (1:N); `transactions.goal_id` links RESERVE/REDEEM.
- `debts` → `debt_transactions` (1:N, signed ledger); the `transactions` link is optional.
- `budgets` and `fixed_expenses` never generate `transactions` — purely informational.

---

# Performance & UX

Charts use aggregated SQL (`SUM`, `GROUP BY`, indexed filters) — never fetch raw transactions
to compute totals in the frontend. Services minimize data transfer (aggregated SQL, filtered
queries, pagination when needed).

Mobile-first. Desktop: sidebar + header. Mobile: header + bottom navigation. Charts stack
vertically on mobile. Every `(app)` route has a `loading.tsx`; `NavigationProgressProvider`
covers searchParams-only filter changes (which don't trigger Next's `loading.tsx`).

# Future Expansion

Potential modules: investments, advanced analytics, a reports tab (multi-period — the removed
dashboard period presets are meant to move there), Metas phase 2 (compound-interest
projection), OFX import (deferred). The architecture must remain **service-driven, DTO-based,
RLS-isolated per user**.
