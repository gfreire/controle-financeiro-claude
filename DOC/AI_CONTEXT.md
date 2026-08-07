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

**`credit_limit` and `bank_accounts.overdraft_limit` are both user-editable at any time**, via a dedicated quick action ("Ajustar Limite") mirroring the existing "Ajustar Saldo" pattern (a small dialog off the account, not a full account-edit form) — decided and implemented 2026-08-07 (`src/features/accounts/components/limit-adjust-dialog.tsx`). Banks routinely raise or cut these limits outside the user's control (temporary increase, revolving-credit renegotiation, etc.), so locking either value to account-creation time drifts from reality almost immediately. Same soft-enforce philosophy carries over: changing the limit never rewrites past purchases or warnings already shown, it only changes the threshold used for *future* soft-limit checks.

**For `CREDIT_CARD` accounts, this same dialog also edits `closing_day`/`due_day`** — decided and implemented 2026-08-07, at the user's request ("pode ser o mesmo menu ou um diferente do editar limite... só mudar o label"). The invoice closing/due dates are just as subject to change by the bank as the limit is, and both live on the same `credit_cards` extension row, so one quick-action dialog (labeled "Ajustar Cartão" for cards, still "Ajustar Limite" for banks) covers all three fields in a single save instead of needing a separate flow per field.

**CASH accounts never show an institution selector in the account form** — decided and implemented 2026-08-07: cash in hand isn't tied to a bank, so offering the picker was confusing. `institution_id` stays a valid nullable column for `CASH` rows at the schema level (no constraint added — a user could theoretically still set it via direct DB access), the change is UI-only: `account-form-dialog.tsx` conditionally hides the field once `type === 'CASH'` (and clears any previously-picked institution on switching a form to CASH).

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

The payment form has no description field (it's a fixed action: card, paying account, amount, date), so `registerCardPayment` defaults the transaction's `description` to `"Pagamento da fatura do cartão {nome do cartão}"` server-side (fixed 2026-08-07) — previously it stayed `null`, showing as blank/"Sem descrição" everywhere the column is displayed or searched.

---

# Credit Card Purchases / Installments / Payments

A card purchase (`card_purchases`) generates N rows in `card_installments`, one per installment, each with its own **competence date** — computed from `purchase_date` and the card's `closing_day`/`due_day`, never the raw purchase date itself.

**Central rule**: analytics always use installment competence date, never purchase date. Example: purchase on Feb 28, 3 installments → competence Mar/Apr/May, never counted in February.

The purchase form defaults the first installment's competence month to this automatic `closing_day`-derived calculation, but it's directly overridable (a month picker, not just a date) — the user might not remember the exact closing date, or the card behaves slightly differently than the formula assumes. The override replaces the anchor month only; the "add one month per subsequent installment" and rounding rules still apply on top of it (`calculateInstallmentCompetencesFromAnchorMonth` in `src/lib/utils/date.ts`).

`card_purchases` is metadata only (what was bought, total, installment count) — never a direct analytics source. Editing a purchase (amount, date, installment count, or the competence override) **rolls back and re-registers**: every installment is deleted and regenerated from the new values, never patched installment-by-installment — this is what keeps the rounding rule correct after an edit. Deleting a purchase cascades its installments (`ON DELETE CASCADE`).

`installment_number`/`total_installments` are **not stored columns** — derive by ordering a purchase's installments by `competence` (the total count is already `card_purchases.installments`). This ordering must be computed from **every** installment belonging to the purchase, not just whichever ones happen to fall inside a date-range filter being applied for display — filtering first and then numbering the filtered subset mislabels a purchase's 3rd installment as "1/N" whenever its 1st/2nd fall outside the filtered window. Number first (unfiltered), filter for display second.

Rounding: any remainder from dividing the purchase value into installments goes to the **first** installment, so the sum always matches the original amount exactly (e.g. 100 ÷ 3 = 33.34 / 33.33 / 33.33).

Paying the card bill (`card_payments`) creates both a `transactions` row (`type = CREDIT_CARD_PAYMENT`) and a `card_payments` metadata row linked to it via `transaction_id`.

**Two different "how much is used" figures, on purpose (decided and implemented 2026-08-07).** The Cards page shows a card's usage two ways, and they must not be conflated:
- **Against the credit limit** (`CardSummaryDTO.totalCommitted`, `cards.service.ts#getCardTotalCommitted`): every installment ever generated for the card — past, current, *and future not-yet-due* — minus every payment ever made. This is the correct figure for "how much of my limit is used," because a real card issuer counts an installment plan against the limit the moment it's committed, not only once each installment individually comes due.
- **What to actually pay right now** (`CardSummaryDTO.usedThroughCurrentMonth`, `getCardBalanceThroughMonth`): installments with competence through *today's real month* minus payments — deliberately excludes future installments not yet due. This is what "Pagar fatura" suggests, and it stays anchored to today's real month even while the Cards page is browsing a different month via its `MonthNav` filter — paging through history to look at a past invoice must never change what a real payment made today should be.

`currentMonthInvoice` is a third, separate figure: the sum of installments whose competence falls in whichever month the page's `MonthNav` is currently viewing — this one *does* follow the filter (fixed 2026-08-07; it used to silently ignore the filter and always show today's real month regardless of what the user was browsing).

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

No new table — both are a normal `createTransaction` call under the hood. Both actions default the transaction's `description` to `"Informar Rendimento — {conta}"`/`"Ajustar Saldo — {conta}"` (fixed 2026-08-07) — previously the account name wasn't included, so two "Ajustar Saldo" rows on different accounts in the same list read identically until clicked into.

**`registerYield` ("Informar Rendimento") is `BANK`-only — decided and implemented 2026-08-07, `CASH` is explicitly excluded.** Physical cash in hand does not yield on its own; offering the action on a `CASH` account implied a behavior that can never actually happen. `reconcileAccountBalance` ("Ajustar Saldo") stays available for **both** `CASH` and `BANK` — miscounting cash in a wallet, or losing track of a drawer, is a legitimate reconciliation case, just never one attributable to yield. `CREDIT_CARD` remains out of scope for either action (revolving interest interacts with installments differently and isn't speced yet).

**Dashboard signal**: because a high `Ajuste` share is itself useful information (it means the user isn't logging carefully), the dashboard should surface how much of the period's total sits under `Ajuste` — not as a hard rule, but as a visible warning so the user notices their own bookkeeping is getting loose.

---

# Reservoir (Cofre) — displayed as "Receita Programada"

Represents accumulated value that is **not yet real money** — projected or already-earned-but-not-yet-received income. Originated from the owner's own work pattern (freelance/session-based income: poker cash game and tournament earnings, but the model is generic — applies equally to e.g. a weekly-paid freelancer).

**Renamed in the UI to "Receita Programada" — decided and implemented 2026-08-07, at the user's request.** "Reservatórios" with a water-droplet icon didn't read as what the feature actually is (nothing to do with water/liquid volume), and the mismatch was confusing even though the underlying feature itself was considered good as-is. This was a **display-only** rename: the route (`/reservoirs`), table names (`reservoirs`, `reservoir_transactions`), service (`reservoirs.service.ts`), DTOs (`ReservoirDTO`, `ReservoirTransactionDTO`), and all internal identifiers are unchanged by design — only user-facing Portuguese strings and the nav icon changed (`Droplets` → `Vault`, chosen over reusing `PiggyBank`/`HandCoins` since those are already Orçamentos/Dívidas' icons and reusing one would hurt nav scannability). If a future session needs to touch this feature, search the codebase for `reservoir`, not `receita programada` — the display name is a label, not a rename of the domain concept.

`reservoirs` is the header (name + an optional default `category_id`/`subcategory_id`, used to pre-fill the category when the money is withdrawn). `reservoir_transactions` is the ledger:

- **Accumulation entries** (`amount` positive): logged as soon as the user knows/estimates a value — e.g. today's tournament fixed pay, or a cash game session's expected net cut. No separate "pending vs confirmed" status exists; every entry is just a value in the ledger.
- **Withdrawal entries** (`amount` negative): logged when money is actually received, moved to a real account. Creates a linked `transactions` (or `card_purchases`) row via `linked_transaction_id`/`linked_card_purchase_id`.

**The withdrawal amount does not need to match the accumulated total exactly.** Real-world payouts can differ slightly from what was projected (e.g. cash rounding). The reservoir balance (`SUM(reservoir_transactions.amount)`) simply carries the difference forward — no reconciliation step is required.

**Default description names the reservoir (decided and implemented 2026-08-07, same convention as Dívidas' "Movimentação da dívida {agent}").** When left blank, both accrual and withdrawal entries — and the linked `transactions` row a withdrawal creates — default to `"Movimentação da receita programada {nome}"` instead of a generic/unattributed message (previously a withdrawal without an explicit description fell back to the bare "Saque de reservatório", with no way to tell which one from the transaction list alone). `reservoirs.service.ts#addReservoirTransaction`/`withdrawReservoir` apply this server-side; the accrual dialog also pre-fills the same text into its description field so the user sees and can edit it before saving (the withdrawal dialog has no description field of its own, so it always relies on the server-side default, same as `CREDIT_CARD_PAYMENT` below).

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

**Default description names the debt (decided and implemented 2026-08-07).** When the user leaves a debt transaction's description blank, both the ledger row and its linked `transactions` row (if any) default to `"Movimentação da dívida {agent}"` instead of a generic, unattributed message — `debts.service.ts#addDebtTransaction` fills this in server-side, and `DebtTransactionDialog` also pre-fills the same text into the form field so the user sees (and can edit) it before submitting, rather than it only appearing after the fact.

**Settling a debt to zero is a soft delete, decided and implemented 2026-08-07.** `addDebtTransaction` recomputes the debt's real remaining balance immediately after inserting the ledger entry; if it's `<= 0`, the debt is deactivated (`active = false`) and drops out of `getDebts()` — the same `active` convention used everywhere else in the schema, not a new mechanism. Overpaying is deliberately not an error: a debt of R$1.000 settled with a R$1.100 payment is treated as intentional (e.g. interest the payer/creditor decided to fold in) — it still zeroes the debt out, just leaving that extra R$100 as the transaction's real recorded value. What matters is that the user isn't surprised: `DebtTransactionDialog` predicts, from the debt's current balance, whether the payment being entered would settle or overpay it, and if so shows a warning *before* submitting (exact settlement: "this payment quits this debt, it'll leave the list"; overpayment: names the excess and asks whether that's intentional) and requires a second, explicit "Confirmar quitação" click — never a silent disappearance. The actual deactivation decision is still made server-side from the real post-insert balance, not the client's prediction, so it stays correct even if they ever disagree (e.g. a concurrent entry).

**The Dívidas page opens with two simple pie charts** ("Dívidas a pagar", "Dívidas a receber" — one per `side`), each showing the active debts of that side by remaining balance. Either pie is omitted entirely when its side has no debts with a positive balance to show — there is no empty/placeholder chart. Purely a visual summary; no new aggregation beyond what `getDebts()` already computes per debt.

---

# Budgets

A **standing target** per category/subcategory (`budgets.amount`) — not a per-month row. The month is a query parameter when the service aggregates, never a database column.

- Never generates a transaction. Purely informational — reflects into alerts and the dashboard, and exists only for planning.
- `actualAmount` = real sum of that category's transactions + installments in the queried month.
- `status = EXCEEDED` whenever `actualAmount > plannedAmount`. Does not block anything, only alerts.
- Example: Mercado (groceries) budget of R$800/month — dashboard shows real progress (e.g. "600/800") as the month goes on; exceeding it only triggers an alert, spending isn't capped.

## Budget hierarchy — category vs. subcategory, and the fixed-expense floor

**Decided and implemented 2026-08-07** (`src/services/_shared.ts#reconcileBudgetFloors`/`getCategoryBudgetFloor`/`getSubcategoryBudgetFloor`, called from `budgets.service.ts` and `fixed-expenses.service.ts`). This section is the reasoning behind that implementation, not a spec still waiting to be built.

Fixed Expenses are, functionally, a special case of Budget: a fixed expense is a *committed, non-negotiable slice* of whatever a category is allowed to spend. It makes no sense for a category's budget to be smaller than the fixed expenses already registered under it — that would mean the "plan" contradicts a bill the user has already committed to. This motivated folding Fixed Expenses and Budgets into one coherent hierarchy instead of two disconnected entities that happen to share a category:

- A budget can be set at the **category** level (`subcategory_id IS NULL`) or at the **subcategory** level (`subcategory_id` set). This was already possible in the schema (`BudgetDTO.subcategoryId` is optional) — what's new is treating the two levels as *nested*, not independent.
- **Nesting invariant**: a category's budget amount must always be `>=` the sum of (a) every subcategory budget under that category, and (b) every fixed expense attached directly to that category (no subcategory). Symmetrically, a subcategory's budget must be `>=` the sum of fixed expenses attached to that specific subcategory. The gap between a category's budget and the sum of its subcategory budgets is *unallocated* headroom — spending trackable to the category but not to any specific subcategory.
  - Example (user-supplied): category "Alimentação" budget = R$1200. User sets subcategory "Restaurante" = R$600 and "Delivery" = R$400. That leaves R$200 of "Alimentação" unallocated to any subcategory — still valid spending room, just not earmarked. If the user then sets "Mercado" = R$600, the subcategory sum (600+400+600=1600) exceeds the category budget (1200) — see the auto-raise rule below.
- **Editing a budget downward is a hard block, not a warning** (deliberately inconsistent with the credit-limit soft-enforce pattern — this one is a hard constraint because a budget number that contradicts its own committed children is simply wrong, not a "maybe forgot something" judgment call). If the user tries to save a category or subcategory budget below the sum of its children (fixed expenses + subcategory budgets, per the invariant above), the save must fail with a clear validation error naming the floor amount — never silently clamp or partially apply.
- **Registering or editing a fixed expense auto-reconciles the relevant budget upward, with a notification, never a block**:
  1. If the fixed expense's category (or subcategory, if set) has no budget yet, create one with `amount` = the sum of all active fixed expenses now attached to that category/subcategory.
  2. If a budget already exists and is `>=` that sum, leave it untouched.
  3. If a budget already exists and is `<` that sum, raise it to match the new sum and surface a notification to the user (e.g. "Orçamento de Moradia foi aumentado para R$1.600 para acomodar a despesa fixa 'Aluguel do carro'"). This is the same "Alimentação" example from above, generalized: the category ceiling stretches to keep containing its committed children, it never shrinks on their account.
- **Paying a fixed expense already reflects in its budget's `actualAmount` today, with no extra plumbing needed** — a fixed-expense payment is just a normal `transactions` row tagged with the fixed expense's `category_id`/`subcategory_id` via `fixed_expense_id`, and `BudgetDTO.actualAmount` already sums *all* transactions/installments in that category for the month, fixed or not. The only genuinely new behavior here is the floor/auto-raise mechanics above.
- **Tree-based budget-entry screen**: `src/features/budgets/components/budget-tree-editor.tsx` ("Planejar orçamentos", on `/budgets`), structurally reusing the onboarding category-tree-picker's visual pattern — instead of checkboxes selecting which categories to import, each category/subcategory row gets an amount input, so a user can plan "Alimentação: 1200, ↳ Restaurante: 600, ↳ Delivery: 400" in one screen instead of one dialog per row. Sits alongside the single-row `budget-form-dialog.tsx` (used for one-off edits), not a replacement for it — both call the same `createBudgetAction`/`updateBudgetAction`, so the floor validation runs identically either way.
- This rule applies identically to subcategory budgets — a subcategory is just one level further down the same nesting invariant, not a special case.

---

# Fixed Expenses (recurring)

Functionally a **specialized, committed slice of a Budget** for genuinely fixed recurring bills (rent, streaming, subscriptions) — `fixed_expenses.amount`, `due_day`, optional `default_account_id`. See "Budget hierarchy" above for how the two interact: a fixed expense's amount is always a floor on its category/subcategory's budget, auto-raised on registration, never silently allowed to exceed the budget without reconciling it.

- Before the real payment is registered this month, the dashboard shows the **planned amount as a placeholder** (`projectedAmount = plannedAmount`) so the monthly total reflects the expected expense even before the due day.
- Once a real `transactions` row is registered and linked via `fixed_expense_id`, the dashboard switches to showing that **real value** (`projectedAmount = actualAmount`) — this avoids ever double-counting the placeholder and the real transaction together. This same transaction is what feeds the parent budget's `actualAmount`, since both aggregate from the same `transactions`/`card_installments` rows for the category/subcategory/month.
- If the real value ends up higher than planned, it shows the real (larger) number plus an `EXCEEDED` alert.
- **Long-term unpaid/overdue fixed expenses are out of automatic scope.** If a bill goes unpaid across months, the intended path is a manual `Debt` entry — the system does not attempt to auto-roll an unpaid fixed expense forward.
- Never generates a transaction on its own; the user (or, in the future, an import) always creates the real `transactions` row.
- The "Registrar pagamento" dialog (`pay-fixed-expense-dialog.tsx`) has no free-text description field — it passes `"Pagamento — {nome da despesa fixa}"` as the transaction's description by default (fixed 2026-08-07), so the row reads clearly in Lançamentos/Dashboard instead of showing blank.

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
