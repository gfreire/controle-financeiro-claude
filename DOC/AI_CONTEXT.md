# Financial Control System — AI Context

This document explains the **domain rules and business logic** of the financial control system, so an AI code generator (Codex / Claude Code) implements system behavior correctly. Read together with `ARCHITECTURE.md`.

---

# System Purpose

Personal financial management system for the owner and a closed group of friends, each with **fully isolated data** (see "Multi-tenant / Access Model" in `ARCHITECTURE.md`). Not commercial. Focused on financial analysis and insight, not just record-keeping.

---

# Open Finance — decisão

Evaluated and **dropped**. Building a proprietary Open Finance integration is not just difficult, it is legally blocked: only Central-Bank-authorized financial/payment institutions can register as Open Finance participants in Brazil. Using a paid aggregator (Pluggy) was also ruled out — their commercial API for third-party users starts at R$ 2.500/month, unfeasible for a non-commercial friend project. OFX file import was considered as a lighter-weight alternative (no registration needed, most Brazilian banks support it) but is **deferred indefinitely** — not part of the current scope. All financial entry is manual for now.

---

# Core Entities

Accounts, Transactions, Credit Cards (Purchases/Installments/Payments), Categories, Subcategories, Reservoirs, Debts, Budgets, Fixed Expenses, Financial Institutions.

---

# Accounts

Real money locations. `type`: `CASH`, `BANK`, `CREDIT_CARD`. Each type has a 1:1 extension table for type-specific fields:

- `CASH` → `cash_accounts.initial_balance`
- `BANK` → `bank_accounts.initial_balance`, `bank_accounts.overdraft_limit`
- `CREDIT_CARD` → `credit_cards.closing_day`, `credit_cards.due_day`, `credit_cards.credit_limit` (optional)

`bank_accounts.initial_balance` was added after the fact (migration `0005`) — the original design only gave `CASH` an initial balance, which meant every new `BANK` account started at zero and needed an immediate `Ajustar Saldo` just to reflect reality. Both `CASH` and `BANK` now work the same way: `balance = initial_balance + SUM(transactions affecting the account)`.

`closing_day`/`due_day` are what allow the system to compute which invoice month (competence) a given purchase's installments fall into.

`credit_limit` (migration `0007`) is optional and **soft-enforced only** — a purchase that would push the card's outstanding balance past it doesn't get blocked; the UI shows a warning ("you may have forgotten to log the invoice payment, or made a mistake in this entry") and requires an explicit "insert anyway" acknowledgment before it proceeds. This is deliberate: a real payment not yet logged, or a genuine data-entry mistake, are both things the user needs to see and decide about, not be locked out of correcting.

Accounts may reference a `financial_institutions` catalog entry (global, no `user_id`) for branding — e.g. Banco do Brasil, Mercado Pago, Santander, Nubank. This is a plain lookup table, not a limiter: a user can have **any number** of accounts and credit cards, including several pointing at the same institution (e.g. a checking account plus multiple "cofrinhos"/poupanças at the same bank, or several credit cards).

`categories` carries a `color` and an `icon` field (emoji, same convention as the rest of the seed). `financial_institutions` carries only `color` — no `icon`, by choice: there's no emoji that meaningfully tells one bank apart from another, and reproducing real bank logos raises brand/IP concerns, so it was dropped rather than faked. Both fields are purely presentational — no business logic depends on them.

---

# Transactions

Types: `INCOME`, `EXPENSE`, `TRANSFER`, `CREDIT_CARD_PAYMENT`.

A single table models all four using `origin_account_id` + `destination_account_id`:

- `INCOME`: destination only.
- `EXPENSE`: origin only.
- `TRANSFER`: both — moving money between the user's own accounts. **Never included in analytics.**
- `CREDIT_CARD_PAYMENT`: origin = paying account, destination = credit card account.

Dashboard analytics only ever read from: `transactions` (INCOME/EXPENSE) and `card_installments`.

**`CREDIT_CARD_PAYMENT` has exactly one entry point**: the Cards page's "Pagar fatura" action (`cards.service.ts#registerCardPayment`), which creates the `transactions` row and the linked `card_payments` metadata row together. The manual transaction form (`/transactions`, and the Dashboard's "Novo lançamento") deliberately does **not** offer this type — only `EXPENSE`/`INCOME`/`TRANSFER` — so there's a single path to it instead of two UIs racing to do the same thing slightly differently. It also suggests the statement balance due through the current month (`getCardBalanceThroughMonth`), not the full lifetime balance including future installments not yet due.

---

# Credit Card Purchases / Installments / Payments

A card purchase (`card_purchases`) generates N rows in `card_installments`, one per installment, each with its own **competence date** — computed from `purchase_date` and the card's `closing_day`/`due_day`, never the raw purchase date itself.

**Central rule**: analytics always use installment competence date, never purchase date. Example: purchase on Feb 28, 3 installments → competence Mar/Apr/May, never counted in February.

The purchase form defaults the first installment's competence month to this automatic `closing_day`-derived calculation, but it's directly overridable (a month picker, not just a date) — the user might not remember the exact closing date, or the card behaves slightly differently than the formula assumes. The override replaces the anchor month only; the "add one month per subsequent installment" and rounding rules still apply on top of it (`calculateInstallmentCompetencesFromAnchorMonth` in `src/lib/utils/date.ts`).

`card_purchases` is metadata only (what was bought, total, installment count) — never a direct analytics source. Editing a purchase (amount, date, installment count, or the competence override) **rolls back and re-registers**: every installment is deleted and regenerated from the new values, never patched installment-by-installment — this is what keeps the rounding rule correct after an edit. Deleting a purchase cascades its installments (`ON DELETE CASCADE`).

`installment_number`/`total_installments` are **not stored columns** — derive by ordering a purchase's installments by `competence` (the total count is already `card_purchases.installments`). This ordering must be computed from **every** installment belonging to the purchase, not just whichever ones happen to fall inside a date-range filter being applied for display — filtering first and then numbering the filtered subset mislabels a purchase's 3rd installment as "1/N" whenever its 1st/2nd fall outside the filtered window. Number first (unfiltered), filter for display second.

Rounding: any remainder from dividing the purchase value into installments goes to the **first** installment, so the sum always matches the original amount exactly (e.g. 100 ÷ 3 = 33.34 / 33.33 / 33.33).

Paying the card bill (`card_payments`) creates both a `transactions` row (`type = CREDIT_CARD_PAYMENT`) and a `card_payments` metadata row linked to it via `transaction_id`.

---

# Categories and Subcategories

Categories = broad areas (Food, Housing, Transport). Subcategories = detail (Groceries, Restaurants).

**Income categories never have subcategories** — extra detail goes in the transaction's `description`, not a subcategory. Enforced in `src/lib/validations`, not by a database constraint.

## `is_default` vs `is_system` — two distinct, non-overlapping flags

Confirmed against the actual legacy implementation (both flags live on rows with `user_id IS NULL`, but they mean different things and never overlap):

- **`is_default = true`**: the onboarding starter pack (Moradia, Alimentação, Transporte, Financeiro, Dívidas, Salário, Investimentos, Recebimento de Dívida, etc.). At signup, the user picks which ones apply to their life; the system **copies** the selected rows (category + subcategories) into the user's own `user_id`. These rows are never queried directly by the app after that — they only exist to be copied once.
- **`is_system = true`**: a small, permanent, global catalog — **never copied, never editable, available to every user directly** (queried as `user_id = auth.uid() OR is_system = true`). Today this is `Juros` (EXPENSE), `Rendimentos` (INCOME), and `Ajuste` — which needs **two rows**, one `type = INCOME` and one `type = EXPENSE`, since `type` is required on every category — see "Juros, Rendimentos e Ajuste" below.

**There is no foreign key between an `is_default` copy and its source.** The only "link" is the name, informally, at copy time. Editing or deleting the user's copy never affects the catalog, and vice-versa. `is_system` rows are never copied at all — they stay global forever and every user's transactions can reference them directly.

Users can also create a category/subcategory **inline**, from within the transaction form or the card purchase form, without leaving the screen — a small popover (name, curated emoji icon, color) that creates the row and selects it in place, no navigation away from the form.

**Onboarding is implemented and reusable, not one-shot.** `/onboarding` shows a tree picker (category checkbox + nested subcategory checkboxes — uncheck one subcategory while keeping the rest of the category, e.g. keep "Moradia" but only "Aluguel", skip "IPTU"); a new signup lands there once a session exists, and `profiles.onboarding_completed` (migration `0004`) gates every other page via the `(app)` layout so it's reachable regardless of which path established the session (immediate signup vs. confirming email then logging in later). The same page reopens from Settings ("Importar categorias padrão") to pull in `is_default` categories skipped the first time — e.g. importing "Transporte" only once the user actually buys a car — and it diffs against the user's existing categories by `(type, name)` so already-imported ones never show up again to re-select (`categories.service.ts#getAvailableDefaultCategories`).

## Deleting a category or subcategory — guided reassignment

Categories and subcategories are never silently deleted while still in use. `category_id`/`subcategory_id` on `transactions`, `card_purchases`, `budgets`, `fixed_expenses`, and `reservoirs` are all nullable but **not** `ON DELETE CASCADE` or `SET NULL` — deleting a category/subcategory the database still finds referenced simply fails (default `RESTRICT`). This is deliberate: it forces every deletion through the app-level flow below, never a silent side effect.

Flow, triggered when the user asks to delete a category or subcategory:

1. The system counts every `transactions` and `card_purchases` row (and any `budgets`/`fixed_expenses`/`reservoirs` still configured to use it) referencing the category/subcategory, and shows a preview — e.g. the last 10 — so the user recognizes what they logged under it.
2. The user picks **one** action, applied to all affected rows in a single batch:
   - **Reassign** everything to a different category (and/or subcategory) the user picks.
   - **Fall back to the parent category** (subcategory deletion only) — clears `subcategory_id`, keeps `category_id`.
   - **Leave uncategorized** — clears both `category_id` and `subcategory_id`. The system already tolerates uncategorized transactions (a new user who hasn't set up categories yet, or simply didn't pick one) — this is not an error state.
3. Only after the batch update clears every reference does the actual `DELETE` run and succeed (the `RESTRICT` FKs guarantee this ordering — the delete cannot skip ahead of the reassignment).

---

# Juros, Rendimentos e Ajuste — categorias `is_system`

Three permanent global categories, never copied, always available directly to every user: `Juros` (EXPENSE), `Rendimentos` (INCOME), and `Ajuste` — this last one is **two separate rows** (`Ajuste`/INCOME and `Ajuste`/EXPENSE), since every category requires a `type`. Having the same name twice is fine here: category name uniqueness is scoped per `(user_id, type)`, not global — the two `Ajuste` rows sit in different "trees" (different type) so they don't collide. In the transaction list the user just sees "Ajuste" either way; the direction is already visible from the transaction's own amount/type.

## Name uniqueness (categories and subcategories)

Same literal name is only blocked **within the same tree**:

- `categories`: unique per `(user_id, type, name)` — a user can't have two `EXPENSE` categories both named "Mercado", but the same name can exist once per `type` (this is exactly why `Ajuste` needs two rows, not a conflict).
- `subcategories`: unique per `(category_id, name)` — "Outros" can exist under many different categories (different trees) with no conflict, but not twice under the same category.

This blocks only the **literal** duplicate name — semantically similar names are allowed side by side (e.g. `iFood` and `Delivery` under the same category is fine, even though they overlap in meaning).

## Juros — known-cause manual entry

Used as an ordinary category choice when the user knows exactly what generated the value:

- **Credit card interest**: when the invoice shows an interest charge, the user logs it as a plain `card_purchases` entry (1 installment) categorized `Juros` — no special mechanism, it flows through the existing purchase → installment pipeline like any other charge.

## Rendimentos — "informar rendimento" (check-in de cofrinho)

Routine, expected, small periodic entry the user triggers explicitly via an **"Informar Rendimento"** action on the account (a "cofrinho"/pocket that yields daily but that the user doesn't want to log day by day). The user enters the account's current real balance; the system compares it to the calculated balance (initial balance + all transactions affecting that account) and creates **one INCOME transaction, category `Rendimentos`, for the difference**.

Example: cofrinho starts at R$1.000. It yields daily — 92, 95, 94, 93, 98 centavos over 5 days — instead of logging 5 separate entries, once a week the user opens "Informar Rendimento", types the current balance (R$1.004,72), and the system logs a single R$4,72 INCOME/`Rendimentos` entry.

## Ajuste — balance reconciliation (anomalies / logging negligence)

A **separate** action (e.g. "Ajustar Saldo"), used when the gap is clearly **not** plausible yield — many untracked transactions accumulated, or the user simply lost track and wants to fix the number going forward without attributing a cause. Same underlying mechanic (enter the current real balance, system computes the difference against the calculated balance), but the resulting transaction is tagged `Ajuste` instead of `Rendimentos`.

Example: a R$1.000 cofrinho that somehow became R$2.500 after weeks of untracked movements (clearly not yield) — or the reverse, dropped to R$20 from untracked withdrawals the user doesn't want to reconstruct. Either way: enter the new value, system creates one INCOME or EXPENSE transaction (depending on the sign) categorized `Ajuste`.

**The choice between the two actions is the user's** — the system does not try to auto-detect whether a given gap "looks like" yield or an anomaly; it only computes the delta. Both share the same internal delta calculation in `accounts.service.ts`, exposed as two distinct entry points:

- `registerYield(accountId, realBalance)` → `Rendimentos`
- `reconcileAccountBalance(accountId, realBalance)` → `Ajuste` (the INCOME row or the EXPENSE row, matching the transaction's own type)

- Difference zero on either action → nothing is created.

No new table — both are a normal `createTransaction` call under the hood. Scope: primarily `BANK` accounts; confirm before extending to `CREDIT_CARD` (revolving interest interacts with installments differently and isn't speced yet).

**Dashboard signal**: because a high `Ajuste` share is itself useful information (it means the user isn't logging carefully), the dashboard should surface how much of the period's total sits under `Ajuste` — not as a hard rule, but as a visible warning so the user notices their own bookkeeping is getting loose.

---

# Reservoir (Cofre)

Represents accumulated value that is **not yet real money** — projected or already-earned-but-not-yet-received income. Originated from the owner's own work pattern (freelance/session-based income: poker cash game and tournament earnings, but the model is generic — applies equally to e.g. a weekly-paid freelancer).

`reservoirs` is the header (name + an optional default `category_id`/`subcategory_id`, used to pre-fill the category when the money is withdrawn). `reservoir_transactions` is the ledger:

- **Accumulation entries** (`amount` positive): logged as soon as the user knows/estimates a value — e.g. today's tournament fixed pay, or a cash game session's expected net cut. No separate "pending vs confirmed" status exists; every entry is just a value in the ledger.
- **Withdrawal entries** (`amount` negative): logged when money is actually received, moved to a real account. Creates a linked `transactions` (or `card_purchases`) row via `linked_transaction_id`/`linked_card_purchase_id`.

**The withdrawal amount does not need to match the accumulated total exactly.** Real-world payouts can differ slightly from what was projected (e.g. cash rounding). The reservoir balance (`SUM(reservoir_transactions.amount)`) simply carries the difference forward — no reconciliation step is required.

**Gross/percentage/net split (accrual entries only)**: three optional, related fields on an accrual entry — `grossAmount`, `percentage`, and `amount` (the net, the field that already exists and always drives the reservoir balance). The relationship: `amount = grossAmount × (percentage / 100)`.

- Filling in just `amount` (net) alone is the default, simplest case — nothing else required.
- `grossAmount` is always a direct, user-entered value when used — it is **never** auto-calculated from the other two.
- `percentage` and `amount` are the dependent pair: whichever of the two the user is *not* actively editing gets recalculated from the other, given `grossAmount` is present — same reactive pattern already used for editing card installments on insertion. E.g. gross = 600, user types percentage = 75 → `amount` recalculates to 450 automatically; if the user instead edits `amount` directly (gross already set), `percentage` recalculates instead. This generalizes to any percentage-based deduction taken at the source (common across freelance-style income, not poker-specific).
- Validation: whenever `grossAmount` is filled, `grossAmount >= amount` (a cut can't leave you with more than the gross). `percentage`, when filled, is between 0 and 100.
- None of this is required — a plain `amount`-only entry remains fully valid.

Otherwise, when gross/percentage don't matter, the detail can just live in `description`.

Reservoir must **never** affect account balances, income/expense totals, or dashboard analytics — only a withdrawal (which creates a real transaction) does.

---

# Debts

Types: `PAYABLE` (owed by the user) and `RECEIVABLE` (owed to the user). `debts.initial_balance` seeds the starting amount; the current `remainingBalance` is **never a stored column** — always `initial_balance + SUM(debt_transactions.amount)`, computed in the service layer (may be backed by a SQL view for performance).

`debt_transactions` is the ledger, mirroring `reservoir_transactions`:

- `amount` positive = the debt increased (borrowed/lent more).
- `amount` negative = a payment reduced the debt.

**`linked_transaction_id` is optional in both directions**, depending on whether real money passed through a tracked account:

- If cash or a PIX enters/leaves one of the user's own accounts, a `transactions` row is created and linked. This deliberately mirrors `TRANSFER` semantics conceptually (money moves, but it must not be counted as INCOME/EXPENSE — it is not real gain/loss, it is a loan).
- If a third party pays a bill directly on the user's behalf (e.g. a parent pays a boleto or the mechanic directly), only the `debt_transactions` entry exists — no money ever touched a tracked account, so no `transactions` row is created.

Paying down a debt with the user's own money **always** creates a linked transaction (real money genuinely leaves a tracked account, so it must be reflected).

Debts never affect dashboard totals directly — only the linked transactions they may generate do.

---

# Budgets

A **standing target** per category/subcategory (`budgets.amount`) — not a per-month row. The month is a query parameter when the service aggregates, never a database column.

- Never generates a transaction. Purely informational — reflects into alerts and the dashboard, and exists only for planning.
- `actualAmount` = real sum of that category's transactions + installments in the queried month.
- `status = EXCEEDED` whenever `actualAmount > plannedAmount`. Does not block anything, only alerts.
- Example: Mercado (groceries) budget of R$800/month — dashboard shows real progress (e.g. "600/800") as the month goes on; exceeding it only triggers an alert, spending isn't capped.

---

# Fixed Expenses (recurring)

A **separate entity** from Budgets, for genuinely fixed recurring bills (rent, streaming, subscriptions) — `fixed_expenses.amount`, `due_day`, optional `default_account_id`.

- Before the real payment is registered this month, the dashboard shows the **planned amount as a placeholder** (`projectedAmount = plannedAmount`) so the monthly total reflects the expected expense even before the due day.
- Once a real `transactions` row is registered and linked via `fixed_expense_id`, the dashboard switches to showing that **real value** (`projectedAmount = actualAmount`) — this avoids ever double-counting the placeholder and the real transaction together.
- If the real value ends up higher than planned, it shows the real (larger) number plus an `EXCEEDED` alert.
- **Long-term unpaid/overdue fixed expenses are out of automatic scope.** If a bill goes unpaid across months, the intended path is a manual `Debt` entry — the system does not attempt to auto-roll an unpaid fixed expense forward.
- Never generates a transaction on its own; the user (or, in the future, an import) always creates the real `transactions` row.

---

# Money Reality Rules

Only these affect financial totals: `transactions`, `card_installments`, `card_payments` (via their linked transaction).

Never affect totals directly: `reservoirs`/`reservoir_transactions`, `debts`/`debt_transactions`, `budgets`, `fixed_expenses`. They may appear in informational panels, but only the real transactions they eventually link to move the needle on analytics.

---

# Money Precision

`numeric(14,2)` throughout. All arithmetic goes through `src/lib/utils/money.ts`. Installment rounding remainder always applied to the first installment.

---

# LGPD (basic hygiene)

No sensitive data category (LGPD's `dado sensível` list: health, biometrics, political/religious/sexual orientation, etc.) is stored. Financial data is still personal data under LGPD in the general sense — RLS isolation, HTTPS, and not storing any third-party bank credentials cover the practical risk for a closed friend group. A proper Terms of Use / Privacy Notice is recommended before the user base grows beyond close friends; this is not a substitute for actual legal review.

---

# Design Goal

The system should let the user answer: Where am I spending the most? How did spending evolve? Which categories are growing? What changed vs. last month? Designed for financial exploration and insight, not just bookkeeping.
