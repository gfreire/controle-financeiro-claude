# Financial Control System — AI Context

Domain rules and business logic, so an AI code generator implements system behavior
correctly. Read together with `ARCHITECTURE.md`.

**Scope of this file: current rules, in present tense, plus the load-bearing "why we chose X
over Y".** The dated chronology of how each rule was reached — corrections made mid-design,
resolved bugs, verbose per-migration prose — lives in `DOC/HISTORY.md` (not auto-loaded).
Consult it only when a rule here looks arbitrary and you need the reasoning before changing
it. `schema.sql`/`seed.sql` and `supabase/migrations/` are the source of truth for schema.

---

# System Purpose

Personal financial management for the owner and a closed group of friends, each with **fully
isolated data** (RLS, see `ARCHITECTURE.md` → "Multi-tenant / Access Model"). Not commercial.
Focused on financial analysis and insight, not just record-keeping. All financial entry is
manual.

**Open Finance / bank sync is out of scope, permanently.** A proprietary integration is
legally blocked (only Central-Bank-authorized institutions can be Open Finance participants
in Brazil); a paid aggregator (Pluggy) starts at R$ 2.500/month, unfeasible for a friend
project. OFX file import was considered as a lighter alternative but is deferred indefinitely.

---

# Core Entities

Accounts, Transactions, Credit Cards (Purchases/Installments/Payments), Categories,
Subcategories, Reservoirs, Debts, Goals, Budgets, Fixed Expenses, Financial Institutions.

---

# Accounts

Real money locations. `type`: `CASH`, `BANK`, `CREDIT_CARD`. Each type has a 1:1 extension
table:

- `CASH` → `cash_accounts.initial_balance`
- `BANK` → `bank_accounts.initial_balance`, `bank_accounts.overdraft_limit`
- `CREDIT_CARD` → `credit_cards.closing_day`, `credit_cards.due_day`, `credit_cards.credit_limit`

For CASH/BANK: `balance = initial_balance + SUM(transactions affecting the account)`.

- **`closing_day`/`due_day` are constrained 1-28** (not 1-31), so a card never has to
  special-case February. Enforced in `src/lib/validations/accounts.ts` and mirrored as HTML
  `min`/`max`. These are what let the system compute a purchase's competence month.
- **`credit_limit` is required and must be `> 0` for every `CREDIT_CARD`** (`NOT NULL CHECK`).
  It can be edited but never cleared/zeroed. What is *soft-enforced only*: a purchase that
  would push the outstanding balance past the limit is **not blocked** — the UI shows a
  warning ("you may have forgotten to log the invoice payment, or made a mistake") and
  requires an explicit "insert anyway" acknowledgment. A real unlogged payment and a genuine
  data-entry mistake are both things the user needs to see and decide about, not be locked
  out of.
- **`credit_limit` and `overdraft_limit` are user-editable at any time** via the account's
  quick-action dialog. Banks change these outside the user's control, so locking them to
  creation time drifts from reality. Changing a limit never rewrites past purchases or
  warnings — it only changes the threshold for *future* soft-limit checks.
- **The quick-action dialog is "Editar Conta" (CASH/BANK) / "Editar Cartão" (CREDIT_CARD)**
  (`limit-adjust-dialog.tsx` / `LimitAdjustDialog` — file/component name kept from when it
  was "Ajustar Limite"). It edits: `name` (all types); `institution_id` +
  `credit_limit`/`overdraft_limit` (BANK/CREDIT_CARD); `closing_day`/`due_day` (CREDIT_CARD).
  For `CASH` it collapses to the name field alone. `updateAccount` accepts a partial
  `AccountInput`; `updateAccountAction` runs `updateAccountSchema.parse({ id, ...input })`.
- **`AccountCard` shows a `CREDIT_CARD`'s usage exactly like the Cards page** — the same
  `getCardSummary(cardId, currentMonth, creditLimit)` and `totalCommitted / creditLimit`
  block. The two screens must never show conflicting numbers for the same card.
- **Inconsistency warning** — `account-card.tsx#getInconsistency(account, cardSummary)`
  returns a reason string or `null` for a red icon-only `TriangleAlert` (reason in
  `title`/`aria-label`, no visible text): CASH balance `< 0`; BANK `balance <
  -(overdraftLimit ?? 0)`; `CardSummaryDTO.totalCommitted > creditLimit`. A pure figure
  comparison, not aggregation — runs in the component. No dashboard equivalent.
- **CASH accounts never show the institution selector** — cash in hand isn't tied to a bank.
  `institution_id` stays a valid nullable column at the schema level; the change is UI-only.
- Accounts may reference a `financial_institutions` catalog entry (global, no `user_id`) for
  branding. A plain lookup, not a limiter — a user can have any number of accounts/cards,
  several pointing at the same institution. `financial_institutions` carries only `color` (no
  `icon` — no emoji meaningfully distinguishes banks, and real logos raise IP concerns).
  `categories` carries `color` + `icon` (emoji). All presentational — no logic depends on
  them.

---

# Transactions

Types: `INCOME`, `EXPENSE`, `TRANSFER`, `CREDIT_CARD_PAYMENT`, `RESERVE`, `REDEEM`.

One table, `origin_account_id` + `destination_account_id`:

- `INCOME`: destination only.
- `EXPENSE`: origin only.
- `TRANSFER`: both — moving money between the user's own accounts. **Never in analytics.**
- `CREDIT_CARD_PAYMENT`: origin = paying account, destination = credit card account.
- `RESERVE` / `REDEEM`: Meta aporte/resgate (see "Metas"). Move CASH/BANK balances like
  `TRANSFER`, never counted as INCOME/EXPENSE.

**Dashboard analytics only ever read from `transactions` (`type in ('INCOME','EXPENSE')`) and
`card_installments`.**

**`CREDIT_CARD_PAYMENT` has exactly one entry point**: the Cards page's "Pagar fatura"
(`cards.service.ts#registerCardPayment`), which creates the `transactions` row and the linked
`card_payments` metadata row together. The manual transaction form only offers
`EXPENSE`/`INCOME`/`TRANSFER`. "Pagar fatura" suggests the statement balance due through
today's real month (`getCardBalanceThroughMonth`), not the lifetime balance.

`registerCardPayment` defaults the description to `"Pagamento da fatura do cartão {nome}"` and
tags the transaction with the `is_system` `EXPENSE` category `Pagamento de Cartão` (migration
`0031`) — automatically, a label only, changes nothing in analytics.

---

# Credit Card Purchases / Installments / Payments

A `card_purchases` row generates N `card_installments`, one per installment, each with its
own **competence date** computed from `purchase_date` + the card's `closing_day`/`due_day` —
**never the raw purchase date**.

**Central rule: analytics always use installment competence date, never purchase date.**
Example: purchase Feb 28, 3 installments → competence Mar/Apr/May, never counted in February.

**Competence month formula** (`calculateInstallmentCompetences`, `src/lib/utils/date.ts`),
two steps:
1. Which billing cycle the purchase falls into — made after `closing_day` rolls into the
   cycle closing the *following* month (`pushedToNextMonth`).
2. Which calendar month that cycle's invoice is due in —
   `dueMonthOffset = dueDay <= closingDay ? 1 : 0`. (A `due_day <= closing_day` card, e.g.
   closes-28th/due-10th, has its due date in the *next* month.)

The purchase form defaults the first installment's competence month to this calculation but
it's directly overridable via a month picker (the user may not remember the exact closing
date). `initialCompetenceMonth(purchaseDate, card)` seeds the field on open and after a
create. The override replaces the anchor month only; "add one month per subsequent
installment" and rounding still apply
(`calculateInstallmentCompetencesFromAnchorMonth`).

- `card_purchases` is **metadata only**, never a direct analytics source.
- **Editing a purchase rolls back and re-registers**: every installment is deleted and
  regenerated from the new values, never patched installment-by-installment (this keeps the
  rounding rule correct after an edit). Deleting a purchase cascades its installments.
- **`installment_number`/`total_installments` are not stored columns** — derive by ordering
  the purchase's installments by `competence` (total count is `card_purchases.installments`).
  Number first over **all** the purchase's installments, filter for display second — filtering
  then numbering mislabels a purchase's 3rd installment as "1/N" when its 1st/2nd fall
  outside the window.
- **Rounding**: any remainder from dividing the total goes to the **first** installment
  (100 ÷ 3 = 33.34 / 33.33 / 33.33).
- Paying the bill (`card_payments`) creates a `transactions` row (`CREDIT_CARD_PAYMENT`) + a
  `card_payments` metadata row linked via `transaction_id`.

## Two "how much is used" figures — never conflate them

- **Against the credit limit** — `CardSummaryDTO.totalCommitted` (`getCardTotalCommitted`):
  every installment ever generated (past, current, **and future not-yet-due**) with
  `paid_before_system = false`, minus every payment **and every `card_refunds`** ever made,
  floored at 0. A real issuer counts an installment plan against the limit the moment it's
  committed.
- **What to pay right now** — `CardSummaryDTO.usedThroughCurrentMonth`
  (`getCardBalanceThroughMonth`): installments with competence through **today's real month**
  and `paid_before_system = false`, minus payments and refunds through that month, floored at
  0. Excludes future not-yet-due installments on purpose. This drives "Pagar fatura" and
  stays anchored to today even while the page browses another month.
- `currentMonthInvoice` — a third figure: sum of installments whose competence falls in the
  **viewed** month (follows the `MonthNav` filter). Gross — does **not** exclude
  `paid_before_system` installments (it's the historical billed fact).

## Compras retroativas (backfill of installments already paid before the system)

Lets a user register a whole installment purchase from before they started using the system
(real total, real date, real count) and mark up to which month it was already paid outside
the system.

- `card_purchases.paid_through_competence` (user input, a month) → `card_installments.paid_before_system`
  (derived per installment in `createCardPurchase`/`updateCardPurchase`): every installment
  with `competence <= paid_through_competence` is flagged `true`. Always a **contiguous
  prefix** from installment 1 — no per-installment UI toggle.
- The flag **excludes** the installment from the card's outstanding/committed balance
  (`getCardBalanceThroughMonth`/`getCardTotalCommitted` and thus
  `usedThroughCurrentMonth`/`totalCommitted`) — settled, just not through a tracked payment.
  `currentMonthInvoice` does **not** exclude it.
- The flag changes **nothing** in expense-by-category analytics — the installment counts as a
  normal EXPENSE of its category/competence month.
- The flag amount **counts as synthetic INCOME**, grouped under the `is_system` INCOME
  category **"Compras retroativas"** (migration `0030`, one row — the EXPENSE side already
  has the purchase's real spending category). `fetchPeriodEntries` emits these installments
  as `INCOME` entries. It feeds `getFinancialSummary`, `getMonthlyEvolution`, **and the
  income-by-category donut** (so those reconcile). Never a real `transactions` row.
  - **Filter semantics**: the dashboard category filter matches the "Compras retroativas"
    system-category id, **not** the purchase's spending category. A subcategory or
    `uncategorizedOnly` filter excludes it entirely (same as `card_refunds`).
  - **Not in the Explorador de Lançamentos** — no synthetic row. The installment already
    appears there as an EXPENSE row with a "paga antes do sistema" badge. Clicking the
    "Compras retroativas" income slice filters the Explorer to empty (same as "Estorno").
- `FinancialSummaryDTO.retroactiveIncomeAmount` — the period's R$ total under that category.
  A distinct signal from `Ajuste` (which is about bookkeeping looseness) — this is about a
  purchase genuinely predating the system. Currently no UI consumer.
- `paid_through_competence` cannot be a future month (validated client + service).
- Editing follows the same rollback-and-re-register rule — the flag is recomputed from
  scratch for every generated installment.

## Fatura — paid / partial indicator

`card_payments` has no month/competence column, so "how much of THIS month's invoice is
paid" is derived: `CardSummaryDTO.currentMonthPaidAmount`, assuming a payment always settles
the **oldest open competence first** (the same assumption `getCardBalanceThroughMonth` /
`overdueAmount` already make). Concretely: a `paid_before_system` installment of the viewed
month counts paid outright; the rest is covered by whatever's left of all-time
`card_payments` **+ `card_refunds` credited through the end of the viewed month** after
settling every non-`paid_before_system` installment strictly before the viewed month.

This is a heuristic, not a real allocation — a payment made today to prepay a future invoice
still shows as clearing the oldest month first. Accepted: the common case ("fatura de 650,
paguei 600, faltam 50" — partial payment of the most recent open invoice) is covered
correctly.

`src/components/ui/invoice-paid-badge.tsx` (shared by `/cards` and `AccountCard`): nothing
when `currentMonthPaidAmount === 0`; green "Paga" when `>= currentMonthInvoice`; yellow
"`{pago}` pago · faltam `{resto}`" when partial.

## Fatura aberta vs. fatura do mês visualizado

Once `closing_day` has passed within the viewed month, "the invoice being displayed"
(closed, awaiting payment) and "the invoice still open" (accumulating new charges now) are
different — the open one may already be next month's competence.

`CardSummaryDTO.openInvoiceMonth`/`openInvoiceAmount` — the competence a purchase made
**today** would fall in (`calculateInstallmentCompetences(todayIso(), …)`), always anchored
to today. `openInvoiceAmount` is gross (same convention as `currentMonthInvoice`).

`/cards` and `AccountCard` render a second "Fatura aberta ({mês}): {valor}" line **only when
`openInvoiceMonth` differs** from the month on the first line.

## Mês inicial de `/cards`

`cards.service.ts#getDefaultCardsMonth()` decides the month `/cards` opens on when there's no
`?month=` in the URL:

- **next month** when (a) `getCardBalanceThroughMonth(card, todayMonth) === 0` for **every**
  card (nothing to pay now — that figure is already net of payments and refunds and includes
  prior-month overdue) **and** (b) next month has `card_installments`.
- **today's month** otherwise.

Only the default — any explicit navigation (`MonthNav` arrows, "Hoje", month picker) writes
`?month=` and takes over. `MonthNav` receives the server-resolved month as a prop and falls
back to it. Based on `getCardBalanceThroughMonth`, not `currentMonthInvoice`/
`currentMonthPaidAmount` — that pair doesn't discount refunds.

## Antecipar parcelas

`cards.service.ts#advancePurchaseInstallments(purchaseId, count)` — from a purchase's
not-yet-billed installments (`getPurchaseFutureInstallments`, ordered by `competence`,
excluding `paid_before_system`), the user picks **how many** (`count`, not necessarily all):
1. The `count` nearest go to the open-invoice competence (anchored to today).
2. The rest are renumbered contiguously right after — open-invoice month +1, +2, … — with no
   gap, shortening the whole plan by `count` months.

**Never creates `transactions`/`card_payments`** — pure `UPDATE card_installments SET
competence`. Same as `refundCardPurchase` does, but partial and user-chosen. To actually pay
the now-current installments, the user still uses "Pagar fatura" afterward. Doesn't change
`totalCommitted` (sums by competence regardless). Button (⏩) appears per purchase when
`remainingInstallmentsCount > 0` and the purchase isn't refunded; the "how many" field
accepts 1..`remainingInstallmentsCount`.

## Cards page empty state

`/cards` with zero cards → "Criar cartão de crédito" navigates to
`/accounts?newAccountType=CREDIT_CARD`; `AccountsPage` passes `initialOpen`/`initialType`
into `AccountFormDialog` so the dialog opens pre-set to `CREDIT_CARD`.

---

# Categories and Subcategories

Categories = broad areas (Food, Housing, Transport). Subcategories = detail (Groceries,
Restaurants).

**Income categories never have subcategories** — detail goes in the transaction's
`description`. Enforced in `src/lib/validations` **and** in `categories.service.ts#createSubcategory`
(throws for an `INCOME` parent), not by a DB constraint.

## `is_default` vs `is_system` — two distinct, non-overlapping flags

Both live on rows with `user_id IS NULL`; they never overlap.

- **`is_default = true`**: the onboarding starter pack (Moradia, Alimentação, Transporte,
  Salário, Investimentos, …). At signup the user picks which apply; the system **copies** the
  selected rows into their own `user_id`. Never queried directly after that — they exist only
  to be copied.
- **`is_system = true`**: a small permanent global catalog — **never copied, never editable,
  available to every user directly** (`user_id = auth.uid() OR is_system = true`). Currently:
  `Juros` (EXPENSE), `Rendimentos` (INCOME), `Ajuste` (INCOME + EXPENSE), `Estorno` (INCOME
  + EXPENSE, migration `0019`), `Compras retroativas` (INCOME only, `0030`), `Pagamento de
  Cartão` (EXPENSE only, `0031`), `Resgate de Meta Concluída` / `Resgate de Meta Antecipado`
  (INCOME, `0036`).
  - **None is ever selectable from a form.** `CategorySelect` filters `!c.isSystem`;
    `EditableCategoryCell` shows a row already tagged with one as plain text, not a dropdown.
    Each is applied only by its own dedicated flow (`registerYield`,
    `reconcileAccountBalance`, `registerInterest`, `refundCardPurchase`/`refundTransaction`,
    retroactive-purchase computed income, `registerCardPayment`, `redeemGoal`,
    `registerGoalYield`).
  - The dashboard/Cards/Transactions **filter** dropdowns are separate components and
    deliberately still list them.

**No foreign key between an `is_default` copy and its source.** The only "link" is the name,
at copy time. `is_system` rows are never copied — they stay global forever.

Users can create a category/subcategory **inline** from the transaction or card-purchase form
(a small popover: name, curated emoji icon, color) without leaving the screen. The shared
picker is `CategorySelect`/`SubcategorySelect` (`src/features/categories/components/category-select.tsx`),
used by every form that assigns a category, with a "Nova categoria/subcategoria" item at the
end of the same dropdown.

## Name uniqueness

Only the **literal** duplicate name is blocked, and only within the same tree:

- `categories`: unique per `(user_id, type, name)` — a user can't have two `EXPENSE`
  categories named "Mercado", but the same name can exist once per `type` (this is why
  `Ajuste`/`Estorno` need two rows each, not a conflict).
- `subcategories`: unique per `(category_id, name)` — "Outros" can exist under many
  categories, not twice under one.

Semantically similar names side by side are fine (`iFood` + `Delivery` under one category).

## Onboarding

Reusable, not one-shot. `/onboarding` shows a tree picker (category checkbox + nested
subcategory checkboxes — uncheck one subcategory, keep the rest). `profiles.onboarding_completed`
(migration `0004`) gates every `(app)` page until set. Reopened from Settings ("Importar
categorias padrão") to import categories skipped the first time.

- **The re-import picker always shows the FULL `is_default` catalog**, each item annotated
  `alreadyImported` (matched by `(type, name)` — no FK). Already-imported items render
  checked+disabled with a "Já importada" badge (browsers omit disabled checkboxes from
  `FormData`, so the action only ever gets genuinely new selections).
- `copyDefaultCategories`: a selected subcategory whose parent category isn't among the
  selected ids is attached to the user's **existing** category copy (resolved by
  `(type, name)`), not a duplicate.

**Onboarding — conta padrão.** `public.handle_new_user()` (trigger `on_auth_user_created`,
migration `0003`, updated by `0025`) inserts a `CASH` account named "Carteira"
(`initial_balance = 0`) in the same insert that creates `profiles` — every new user has an
account before reaching the dashboard. First-time flow: **account** (`/onboarding/account` —
just confirm the wallet's real balance) → **categories** (`/onboarding` — only 5 pre-checked:
`QUICK_START_CATEGORY_NAMES` = Alimentação, Compras, Moradia, Transporte, Salário, an
onboarding-screen-only list unrelated to `is_default`) → **budget** (`/onboarding/budget`,
skippable) → dashboard. `signUp` and the `(app)` layout gate redirect to `/onboarding/account`.
`completeOnboarding` goes to `/onboarding/budget` whenever `isFirstTime`.

## Per-screen help

A `?` button (`src/components/ui/help-button.tsx`, `HelpButton`) in every main page's header
opens a short static popover (2-3 sentences) with that screen's essentials. Deliberately not
a spotlight tour — "tutorial tem que ser o básico de cada tela".

## Deleting a category or subcategory — guided reassignment

`category_id`/`subcategory_id` on `transactions`, `card_purchases`, `budgets`,
`fixed_expenses`, `reservoirs`, and `debts.default_category_id` are all nullable but **not**
`ON DELETE CASCADE`/`SET NULL` — a `DELETE` of a still-referenced category simply fails
(default `RESTRICT`). This forces every deletion through the app-level flow:

1. Count every referencing row (`transactions`, `card_purchases`, plus any
   `budgets`/`fixed_expenses`/`reservoirs`/`debts` still configured to use it) and show a
   preview (~last 10).
2. The user picks **one** action, applied as a single batch:
   - **Reassign** to a different category (and/or subcategory).
   - **Fall back to the parent category** (subcategory deletion only) — clears
     `subcategory_id`, keeps `category_id`.
   - **Leave uncategorized** — clears both. Uncategorized rows are a tolerated state, not an
     error.
3. Only after the batch clears every reference does the `DELETE` run (`RESTRICT` guarantees
   the ordering).

`reassignCategory` is exclusive to this flow — there is no standalone bulk-reassign action.
When reassigning away from a subcategory it writes **both** `category_id` and
`subcategory_id`. The reassign-target list is filtered to the source's own `type`.

---

# Juros, Rendimentos e Ajuste — `is_system` categories

Three permanent global categories: `Juros` (EXPENSE), `Rendimentos` (INCOME), `Ajuste` (two
rows, INCOME + EXPENSE — every category requires a `type`; the user just sees "Ajuste", the
direction is visible from the transaction's own amount).

## Juros — "Lançar Juros" (dedicated action)

`accounts.service.ts#registerInterest({ accountId, amount, date? })` — an **explicit amount**
(not a delta against an informed balance, unlike `registerYield`/`reconcileAccountBalance`).
The account's `type`, read from the DB (never from the client), decides the write:

- **`CASH`/`BANK`** → a `transactions` `EXPENSE` against the account, category `Juros`,
  default description `"Lançamento de juros — {conta}"` (e.g. overdraft interest).
- **`CREDIT_CARD`** → a 1x `card_purchases`, category `Juros`, competence derived normally
  from `closing_day`/`due_day` (the invoice's interest line) — flows through
  `card_purchases` → `card_installments` like any purchase.
- `amount <= 0` → no-op.

UI: "Lançar Juros" in the account card's menu (`type === "BANK"` only, same criterion as
"Informar Rendimento"); and on the Cards page, "Pagar fatura" is now a "Fatura ▾" menu with
"Pagar fatura" + "Lançar juros". Dialog: `src/features/accounts/components/interest-dialog.tsx`
(`InterestDialog`, shared), with value, date, and an **optional `base × %` calculator** that
fills the value once (one-directional, like `DebtTransactionDialog`'s).

## Rendimentos — "Informar Rendimento" (cofrinho check-in)

`registerYield(accountId, realBalance)` → the user enters the account's current real balance;
the system compares it to the calculated balance and creates **one INCOME transaction,
category `Rendimentos`, for the difference**. For a "cofrinho" that yields daily but the user
doesn't want to log day by day. **`BANK`-only** — physical cash doesn't yield.

## Ajuste — balance reconciliation

`reconcileAccountBalance(accountId, realBalance)` → same delta mechanic, but the transaction
is tagged `Ajuste` (INCOME or EXPENSE row, matching the transaction's own type). For when the
gap is clearly **not** yield — many untracked movements, or the user lost track and wants to
fix the number going forward without attributing a cause. Available for **CASH and BANK**.
`CREDIT_CARD` is out of scope for both actions.

- The choice between the two is the **user's** — the system only computes the delta, never
  auto-classifies.
- Zero delta on either → nothing is created.
- Both default the description to `"Informar Rendimento — {conta}"` /
  `"Ajustar Saldo — {conta}"`.
- **Dashboard signal**: a high `Ajuste` share means the user isn't logging carefully —
  `FinancialSummaryDTO.adjustmentAmount` (the period's R$ total under `Ajuste`) is shown as a
  badge next to Balanço Mensal, always `variant="warning"`.

---

# Estorno — `is_system` category

For recording a **refund**, which can happen months after the original purchase. The solution
never "goes back in time" — it always records the refund on the date it actually happened.
**Full refund only** — the amount is always the original total, never client-supplied or
editable; only the date is. `Estorno` is a pair (`EXPENSE` + `INCOME`, migration `0019`).

**Card purchase** — `cards.service.ts#refundCardPurchase(purchaseId, refundDate)`, three
things together:
1. The purchase's `category_id`/`subcategory_id` is reclassified to `Estorno` (`EXPENSE`) —
   this moves the value out of the original category's charts/sums from then on
   (`card_installments` inherits the category via join). The gross spend doesn't disappear,
   it just shows under "Estorno" (same transparency philosophy as `Ajuste`/`Rendimentos`).
2. **Every not-yet-billed installment is advanced to the invoice open at `refundDate`** —
   replicating the real issuer: a refunded purchase's future installments don't keep pinging
   through their original months, the remainder is dumped into the open invoice at once.
   `UPDATE card_installments SET competence = <that competence> WHERE purchase_id = … AND
   competence > <that competence>`. An already-billed installment is never touched. Multiple
   installments can share a `competence` — matches the real invoice; "N/total" numbering is
   cosmetically ambiguous but affects no total.
3. A `card_refunds` row is inserted — a **credit that reduces the amount owed exactly like a
   payment would**, with no paying account behind it (the credit came from the
   merchant/issuer). `UNIQUE (card_purchase_id)` prevents refunding the same purchase twice.

`card_refunds` effects:
- `getCardSummary.currentMonthPaidAmount` **includes** refunds credited through the end of
  the viewed month in the same oldest-first pool as `card_payments` — a refund "pays" the
  oldest open competence and the excess cascades forward. A fully-refunded invoice shows
  "Paga" and drops off the dashboard's obligations list.
- `currentMonthInvoice` stays the **gross** billed value (historical fact — only the "paid"
  part reflects the refund). `getCardMonthlyEvolution` also adds refunds to the green (paid)
  part of the split.
- `CardSummaryDTO.creditBalance` (>= 0) = `(Σ payments + Σ refunds) − Σ installments
  !paid_before_system`, floored at 0 — the "saldo a favor" when the credit exceeds everything
  billed. Shown in green on `/cards` and `AccountCard`. **Never withdrawable**, never enters
  an account balance — only offsets the card's own future purchases/invoices.
  `getCardBalanceThroughMonth`/`getCardTotalCommitted` keep the `Math.max(0, …)` — the
  negative sign lives only in `creditBalance`.
- `card_refunds.category_id` is always `Estorno` (`INCOME`) and counts as **real dashboard
  INCOME** for the month of `refund_date` (never the original purchase's month) — computed in
  `fetchPeriodEntries`, with a real category, so it appears in the income-by-category charts
  (unlike "Compras retroativas", which has no real category).

**Transaction outside a card** — `transactions.service.ts#refundTransaction(transactionId,
refundDate)`: simpler, because real money returns to a real account. Reclassify the original
`EXPENSE` to `Estorno`; create a **new real `INCOME` transaction**, category `Estorno`, same
amount, credited to the same origin account, dated when the refund happened.
`transactions.refund_of_transaction_id` (self-FK, `ON DELETE SET NULL`) is traceability only.
Blocks a second refund by checking the original is already categorized `Estorno`.

- **Dashboard signal**: `FinancialSummaryDTO.refundAmount` — the period's R$ total flowing
  through "Estorno" (both directions, so ~2× a single refund). Currently no UI consumer.
- **Out of scope**: a refund doesn't appear as its own row in the Explorador de Lançamentos
  (only the original's recategorization is visible). No undo path — to reverse, recategorize
  manually and delete the `card_refunds` / income transaction by hand.

---

# Pagamento de Cartão — `is_system` category

`is_system` `EXPENSE` "Pagamento de Cartão" (migration `0031`, one row). Applied automatically
by `registerCardPayment` (via `insertCardPayment` / `getCardPaymentCategoryId`) to every
`CREDIT_CARD_PAYMENT` transaction — not a classification the user chooses, just the label of
the one flow that exists. Backfilled onto all existing `CREDIT_CARD_PAYMENT` rows.

- **Never user-selectable** (`is_system` ⇒ out of `CategorySelect`; `EditableCategoryCell`
  already shows any `CREDIT_CARD_PAYMENT` row as the fixed text "Pagamento de Cartão", an
  early return on `row.type`).
- **Documented exception to "a category's `type` matches the transaction's `type`"**: a
  `CREDIT_CARD_PAYMENT` is neither `INCOME` nor `EXPENSE` and has no `CategoryType`. `EXPENSE`
  was an explicit user choice (a bill payment is conceptually an outflow).
- **Not in analytics** — every relevant query restricts `type in ('INCOME','EXPENSE')`.
  Filtering the dashboard by "Pagamento de Cartão" returns nothing.
- **Useful in**: the `/transactions` category filter (`getTransactions` doesn't restrict
  `type` and does `eq("category_id", …)`), which groups the bill payments; and future
  reports.

---

# Reservoir (Cofre) — displayed as "Receita Programada"

Accumulated value that is **not yet real money** — projected or already-earned-but-not-yet-
received income (originated from freelance/session-based income; the model is generic).
**Display-only rename** — route (`/reservoirs`), tables (`reservoirs`,
`reservoir_transactions`), service, DTOs (`ReservoirDTO`, `ReservoirTransactionDTO`) all
unchanged. Search the codebase for `reservoir`.

`reservoirs` is the header (name + optional default `category_id`/`subcategory_id`).
`reservoir_transactions` is the ledger:

- **Accumulation entries** (`amount` positive): logged as soon as the user knows/estimates a
  value. No pending/confirmed status — every entry is just a value.
- **Withdrawal entries** (`amount` negative): logged when money is actually received into a
  real account. `withdrawReservoir` always creates a linked **INCOME `transactions`** row
  (`linked_transaction_id`) into a CASH/BANK account — there is currently **no card path**.
  `reservoir_transactions.linked_card_purchase_id` exists in the schema and
  `deleteReservoirTransaction` still handles it defensively, but nothing writes it today; a
  "withdraw onto a card" flow would be a future addition, not an existing one.

The withdrawal amount **need not match** the accumulated total — the balance
(`SUM(reservoir_transactions.amount)`) just carries the difference forward.

Default description (when blank): `"Movimentação da receita programada {nome}"` — applied
server-side to accrual, withdrawal, and the withdrawal's linked `transactions` row; the
accrual dialog also pre-fills it.

**Gross / percentage / net split (accrual entries only)** — three optional related fields:
`grossAmount`, `percentage`, `amount` (the net, which always drives the balance).
`amount = grossAmount × (percentage / 100)`.
- `amount` alone is the default, simplest case.
- `grossAmount` is always a direct user input, **never** auto-calculated.
- `percentage` and `amount` are the dependent pair: editing one recalculates the other, given
  `grossAmount` is present (`calculateGrossNetSplit`, `src/lib/utils`).
- Validation: `grossAmount` filled ⇒ `grossAmount >= amount`; `percentage`, when filled,
  0..100.

**Reservoir-level defaults** (migration `0010`): `reservoirs.default_percentage`,
`reservoirs.default_destination_account_id` pre-fill `AccrualDialog`'s `percentage` and
`WithdrawalDialog`'s `destinationAccountId`. Set at creation and editable later. Starting
values, not constraints.

**Reservoir must never affect account balances, income/expense totals, or analytics** — only
a withdrawal (which creates a real transaction) does.

**Deletion — hard delete, not the `active` soft-delete convention.** A reservoir needs no
guided reassignment — there's nothing to reassign — but a withdrawal's real linked row must
survive:
- `deleteReservoirTransaction(id)`: deletes one ledger row. If it's a withdrawal, the linked
  `transactions`/`card_purchases` row is deleted too (a ledger entry's only reason to exist
  *is* that specific withdrawal).
- `deleteReservoir(id)`: deletes the header; `reservoir_transactions` cascade (`ON DELETE
  CASCADE`). The cascade does **not** reach `transactions`/`card_purchases` (the FK points
  the other way, `ON DELETE SET NULL`) — every withdrawal stays intact in Lançamentos/Cartões,
  just no longer traceable to a reservoir.

Account pickers on `/reservoirs` use the shared `AccountSelect`.

---

# Metas ("Goals")

Internal feature `goals` (route `/goals`, `goals.service.ts`, `GoalDTO`), UI label "Metas".
The **mirror image of "Receita Programada"**: money the user **already has** and is actively
setting aside from an account toward an objective, with a target and — optionally — a monthly
contribution and/or a deadline.

| | Receita Programada | Meta |
|---|---|---|
| Represents | money I'll receive later | money I have and am setting aside |
| Positive entry | expected accrual | contribution (`RESERVE`) |
| Yields? | no (not real money yet) | yes (real money sitting still) |
| Withdrawal | money "arrives" → INCOME | money **returns** to the pocket → **not** new income (`REDEEM`) |
| Schedule | — | ahead/behind, `INSTALLMENT_PLAN` pattern (`0032`) |

## Tables and the money model

- **`goals`** (`0035`): `name`, `goal_target` (required, `> 0` — the donut's total), `start_competence`
  (schedule start, 1st of month), `end_date` (optional target completion month),
  `monthly_contribution` (optional — "save whatever you can"), `anchor_date` (start of the
  current schedule leg).
- **`goal_yields`** (`0035`): yield. `origin_redeem_transaction_id` distinguishes an
  **informed yield** (`NULL`) from a **yield recognized inside a redeem** (FK `ON DELETE
  CASCADE` to that `REDEEM`).
- **`transactions.goal_id`** (`0035`, `ON DELETE SET NULL`): links a `RESERVE`/`REDEEM` to
  the goal. Deleting the goal leaves the real money history intact, just drops the link.
- **`currentBalance` is never a column**: `Σ RESERVE − Σ REDEEM + Σ goal_yields`, always
  computed (`computeGoalBalance` / `getGoals`).

**`RESERVE` / `REDEEM` transaction types** (`0034`): real money leaving/entering a **CASH/BANK**
account (never a card — checked server-side from the account's `type`), but **not** income or
expense — money changing pockets, like `TRANSFER`. Analytics filter `type in
('INCOME','EXPENSE')`, so they're excluded automatically. `getAccountBalance` (CASH/BANK)
sums every transaction by origin/destination without looking at `type`, so `RESERVE` reduces
and `REDEEM` raises the account balance with no new code. Consequence: the dashboard's "Saldo
total nas contas" already excludes money set aside; the set-aside total shows as a sub-line
(`FinancialSummaryDTO.reservedTotal`).

## Yield — always INCOME, recognized at one of two moments

Goal yield is **new money** and counts as INCOME, under the existing `is_system` category
**"Rendimentos"** ("cofrinho rende igual conta, só separado" — no new category). It's **not**
a real `transactions` row — it lives in `goal_yields` and enters the dashboard as **synthetic
INCOME** under "Rendimentos" (`fetchPeriodEntries`, via cached `getRendimentosCategory`),
exactly like "Compras retroativas". Appears in the income donut, RECEITAS total, monthly
evolution. **Not** in the Explorador de Lançamentos (an informed yield never would be).
Guards: income side only, skips `uncategorizedOnly`/subcategory, excluded under an account
filter.

- **"Informar rendimento"** (`registerGoalYield`): the user types the goal's current real
  balance; the delta over the computed balance becomes a `goal_yields`
  (`origin_redeem_transaction_id = NULL`). Same UX as `accounts.service#registerYield`.
  Positive delta only in v1 — a downward correction is done by editing the goal.
- **At redeem** (`redeemGoal`): the `REDEEM` is always the **full amount withdrawn**. If
  `amount > book balance` (yield never informed), the excess becomes a `goal_yields` dated on
  the redeem day, `origin_redeem_transaction_id` = the `REDEEM`. (If yield had been informed
  along the way, the book balance would already be right and there'd be no excess — no double
  counting.)

## Redeem — category and reason

`REDEEM` carries one of two `is_system` **INCOME** categories (`0036`), auto-picked by balance
vs. target and overridable by a **dedicated 2-option toggle** in the dialog (never
`CategorySelect`):

- **"Resgate de Meta Concluída"** — the balance had reached `goal_target`.
- **"Resgate de Meta Antecipado"** — the balance was below target (the "I had to dip into
  savings" signal, in the spirit of `Ajuste`).

INCOME-typed, but irrelevant to analytics (`REDEEM` is excluded by `type`). The category is a
pure label + a `/transactions` filter handle. **Partial / total / over-redeem all free** —
the user can withdraw any time, even below target, even more than what's saved (the excess is
recognized yield).

## Schedule (ahead / behind) and "Recalcular"

Follows the `INSTALLMENT_PLAN.scheduleOffset` pattern (`0032`), always anchored to today.
`goals.service.ts#scheduleFor`:

- `anchorBalance` = the goal's balance from entries with `date <= anchor_date` — computed
  live from the immutable ledger, so a rebase never needs to store a value snapshot.
- `monthsElapsed = max(0, monthsBetween(anchorMonth, currentMonth))`.
- `expectedByNow = min(anchorBalance + monthly_contribution × monthsElapsed, goal_target)`.
- `scheduleOffsetMonths = round((currentBalance − expectedByNow) / monthly_contribution)` —
  `> 0` ahead, `< 0` behind, `0` on track. Only when `monthly_contribution` exists and the
  goal isn't reached.
- `status`: `REACHED` / `AHEAD` / `ON_TRACK` / `BEHIND` / `NO_SCHEDULE` (no
  `monthly_contribution` — the goal is just a progress tracker, no ahead/behind badge).
- `projectedCompletionMonth` = `ceil((goal_target − currentBalance) / monthly_contribution)`
  months out.

**"Recalcular"** (`updateGoal` with `rebase: true`, or any `end_date` edit): `anchor_date =
today` and, if no explicit `monthly_contribution` was passed, it's rewritten as
`(goal_target − current balance) / months left to end_date`. **The ledger is never touched** —
"how much is done" is always the balance at `anchor_date`. There's no separate "X was
contribution, Y was yield" track: the ledger *is* that track (`Σ RESERVE` = principal, `Σ
goal_yields` = recognized yield, both immutable). This is also why **deleting a wrong entry
is a safe hard delete** — no derived value is stored, everything recomputes.

## Target, contribution, deadline — two define the third

`goal_target` always required. `monthly_contribution` and `end_date` optional. If `end_date`
is set and `monthly_contribution` isn't, the service computes the contribution =
`(goal_target − initial reserve) / months`; `GoalFormDialog` also shows this live (client-side)
with a "use" button. An optional initial reserve on the create form = a first real `RESERVE`
from an account, dated at `start_competence` (so it lands in `anchorBalance`, not as a later
contribution).

## Deletion

- **`deleteGoal`** — hard delete. `goal_yields` cascade; `RESERVE`/`REDEEM` survive with
  `goal_id = NULL` (real money moved). Same philosophy as `deleteReservoir`.
- **`deleteGoalEntry`** (a `RESERVE`/`REDEEM`) — hard delete; the account balance recomputes;
  a `goal_yields` recognized inside a deleted `REDEEM` cascades. To fix a **typo**, **edit**
  (`updateGoalEntry` — value/date/account/description, propagates to `transactions`), don't
  delete. Editing the *value* of a `REDEEM` that generated recognized yield does not
  recompute that yield — delete and redo instead.
- **`deleteGoalYield`** — only an **informed** yield (`origin_redeem_transaction_id IS NULL`);
  a recognized one is deleted by deleting its redeem.
- `RESERVE`/`REDEEM` in the Explorador de Lançamentos / `/transactions` are **read-only**
  ("Edite pela tela de Metas"), like card installments — `EditableCategoryCell` shows a fixed
  label ("Aporte para meta" / "Resgate de meta").

## Dashboard

- **"Metas" block** (`GoalsOverview` / `getGoalsOverview`): a compact donut + status badge
  per goal. Hidden under a category filter (like the "Despesas de {mês}" card).
- **Evolução mensal** gets a 3rd bar "Guardado (metas)" = the month's **flow** (`Σ RESERVE −
  Σ REDEEM` dated in the month, `MonthlyEvolutionDTO.reserved`) — same unit as the other
  bars, not cumulative. Only renders if some month has flow `> 0`.
- **Saldo card** gets a sub-line "R$ X guardado em metas" (`FinancialSummaryDTO.reservedTotal`
  = Σ balance of every active goal; global, not scoped by the account filter).
- **`/goals`**: an "Acumulado guardado" chart (`getGoalAccumulation` — total saved at the end
  of each of the last 13 months + a reference line at the sum of targets) + one card per goal
  (donut, badges, Aportar/Rendimento/Resgatar/Recalcular, ledger list).

## Future vision (not implemented)

Long-term goal: predictability with compound interest (project the curve, compare projected
vs. real, a contribution calculator that solves PMT given target + rate). The v1 schema
doesn't block it — phase 2 only adds an optional `expected_annual_rate` on `goals` and a
projection line on the accumulation chart.

---

# Debts

Types: `PAYABLE` (owed by the user) / `RECEIVABLE` (owed to the user). `debts.initial_balance`
seeds the start; `remainingBalance` is **never a column** — always `initial_balance +
SUM(debt_transactions.amount)`, computed in the service.

`debt_transactions` is the ledger: `amount` positive = the debt grew; negative = a payment
reduced it.

**`linked_transaction_id` is optional in both directions**:
- Real money in/out of a tracked account → a `transactions` row is created and linked
  (mirrors `TRANSFER` semantics conceptually — money moves but isn't INCOME/EXPENSE, it's a
  loan).
- A third party pays a bill directly on the user's behalf → only the `debt_transactions`
  entry, no `transactions` row.

Paying a debt with the user's own money **always** creates a linked transaction. Debts never
affect dashboard totals directly — only their linked transactions do.

- **Default description** (when blank): `"Movimentação da dívida {agent}"`, on the ledger row
  and its linked transaction; `DebtTransactionDialog` also pre-fills it.
- **Settling to zero is an automatic soft delete.** `addDebtTransaction` recomputes the real
  balance post-insert; `<= 0` → `active = false`, the debt drops out of `getDebts()`.
  Overpaying is intentional (interest the creditor folded in), not an error — it still zeroes
  the debt, leaving the extra as the transaction's real value. `DebtTransactionDialog` warns
  before submitting such a payment and requires a second "Confirmar quitação" click. The
  decision is server-side from the real post-insert balance.
- **Pie charts**: "Dívidas a pagar" / "Dívidas a receber", one per `side`, active debts by
  remaining balance. A side's pie is omitted entirely when it has no positive-balance debt —
  no empty/placeholder chart.
- **Default category** (`debts.default_category_id`, migration `0015`): set at registration,
  typed to whichever direction a *payment* produces (`EXPENSE` for `PAYABLE`, `INCOME` for
  `RECEIVABLE`). `DebtTransactionDialog` pre-fills it **only in `mode="payment"`** (never
  `"increase"`, which produces the opposite type). Always overridable. Server-side,
  `addDebtTransaction` falls back to it only when `categoryId` is omitted **and** the entry
  is a reduction. `RESTRICT` FK, wired into the guided category-deletion flow
  (`CategoryUsageDTO.debtsCount`), special-cased (column is `default_category_id`, no
  subcategory concept).
- **The debt and its ledger entries are editable/deletable.**
  - `updateDebt`: agent, side, initial balance, default category — all freely editable.
    Changing `side` doesn't touch existing entries' history, only which type future entries
    use.
  - `DeleteDebtButton` → `deactivateDebt` directly (no ledger entry) — for a forgiven /
    given-up-on debt.
  - `updateDebtTransaction` propagates amount/date/description/category onto the linked
    `transactions` row when one exists. **Can never flip an entry's direction** — the service
    rejects a `Math.sign` mismatch. `deleteDebtTransaction` deletes the linked row too. Both
    recompute the balance and reapply the settle-to-zero auto-deactivation.
  - `debt_transactions.date` (migration `0016`) — before this the date picker was silently
    discarded for an unlinked entry.

## Subtypes — `debts.kind` (migration `0021`)

- **`PERSONAL`** (default, preserves every existing debt's behavior) — a loan between people.
  Any direction. **Never affects the dashboard.**
- **`OVERDUE_BILL`** — a day-to-day bill (water, power, rent) left unpaid. Always `PAYABLE`
  in practice (the form locks/hides the direction). **Always projects to the dashboard** (via
  the "Despesas de {mês}" card).
- **`INSTALLMENT_PLAN`** — an installment purchase outside a card (boleto, store financing) or
  an informal "no boca a boca" agreement with a monthly amount. Always `PAYABLE`, also
  projects. Extra fields, required only for this kind (validated in
  `src/lib/validations/debts.ts`, not a DB `CHECK`): `monthlyAmount`, `dueDay` (1-28),
  `startCompetence` (migration `0032`).

### `INSTALLMENT_PLAN` — competence and ahead/behind

- **`debts.start_competence`** (migration `0032`, a month, 1st day) — the competence month
  from which the plan starts counting. Nullable in the DB, required in zod for this kind.
  Freely editable after creation. Backfill = the month of `created_at`.
- **Automatic oldest-first payment allocation** (no per-payment competence picker, no new
  column). Exactly the `currentMonthPaidAmount` heuristic: `total paid ÷ monthlyAmount` (in
  integer cents) = number of competences covered, from `startCompetence`. Only payments count
  (`amount < 0`); an increase (interest) doesn't "pay" anything, it only extends how many
  months the plan has. Paying two boletos today covers the next two competences and **carries
  credit forward** — nothing is removed (unlike the card "Antecipar parcelas").
- **`DebtDTO.paidThroughCompetence`** ("YYYY-MM" or absent) — the last competence covered =
  `startCompetence + (competencesCovered − 1)` months. A heuristic — a payment meant to clear
  a specific future month still shows as covering the oldest open competence first.
- **`DebtDTO.scheduleOffset`** (signed months) = `competencesCovered − expected`, where
  `expected` = how many installments *should* be paid by today (`monthsBetween(startCompetence,
  currentMonth) + 1`), capped at the plan's total installment count
  (`ceil((initial_balance + Σ increases) / monthlyAmount)`). `> 0` ahead, `< 0` behind, `0`
  on track. Anchored to today.
- Badge on `/installment-plans` (`debt-card.tsx#InstallmentScheduleBadges`): "Adiantado N
  meses" / "Atrasado N meses" / "Em dia" + "Vence dia {dueDay}"; below the "{monthlyAmount}/mês
  combinado": "Pago até {mês}" or "Nenhuma parcela paga ainda".
- **Dashboard**: `getCurrentMonthObligations`/`fetchUnpaidObligationEntries` gate an
  `INSTALLMENT_PLAN` obligation **by competence** — it appears for viewed month `M` only when
  `M >= startCompetence` **and** `M` isn't covered (`!(paidThroughCompetence && M <=
  paidThroughCompetence)`). Correct for any browsed month. `OVERDUE_BILL` (no competence
  concept) is always open. The item's value is the full `monthlyAmount` (no partial-carry
  subtraction — the progress detail lives in "Pago até {mês}").
- `paidThisMonth` is still computed and in the DTO but no UI uses it anymore.

### Separate screens per `kind`

The three `kind` values each have their own route, sidebar item, and dedicated form.
**Presentation only — no domain rule changed** (service, DTOs, validations, ledger pipeline,
dashboard projection are identical).

- **`/debts`** — "Dívidas Pessoais", `kind = PERSONAL`. Keeps `DebtSideFilter` (Todas / A
  pagar / A receber) and the two pies (only `PERSONAL` goes both directions).
- **`/overdue-bills`** — "Contas em Atraso", `kind = OVERDUE_BILL`. No side filter, one pie.
- **`/installment-plans`** — "Parcelamento Programado", `kind = INSTALLMENT_PLAN`. No side
  filter; the form shows `monthlyAmount`/`dueDay`/`startCompetence`.

`DebtFormDialog` has a `kind` prop (fixed by the screen in create mode, from `debt.kind` in
edit) and **no kind selector** — changing a debt's kind via UI is no longer possible. Shared
`src/features/debts/components/`: `debts-view.tsx` (async — filters `getDebts()` by kind +
optional side, renders charts + list), `debt-card.tsx` (async — one card, fetches its own
`getDebtTransactions`). `DebtsCharts` has `payableTitle`/`receivableTitle` props.
`revalidateDebtPaths()` covers all three routes.

### Interest calculator

`DebtTransactionDialog`, in `mode="increase"` only (never editing an existing entry), has an
optional "Calcular juros (%)": the user types a percentage, the system fills the Value field
with `current balance × (percentage / 100)` (`roundMoney`) — still freely editable, never a
reactive bidirectional pair. Works for any debt (the user decided it also serves a `PERSONAL`
debt with interest agreed between the parties).

---

# Dashboard obligations projection

**"Despesas de {mês}" card** — `MonthObligationsCard` /
`dashboard.service.ts#getCurrentMonthObligations(month?)`. A donut (`total` big in the
center) + a list of what's still unpaid, each row with a "Pagar" button.

- **Follows the dashboard's viewed month** (`getCurrentMonthObligations(monthKey(filters.periodEnd))`);
  no arg falls back to today's real month.
- **`total` = `paidTotal` + `remainingTotal`** = "the month's realized expenses + what's
  still to pay". Reconciles with the DESPESAS summary card (competence basis) **plus** the
  month's unpaid fixed expenses / scheduled debts (which DESPESAS doesn't count until they
  become a transaction). Center shows `total` + sub "`{remainingTotal}` a pagar".
- **Card counted by competence** (not the outstanding invoice balance): per card,
  `getCardSummary(card, viewedMonth).currentMonthInvoice` and `currentMonthPaidAmount`. The
  "Fatura {cartão}" slice/row = `currentMonthInvoice − currentMonthPaidAmount` (when `> 0`);
  the paid part goes into `paidTotal`.
- **`paidTotal`** = Σ `transactions` `EXPENSE` dated in the month + Σ `currentMonthPaidAmount`
  per card. **`CREDIT_CARD_PAYMENT` is NOT summed here** — it would double against the card's
  competence figure (and a payment made this month usually settles a *prior* month's invoice).
- **List** (unpaid items only, "Pago" slice stays donut-only): card invoices
  (`currentMonthInvoice − currentMonthPaidAmount > 0`); each fixed expense `!isPaidThisMonth`
  (`plannedAmount`); each `PAYABLE` `OVERDUE_BILL` (`remainingBalance`, badge "Atrasada") /
  `INSTALLMENT_PLAN` whose viewed-month competence isn't covered (`monthlyAmount`). Sorted by
  due day (no-`dueDay` `OVERDUE_BILL` first, then ascending `dueDay`) in the component;
  `getCurrentMonthObligations` returns `items` by descending value (the donut's order). Each
  row opens the right dialog (`PaymentFormDialog` / `PayFixedExpenseDialog` /
  `DebtTransactionDialog` in `mode="payment"`).
- **No double counting**: a fixed expense paid via bank → in "Pago" (it's EXPENSE), out of
  the items list; paid via card → not EXPENSE, out of items, into the card invoice by the
  installment's competence; a partial invoice payment → paid part into `paidTotal`, the
  "Fatura" slice shows only the rest; a third-party debt payment (no linked transaction) →
  invisible on both sides.
- **`DueBadge` is month-aware**: future month → "Vence dia {dueDay}"; past month →
  "Atrasada"; current month → the `daysUntilDueThisMonth` count.
- **Aggregation is 100% in the service** — `getCurrentMonthObligations` returns `items` +
  `paidTotal`/`remainingTotal`/`total` ready, no `reduce()` in the component. Self-contained
  (does its own account / `getCardSummary` / fixed-expense / debt / transaction fetches).
- **Hidden entirely when a category/subcategory/`uncategorizedOnly` filter is active** — it
  lists whole-month commitments that aren't category-scoped.
- **Inherited caveat**: a fixed expense paid via a card whose invoice already closed has the
  installment in *next* month's competence, so `isPaidThisMonth` for the due month stays
  `false` and the item stays "Atrasada" — see `DOC/HISTORY.md` → "Found, not fixed".

**`getDefaultDashboardMonth()`** — mirrors `getDefaultCardsMonth()`: without `?month=`, if
`getCurrentMonthObligations(todayMonth).remainingTotal === 0` **and**
`getCurrentMonthObligations(nextMonth).total > 0`, opens on next month; else today's month.
`DashboardFilters` receives the resolved month as a prop and falls back to it.

---

# Budgets

Each `budgets` row belongs to exactly one month (`budgets.month`, migration `0009` — replaced
the old "standing target", which let raising a budget silently overwrite history).

- Never generates a transaction. Purely informational.
- `actualAmount` = real sum of that category's `transactions` + `card_installments` in the
  month.
- `status = EXCEEDED` when `actualAmount > plannedAmount`. Alerts only, never blocks.

## Which months can be planned, and cloning

Only two months are directly creatable/editable:
- **The current real calendar month** — always plannable, even the first time (a brand-new
  user with zero budgets is normal).
- **The next calendar month** — unlocks only once the current month has ≥1 active budget row
  (`getBudgetMonthWindow().hasCurrentMonthBudget`).
- **Every earlier month is read-only history** — browsable via the shared `MonthNav`.

**Cloning** (`CloneBudgetButton`) copies every active row from one month to another verbatim
— offered when the viewed editable month is empty and a prior month exists. The source is
always `lastRegisteredMonth` (`MAX(month)` over active budgets), **not** the literal previous
calendar month (someone who planned January and returns in April gets April cloned from
January).

## Category ceilings are never computed — only ever real or absent

A category's `plannedAmount` is always either a real, explicitly-set row, or **no
category-level number at all** — never an implicit "sum of its subcategories". The implicit
sum was rejected because a category's `actualAmount` already covers *everything* under it,
tracked or not — an implicit sum would only reflect *tracked* subcategories, so an untracked
expense would look like it blew a budget the user never set (a false alert).

- A category with **no** active row has no ceiling and no alert at that level. Anything spent
  in an *unbudgeted* subcategory under it is invisible to the budget system. Budgeting is
  opt-in per line.
- A category *with* an active row gets its usual `actualAmount` vs. `plannedAmount`. Because
  `actualAmount` already includes untracked subcategories, this gives two severities for
  free: the category's own `EXCEEDED` is a *soft* signal (total category spend passed the
  ceiling); a subcategory's own `EXCEEDED` is a *sharper* one (spend specifically tracked
  under it passed its own number). Both non-blocking.

## Budget hierarchy — category vs. subcategory, and the fixed-expense floor

(`src/services/_shared.ts`.) A fixed expense is functionally a *committed, non-negotiable
slice* of what a category may spend — a category's budget can't be smaller than the fixed
expenses already registered under it.

- A budget is set at the **category** level (`subcategory_id IS NULL`) or the **subcategory**
  level, nested:
  - a category's amount must be `>=` (Σ every subcategory budget under it *for the same
    month*) + (Σ every fixed expense attached directly to the category);
  - a subcategory's amount must be `>=` Σ fixed expenses on that subcategory.
  The gap between a category budget and its subcategory-budget sum is *unallocated* headroom.
- **Lowering a budget below its committed children is a HARD BLOCK, not a warning** —
  deliberately inconsistent with the credit-limit soft-enforce pattern: a budget that
  contradicts its own committed children is simply wrong. The save fails with a validation
  error naming the floor. (`getBudgetFloor` / `getBudgetFloorAction` also surfaces the floor
  as the input's `min` + a pre-submit check, so it isn't only a post-submit error.)
- **A fixed expense attached directly to a category (no subcategory)** still
  auto-creates/raises **that category's** row at the sum of its committed fixed expenses,
  with a notice, never a block. Scoped to the current month always + next month if a budget
  already exists at that same level there.
- **A fixed expense attached to a *subcategory*** only ever raises/creates **the
  subcategory's** row — never the category's (creating one when no category budget exists
  must not conjure a number the user never set). The category is only ever touched afterward
  via `deactivateCategoryBudgetIfOverCommitted` — **erase, never raise/create**. Four cases,
  all through the shared `reconcileBudgetFloors` codepath (fixed-expense saves +
  subcategory-budget saves):
  1. Neither has a row → the subcategory row is created at the floor; the category is left
     alone.
  2. Subcategory has a row, category doesn't → the subcategory row is raised only if the
     floor exceeds it; the category still isn't created.
  3. Both have rows → the subcategory row is raised as needed, then the category row is
     re-checked: kept if it still has real headroom over the (possibly just-raised)
     subcategory-budget sum; **deactivated with a notice** if the sum has reached *or*
     exceeded it (exact fill counts).
  4. Category has a row, subcategory doesn't → the subcategory row is created at the floor,
     then the same category re-check as case 3.
- **Saving a subcategory budget — or raising one via a subcategory-level fixed expense —
  never raises or creates the parent category's row.** `deactivateCategoryBudgetIfOverCommitted`
  replaces raising with erasing: if the new subcategory total reaches *or* exceeds the
  category's existing explicit row, that row is deactivated with a notice — the category goes
  back to having no number of its own. Re-creating one afterward must still be `>=` the
  subcategory sum. **A category with direct fixed expenses is never auto-deactivated** — its
  floor can't be silently orphaned.
- **A budget row that's the committed floor for one or more fixed expenses can never be
  deleted, only raised.** Enforced in `deactivateBudget` server-side (every entry point:
  the single-row trash icon, and the tree editor's blank-field shortcut). The UI also hides
  the trash icon on any row with fixed expenses nested under it.

## Tree display and the tree editor

- `src/features/budgets/components/budget-tree.tsx`: a category with an active row renders
  nested (category box + subcategory boxes). A category with **no** active row and exactly
  one budgeted subcategory merges into a single box "Categoria · Subcategoria". Two or more
  subcategories with no category row render as a bare category-name divider above each
  subcategory's standalone box.
- **"Planejar orçamentos"** (`budget-tree-editor.tsx`, reusing the onboarding tree-picker's
  pattern; `BudgetTreeFields` shared with the onboarding budget step): an amount input per
  category/subcategory row, a whole tree in one screen. Category rows save before subcategory
  rows in the same submission (so a category's ceiling exists before its children are checked
  against it).
- **The tree editor doubles as a bulk-delete tool** — clearing a field that has a budget
  deactivates that row, through the exact same guards (a blank field on a row with fixed
  expenses attached fails with an inline error).

## Single unified `/budgets` page

One list — the tree — and two creation buttons: "Novo orçamento" (category/subcategory,
month-scoped, gated to the editable window) and "Nova despesa programada" (always available —
these are perpetual, not month-owned). Each fixed expense's row inside the tree carries its
own actions (pay / edit / delete) via `BudgetTree`'s `renderFixedExpenseActions` prop (the
dashboard panel shares `BudgetTree` read-only, passing no action slots).

- **The payment icon is always visible, paid or not.** `PayFixedExpenseDialog` branches on
  `expense.isPaidThisMonth`: unpaid → the account/amount/date form; paid → a plain-text
  summary (`"{nome} pago no valor de {valor} no dia {data}"`) with "OK" and "Cancelar
  pagamento". "Cancelar pagamento" → `cancelFixedExpensePayment(fixedExpenseId, month)`,
  which deletes whichever real record(s) made that month's `isPaidThisMonth` true (linked
  `transactions` row for CASH/BANK, linked `card_purchases` for CREDIT_CARD), **scoped
  strictly to the viewed month**. `FixedExpenseDTO.paidDate` carries the summary's date.
- **A fixed expense's bar inside the tree uses `actualAmount`** (real linked transactions,
  0 when unpaid), **not** the `projectedAmount` placeholder — inside the tree a full bar must
  mean *paid*.
- **`/budgets` also renders the month's transactions at the bottom** via the shared
  `TransactionExplorer` (`getTransactionsFiltered({ periodStart, periodEnd })`, unfiltered by
  category), regardless of whether the month is editable.

## Onboarding hook

Right after a first-time signup confirms the wallet balance and picks starter categories,
`completeOnboarding` redirects to `/onboarding/budget` (outside the `(app)` layout, no nav
chrome) instead of straight to the dashboard. Skipping it is a valid no-op — the only trace
is the dashboard budgets panel showing a "Criar orçamento" CTA. Re-imports from Settings
(`isFirstTime = false`) never trigger this step.

---

# Fixed Expenses (recurring) — displayed as "Despesas Programadas"

**Display-only rename** — route (`/budgets`, no dedicated route), tables (`fixed_expenses`,
`fixed_expense_amount_history`), service, DTOs (`FixedExpenseDTO`) unchanged. Search the
codebase for `fixed_expense`.

Functionally a **specialized, committed slice of a Budget** for genuinely fixed recurring
bills — `fixed_expenses.amount`, `due_day`, optional `default_account_id`. See "Budget
hierarchy" for how the floor interacts with budgets.

- Before this month's real payment is registered, the dashboard shows the **planned amount as
  a placeholder** (`projectedAmount = plannedAmount`).
- Once a real `transactions` row is registered and linked via `fixed_expense_id`, the
  dashboard switches to the **real value** (`projectedAmount = actualAmount`) — avoids
  double-counting placeholder + real transaction. This same transaction feeds the parent
  budget's `actualAmount`.
- Real `>` planned → shows the larger number + an `EXCEEDED` alert.
- **Exception**: inside the budget tree, the progress bar uses `actualAmount` directly (a
  full bar there means "paid").
- **Long-term unpaid/overdue fixed expenses are out of automatic scope** — the intended path
  is a manual `Debt` entry.
- Never self-generates a transaction. Default "Registrar pagamento" description:
  `"Pagamento — {nome}"`.

## Paying — every account type, including `CREDIT_CARD`

`payFixedExpense` (`fixed-expenses.service.ts`) decides from the **account's own `type`, read
server-side, never from client input**:
- `CASH`/`BANK` → a plain `EXPENSE` transaction linked via `fixed_expense_id`.
- `CREDIT_CARD` → a **1x `card_purchases` row**, also linked via `card_purchases.fixed_expense_id`
  (migration `0012`) — flows through the normal `card_purchases` → `card_installments`
  pipeline. Competence is derived the normal way (a fixed expense paid on the 20th against a
  card closing on the 15th lands in the *next* competence month).

`getFixedExpenses`'s `actualAmount` sums both linked `transactions` (by `date`) and linked
`card_installments` (by `competence`, never `purchase_date`). Both pickers use the shared
`AccountSelect` (grouped `CASH → BANK → CREDIT_CARD` with the type icon — a bank account and a
card can share a name, the icon is what tells them apart).

## Value history — `fixed_expense_amount_history` (migration `0023`)

`fixed_expenses.amount` is a **cache of the latest value only** — used where "the current
value" suffices (pre-filling the edit form; the budget floor in `_shared.ts`, which only
looks at the current/next month). The real per-month value comes from
`fixed_expense_amount_history` (`{fixed_expense_id, amount, effective_from}`, unique per
`(fixed_expense_id, effective_from)`).

- `createFixedExpense` writes the first history row at `effective_from = '1970-01-01'`
  ("since forever").
- `updateFixedExpense`, when `amount` changes, upserts a new row at `effective_from =` **the
  current real month** — never a past month, never asked. The form shows a notice ("Vale a
  partir de {mês atual} — meses anteriores mantêm o valor de antes"). Future months beyond
  the current one also show the new value.
- `getFixedExpenses(month)` — callable for any month, including past — resolves
  `plannedAmount` from the history row with the most recent `effective_from <= month`. This
  is why editing rent R$1500 → R$2000 never rewrites a past month's planned-vs-actual.

## Competence window — `start_competence` / `end_competence` (migration `0026`)

- `start_competence` (required, backfilled `'1970-01-01'`) / `end_competence` (optional, `NULL`
  = still active). Both a competence month ("YYYY-MM" client, 1st day DB). `CHECK
  (end_competence IS NULL OR end_competence >= start_competence)`.
- `getFixedExpenses(month)` only returns a fixed expense whose `start_competence <= month <=
  (end_competence or infinity)` — outside the window it doesn't appear in that month's budget
  tree **and doesn't impose a floor** (`_shared.ts` floor functions gained the same filter;
  `getSubcategoryBudgetFloor` gained a `month` parameter it didn't have before).
- **"Fim" is a direct month picker** (`<input type="month">`), never auto-computed from a
  cancellation date — an explicit user choice. A hint text explains the reasoning
  (cancellation day vs. due day) to help the user pick the right month.
- **No extra blocking anywhere** — an out-of-window expense simply doesn't appear in that
  month's UI, so there's no path to try to pay something that "isn't there".
- `start_competence`/`end_competence` are freely editable after creation (unlike `amount`,
  they're not a protected monetary value — just "since when this counts").
- **Why `fixed_expense_amount_history` still exists alongside this**: the window answers
  "does the expense exist this month?" (existence); the history answers "how much did it cost
  this month, given it existed?" (amount). Different questions, no overlap. Deleting and
  recreating the expense loses the trace regardless — the history serves the case where the
  user *keeps* the same expense and only adjusts its value over time.

## Deletion — hard delete, no `active` (migration `0028`)

`fixed_expenses` is the **only table in the Budget/Fixed-Expense domain without the `active`
convention.** `deleteFixedExpense` (renamed from `deactivateFixedExpense`) runs a real
`DELETE`. This never touches the linked transaction/purchase —
`transactions.fixed_expense_id`/`card_purchases.fixed_expense_id` were always `ON DELETE SET
NULL`, so the `DELETE` just clears the link, leaving the real record intact and available to
re-link (via `getUnlinkedExpenseCandidates`/`linkExistingTransaction`).
`fixed_expense_amount_history` cascades (`ON DELETE CASCADE`).

(Different from `budgets`, which keeps soft-delete because a budget row can be a fixed
expense's floor and must stay recoverable; different from `reservoirs`' hard delete, which
happened for a different reason.)

## Link an already-registered payment

`PayFixedExpenseDialog`, in the "not yet paid" state, has a "Já lancei isso manualmente" mode:
instead of creating a payment it lists the user's `EXPENSE` rows with `fixed_expense_id IS
NULL`, filtered by the fixed expense's category when it has one, with a description search.
Choosing one does `UPDATE transactions SET fixed_expense_id = …` and nothing else (the
transaction's value/date/category are untouched). `getUnlinkedExpenseCandidates`/
`linkExistingTransaction`, read/called via Server Action on demand (not pre-loaded). For
recreating a fixed expense deleted by mistake without losing the trace of a payment already
logged.

---

# Money Reality Rules

**Only these affect financial totals**: `transactions`, `card_installments`, `card_payments`
(via their linked transaction), `card_refunds` (counts as INCOME for the month of
`refund_date`, and reduces the card's outstanding balance like a payment — see "Estorno").

**Never affect totals directly**: `reservoirs`/`reservoir_transactions`,
`debts`/`debt_transactions`, `budgets`, `fixed_expenses`, `goals`. They may appear in
informational panels; only the real transactions they eventually link to move analytics.

`TRANSFER`, `CREDIT_CARD_PAYMENT`, `RESERVE`, `REDEEM` never count as INCOME/EXPENSE — the
queries filter `type in ('INCOME','EXPENSE')`. A `CREDIT_CARD_PAYMENT` carrying `Pagamento de
Cartão`, or a `REDEEM` carrying `Resgate de Meta Concluída`/`Antecipado`, doesn't change this
— the category is a label, the `type` filter excludes the row. `RESERVE`/`REDEEM` do move
CASH/BANK account balances (like `TRANSFER`), just not income/expense totals.

**Goal yields count as INCOME** — `goal_yields` is real earned money, emitted by
`fetchPeriodEntries` as synthetic INCOME under `is_system` "Rendimentos" (no `transactions`
row — same shape as "Compras retroativas").

**One deliberate, documented exception**: the **dashboard's expense side** — the "Despesas
por categoria" donut, the DESPESAS summary card (and therefore Balanço Mensal), and the
viewed-month bar of Evolução mensal — projects the viewed month's **unpaid** `fixed_expenses`
and `PAYABLE` `OVERDUE_BILL`/`INSTALLMENT_PLAN` `debts` as synthetic EXPENSE entries, matching
the "Despesas de {mês}" card. Via `dashboard.service.ts#fetchUnpaidObligationEntries` (no
`transactions` rows created), passed through `fetchPeriodEntries`'s `obligationsMonth?` param.
Does **not** extend to the Explorador de Lançamentos, account balances, budgets'
`actualAmount`, or anything else. Skipped when an account filter is active, when the
`liquid`/`cards` expense-source toggle is set, or in an INCOME-only view;
category/subcategory/`uncategorizedOnly` filters are honored (debts have no subcategory → a
subcategory filter drops them).

---

# Money Precision

`numeric(14,2)` throughout. All arithmetic goes through `src/lib/utils/money.ts`. Installment
rounding remainder always applied to the first installment.

---

# LGPD (basic hygiene)

No LGPD `dado sensível` category (health, biometrics, political/religious/sexual orientation,
etc.) is stored. Financial data is still personal data in the general sense — RLS isolation,
HTTPS, and not storing third-party bank credentials cover the practical risk for a closed
friend group. A proper Terms of Use / Privacy Notice is recommended before the user base
grows beyond close friends; not a substitute for legal review.

---

# Design Goal

The system should let the user answer: Where am I spending the most? How did spending evolve?
Which categories are growing? What changed vs. last month? Designed for financial exploration
and insight, not just bookkeeping.
