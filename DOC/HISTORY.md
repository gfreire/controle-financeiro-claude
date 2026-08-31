# Decision & Change History

**This file is NOT auto-loaded by `CLAUDE.md`.** It is the archaeology archive: the dated
chronology of how decisions were reached, the corrections made mid-design, resolved bug
reports, and verbose per-migration prose that used to live in `AI_CONTEXT.md` /
`ARCHITECTURE.md`.

Read a section here only when a current rule in the loaded docs seems arbitrary and you need
to know *why* it is the way it is before changing it — or when a future session wonders
whether something was considered and rejected. The loaded docs (`AI_CONTEXT.md`,
`ARCHITECTURE.md`, `AI_GENERATION_RULES.md`) plus `schema.sql`/`seed.sql` and the migration
files are the source of truth for **current** state; this file only explains the path taken.

Nothing here is required reading to make a change correctly. It exists so that "why is it
like this?" has an answer that isn't "git blame across 200 commits".

---

# Documentation split (2026-08-31)

`AI_CONTEXT.md` and `ARCHITECTURE.md` had grown to ~89k tokens combined, auto-loaded every
session. The bulk was chronology — "decided X, corrected Y, revised Z" with full before/after
reasoning — valuable while a decision churns, dead weight once it stabilises. That narrative
was moved here; the loaded docs were rewritten to current-state rules plus the load-bearing
"why chose X over Y". No rule was dropped. If a loaded-doc section looks thin, its history is
in the matching section below.

---

# Accounts

- **`bank_accounts.initial_balance`** (migration `0005`) — the original schema only gave
  `CASH` an initial balance, so every new `BANK` account started at zero and needed an
  immediate `Ajustar Saldo` just to reflect reality. Now both `CASH` and `BANK` work the same:
  `balance = initial_balance + SUM(transactions affecting the account)`.
- **`closing_day`/`due_day` tightened 1-31 → 1-28** (decided 2026-08-09) — the same
  simplification real card issuers make, so a card closing on the 30th never has to
  special-case February. Enforced in `src/lib/validations/accounts.ts` + HTML `min`/`max`.
- **`credit_limit` required + `> 0`** — added optional in migration `0007`, made
  `NOT NULL CHECK (credit_limit > 0)` in migration `0008` (decided 2026-08-08, reversing the
  "optional" design). What stays soft-enforced is only the *purchase-exceeds-limit* warning,
  never the limit's presence.
- **Limit/overdraft editable anytime** (decided 2026-08-07) — banks routinely raise/cut these
  outside the user's control, so locking them to account-creation time drifts from reality
  immediately. Changing the limit never rewrites past purchases or warnings already shown.
- **"Editar Conta"/"Editar Cartão" dialog** — was `"Ajustar Limite"`/`"Ajustar Cartão"`,
  BANK/CREDIT_CARD only, limit + closing/due day only. 2026-08-07 it also took over
  closing/due-day editing for cards ("pode ser o mesmo menu... só mudar o label"). 2026-08-28
  it was renamed and extended to edit `name` + `institution_id` too, and shown for `CASH`
  as well (name-only) — closing the "no general account-level edit dialog" gap without a
  separate full-edit form. Internal file/component name `limit-adjust-dialog.tsx` /
  `LimitAdjustDialog` kept (display-only-rename precedent, same as Reservoir). `updateAccount`
  already accepted partial `name`/`institutionId`, so this was almost entirely UI.
- **`CREDIT_CARD` accounts show `totalCommitted / creditLimit` on the Accounts page**
  (decided 2026-08-08) — `AccountCard` used to show the meaningless `account.balance` for a
  card. Now it calls the same `getCardSummary` the Cards page uses so the two pages can't
  disagree.
- **Inconsistency warning icon** (2026-08-28) — a red icon-only `TriangleAlert` on
  `AccountCard` (`getInconsistency`, a pure figure comparison, not aggregation) for CASH
  negative / BANK past overdraft / card committed past `creditLimit`.
- **CASH accounts hide the institution selector** (2026-08-07) — cash in hand isn't tied to a
  bank; `institution_id` stays a valid nullable column at the schema level, the change is
  UI-only.

# Transactions

- **Default descriptions** for system-generated transactions that name an entity but have no
  free-text field (fixed 2026-08-07): `registerCardPayment` →
  `"Pagamento da fatura do cartão {nome}"`; `addReservoirTransaction`/`withdrawReservoir` →
  `"Movimentação da receita programada {nome}"`; `registerYield`/`reconcileAccountBalance` →
  `"Informar Rendimento — {conta}"`/`"Ajustar Saldo — {conta}"`; `payFixedExpense` →
  `"Pagamento — {nome}"`; `addDebtTransaction` → `"Movimentação da dívida {agent}"`.
  Previously several left `description` null or a generic string, showing blank/indistinct.
- **`CREDIT_CARD_PAYMENT` has one entry point** (Cards page "Pagar fatura") — the manual
  transaction form deliberately doesn't offer the type, so there's one path instead of two
  UIs doing the same thing slightly differently.

# Credit cards

- **Competence formula bug** (fixed 2026-08-23): `calculateInstallmentCompetences` only ever
  did step 1 (which billing cycle a purchase falls into — after `closing_day` rolls into the
  cycle closing the *following* month). Step 2 (which calendar month that cycle's invoice is
  actually due in) was missing. No-op when `due_day > closing_day` (the common case), wrong
  for e.g. closes-28th/due-10th: a purchase on Aug 23 belongs to the invoice due **Sep 10**,
  not Aug 10. Fixed by adding `dueMonthOffset = dueDay <= closingDay ? 1 : 0`. Only affects
  the *default suggested* competence on new/edited purchases — stored `card_installments.competence`
  is only regenerated on an actual edit, never recomputed live. A future session: any
  *unedited* purchase on a `due_day <= closing_day` card, created before this fix and never
  manually overridden, may still carry a stale one-month-early competence.
- **`PurchaseFormDialog` suggested today's month on open** (fixed 2026-08-26) —
  `suggestCompetence` only fired from the date/card `onChange` handlers; the field's initial
  value and post-create reset both hardcoded `monthKey(todayIso())`. Fixed by extracting
  `initialCompetenceMonth(purchaseDate, card)` and using it in all three places.
- **Two "how much used" figures split in meaning** (2026-08-07): `totalCommitted`
  (`getCardTotalCommitted`, every installment incl. future not-yet-due, minus payments) is
  the against-the-limit figure; `usedThroughCurrentMonth` (`getCardBalanceThroughMonth`,
  through today's real month) drives the "Pagar fatura" suggestion and stays anchored to
  today regardless of the page's month filter. `currentMonthInvoice` follows the `MonthNav`
  filter (previously it silently ignored the filter). The Cards "usado/total" line was
  switched from `usedThroughCurrentMonth` to `totalCommitted` in the same change.
- **Compras retroativas** (migration `0014`, 2026-08-10) — lets a user register a card
  purchase from before they started using the system with a prefix of installments already
  paid outside it. `card_purchases.paid_through_competence` → `card_installments.paid_before_system`
  (contiguous prefix). Originally the computed INCOME was a loose figure
  (`fetchRetroactiveIncomeEntries`) feeding only `getFinancialSummary`/`getMonthlyEvolution`,
  kept out of the category charts because it had no category to group under — so the income
  donut showed a smaller total than the monthly-evolution income bar with no visible reason.
  Fixed 2026-08-28 the same way `Estorno` was: migration `0030` adds the `is_system` INCOME
  category "Compras retroativas" (one row), `fetchPeriodEntries` emits those installments as
  INCOME entries tagged with it, `fetchRetroactiveIncomeEntries` removed. Filter-semantics
  change: the dashboard category filter now matches the system-category id, not the
  purchase's spending category.
- **`retroactiveIncomeShare`/`refundShare`/`adjustmentShare` → `*Amount`** (2026-08-28) —
  the badges showed a `%` of `periodTotal`; the user found "porcentagem é muito dificil de
  ler". Switched to raw R$ (`formatCurrency`), no calculation change, `periodTotal` dropped
  from `getFinancialSummary`. Then the Estorno and Compras-retroativas badges were removed
  from the UI entirely ("mais rastro contábil do que alerta") — only "Ajuste" stays, always
  `variant="warning"` (lost its `> 15%` threshold). `refundAmount`/`retroactiveIncomeAmount`
  stay in the DTO with no UI consumer.
- **Fatura pago/parcial** (2026-08-12) — `card_payments` has no competence column, so
  "how much of THIS month's invoice is paid" is derived (`currentMonthPaidAmount`,
  oldest-competence-first allocation — the same assumption `getCardBalanceThroughMonth`
  already made). Heuristic, not a real allocation: a payment meant to prepay a future month
  still shows as clearing the oldest first. `invoice-paid-badge.tsx` shared by `/cards` and
  `AccountCard`.
- **Open-invoice line** (2026-08-23) — both screens showed one invoice line tied to the
  viewed month, which conflates "the invoice being displayed" with "the invoice still open
  now" once `closing_day` has passed. `openInvoiceMonth`/`openInvoiceAmount` (anchored to
  today) render a second line only when it differs from the first.
- **Estorno credit made visible + auto-abate** (2026-08-28) — originally `card_refunds` was
  only seen by `getCardBalanceThroughMonth`/`getCardTotalCommitted`, so a 100%-refunded
  invoice still showed as debt in `currentMonthInvoice`/`InvoicePaidBadge`/"Despesas do
  mês", and a credit above the billed total was hidden by `Math.max(0, …)`. Now
  `currentMonthPaidAmount` includes refunds (excess cascades forward), `creditBalance`
  (>= 0) exposes the "saldo a favor". `getCardBalanceThroughMonth`/`getCardTotalCommitted`
  keep the `Math.max(0, …)` — the negative sign lives only in `creditBalance`.
- **`refundCardPurchase` advances not-yet-billed installments** (decided 2026-08-23 after
  the user reported a real Amazon-card refund: the 1st installment was already billed/paid
  and left alone, installments 2+ were all advanced by the issuer at once to the invoice
  open at refund time, along with the full credit). Multiple installments can end with the
  same `competence` — matches the real invoice; "N/total" numbering is cosmetically
  ambiguous but affects no total.
- **`advancePurchaseInstallments`** (2026-08-23) — first version treated "antecipar" as a
  payment; corrected the same day: it only remaps *when* installments bill (like
  `refundCardPurchase`), never creates a payment. To actually pay the now-current
  installments the user still uses "Pagar fatura".
- **`getDefaultCardsMonth`** (2026-08-28) — `/cards` used to always open on today's month.
  Now opens on *next* month when `getCardBalanceThroughMonth(card, todayMonth) === 0` for
  every card AND next month has installments. Deliberately based on
  `getCardBalanceThroughMonth` (nets out payments and refunds), not the
  `currentMonthInvoice`/`currentMonthPaidAmount` pair (which doesn't discount refunds).
- **Cards empty-state shortcut** (2026-08-24) — `/cards` with zero cards only showed static
  text pointing at Contas. The button now goes to `/accounts?newAccountType=CREDIT_CARD`,
  which `AccountsPage` reads into `AccountFormDialog`'s `initialOpen`/`initialType`.

# Categories

- **Re-import picker shows the FULL `is_default` catalog** (2026-08-08) — previously
  `getAvailableDefaultCategories` diffed against the user's own categories and hid
  already-imported ones, so there was no way to add a subcategory skipped under a category
  you already had. `getDefaultCategoryImportOptions` now returns everything with an
  `alreadyImported` flag; already-imported items render checked+disabled (browser omits
  disabled checkboxes from `FormData`, so the action still only gets new selections).
  `copyDefaultCategories` attaches a subcategory under an already-imported category to the
  existing copy (matched by `(type, name)`) instead of duplicating the category.
- **`DeleteCategoryDialog` reassign step** (fixed 2026-08-08) — it was silently dropping the
  "pick a target subcategory" half of the guided flow. This also surfaced a real bug in
  `reassignCategory`: reassigning away from a *subcategory* only updated `subcategory_id`,
  ignoring the target category the caller passed — it now writes both.
- **`createSubcategory` throws for an INCOME parent** (fixed 2026-08-23) — previously the
  "income category has no subcategory" rule relied only on Settings not rendering the
  create affordance. `validateCategoryTypeMatchesTransaction` (a separate, still-unused
  rule about a transaction's own type matching its category) remains dead code.
- **Onboarding conta padrão** (2026-08-23/24) — the audit found onboarding covered
  categories and budget but no account, so a new user could log nothing. `handle_new_user()`
  (migration `0025`) now also inserts a "Carteira" `CASH` account. Order was
  categories → account → budget, reordered 2026-08-24 to account → categories → budget
  ("Primeiro acesso... a tela inicial ser a conta inicial da carteira mesmo"). `/onboarding/account`
  only asks the wallet's real balance.
- **Quick-start whitelist** (2026-08-24) — first-time onboarding used to pre-check the entire
  `is_default` catalog. Now only 5 (`QUICK_START_CATEGORY_NAMES`: Alimentação, Compras,
  Moradia, Transporte, Salário). This list is onboarding-screen-only, unrelated to the
  `is_default` flag.
- **Per-screen help** (2026-08-24) — a `?` popover (`HelpButton`) on every main page, static
  2-3 sentence content. Deliberately not a spotlight tour ("tutorial tem que ser o básico
  de cada tela").

# Juros / Rendimentos / Ajuste

- **`Juros` became a dedicated action** (2026-08-28) — was hand-picked as a category on a
  normal 1x card purchase for the invoice's interest line. Since no `is_system` category is
  form-selectable anymore, `Juros` got the same treatment as `Rendimentos`/`Ajuste`:
  `accounts.service.ts#registerInterest({ accountId, amount, date? })`, explicit amount,
  branches on the account's DB-read type. UI: "Lançar Juros" in the account menu (BANK
  only) and the Cards page's new "Fatura ▾" dropdown.
- **`registerYield` is BANK-only** (2026-08-07) — physical cash doesn't yield.
  `reconcileAccountBalance` ("Ajustar Saldo") stays available for CASH+BANK.

# Estorno (migration `0019`, 2026-08-23)

The system audit flagged that there was no way to record a refund without either inflating
INCOME with an unrelated category or rewriting the original purchase and losing history. A
refund can happen months after the purchase, so the solution never "goes back in time" — it
always records the refund on the date it actually happened. Full refund only ("pra ser
reembolso creio que tenha que ser o total") — the amount is always the original total, never
client-supplied or editable, only the date is. Migration `0020` (`NOTIFY pgrst`) was needed
because `supabase db push` doesn't refresh PostgREST's schema cache the way the SQL Editor
does — it kept returning "Could not find the table 'public.card_refunds'".

# Debts

- **Settle-to-zero soft delete** (2026-08-07) — `addDebtTransaction` recomputes the real
  balance post-insert; `<= 0` deactivates the debt. Overpay is intentional (interest the
  creditor folded in), not an error. `DebtTransactionDialog` warns + requires a second
  "Confirmar quitação" click, but the actual decision is server-side from the real balance.
- **Default category** (migration `0015`, 2026-08-11) — `debts.default_category_id`, typed
  `EXPENSE` for PAYABLE / `INCOME` for RECEIVABLE (the direction a payment always produces).
  Prefilled only in `mode="payment"`, never `"increase"`. `RESTRICT` FK, special-cased in
  `countReferences`/`reassignCategory` (its column is `default_category_id`, no subcategory
  concept), surfaced as `CategoryUsageDTO.debtsCount`.
- **Debt + ledger entries editable/deletable** (migration `0016`, 2026-08-11) — `updateDebt`
  (agent/side/initial balance/default category); `DeleteDebtButton` (manual soft delete for a
  forgiven debt); `updateDebtTransaction`/`deleteDebtTransaction` propagate to the linked
  transaction, direction locked (`Math.sign` old vs new). This surfaced that `debt_transactions`
  had no `date` column at all — migration `0016` adds it (same gap `0011` fixed for
  `reservoir_transactions`).
- **Subtypes** (migration `0021`, 2026-08-23) — `debts.kind`
  (`PERSONAL`/`OVERDUE_BILL`/`INSTALLMENT_PLAN`, default `PERSONAL` preserves every existing
  debt). `INSTALLMENT_PLAN` label was "Parcelamento Combinado", renamed "Parcelamento
  Programado" 2026-08-25. `monthly_amount`/`due_day` validated in zod, not a DB CHECK.
  Migration `0022` = `NOTIFY pgrst`.
- **`INSTALLMENT_PLAN` start competence** (migration `0032`, 2026-08-29) — before this a plan
  only knew `monthly_amount`/`due_day`, so "ahead/behind" was impossible and "paid" was by
  calendar month (`paidThisMonth`). `start_competence` + automatic oldest-first payment
  allocation (`total paid ÷ monthlyAmount`, the card-invoice heuristic). "Se eu pago hoje
  uma fatura de setembro fica como pago em setembro." Backfill = `date_trunc('month',
  created_at)` (the kind was 6 days old). `paidThisMonth` stays in the DTO, no UI consumer.
  Migration `0033` = `NOTIFY pgrst`.
- **`OpenDebtsAlert` ("Dívidas em aberto") removed** (2026-08-28) — redundant with the new
  "Despesas de {mês}" card. Lost on purpose: the "total open balance of all non-PERSONAL
  debts, period-independent, visible even when the month is fully paid" lens. `MonthObligationsCard`
  follows the viewed month and only shows what's still unpaid *that month*.
- **Three separate screens** (2026-08-29) — the three `kind` values lived on one `/debts`
  screen with a "Tipo de dívida" selector. Split into `/debts` (PERSONAL, keeps side filter
  + 2 pies), `/overdue-bills`, `/installment-plans`. Presentation only — service, DTOs,
  validations, ledger pipeline, dashboard projection all unchanged. `DebtFormDialog` gained a
  `kind` prop and lost the selector (changing a debt's kind via UI is no longer possible).

# Budgets & Fixed Expenses

- **Budgets became month-scoped** (migration `0009`, 2026-08-08) — the biggest deviation
  from the original spec, which said "month is a query parameter, never a column". The old
  "standing target" let raising a budget (e.g. rent) silently overwrite history. Bundled:
  `getBudgetTree`/`getBudgetMonthWindow`/`cloneBudgetMonth` are new; `reconcileBudgetFloors`'s
  auto-raise-the-category behaviour became fixed-expense-only. Partial unique index
  `NULLS NOT DISTINCT (user_id, category_id, subcategory_id, month) WHERE active = true`.
- **Category ceilings never computed** (decided 2026-08-08, corrected mid-design after an
  initial draft tried the implicit "sum of subcategories" total). Rejected because a
  category's `actualAmount` already covers everything under it, tracked or not — an implicit
  sum would only reflect tracked subcategories, so an untracked expense would look like it
  blew a budget the user never set. Worked example: "Veículos" = R$1000, "Combustível" =
  R$800; an unbudgeted R$300 "Manutenção" pushes Veículos' actual to 1100 → Veículos flags
  EXCEEDED (soft signal) even though Combustível's 800 was never touched.
- **Subcategory-budget / subcategory-level fixed-expense saves never inflate the category**
  (fixed 2026-08-08, extended to fixed expenses 2026-08-10) — the original code reused the
  same auto-raise mechanism for both, so "Delivery: 400" under "Alimentação" with no
  category budget silently auto-created "Alimentação: 400". `deactivateCategoryBudgetIfOverCommitted`
  replaces raising with *erasing*: if the subcategory total reaches or exceeds the category's
  existing explicit row (exact fill counts, tightened 2026-08-10), that row is deactivated
  with a notice. A category with *direct* fixed expenses is never auto-deactivated (its
  floor can't be orphaned).
- **Tree editor doubles as bulk delete** (2026-08-08) — clearing a field that has a budget
  deactivates that row, same guards as the trash icon. "Instead of hunting down individual
  trash icons, blank out everything you want gone, save once."
- **A budget row that's a fixed-expense floor can't be deleted, only raised** (2026-08-08) —
  enforced in `deactivateBudget` server-side, plus the UI hides the trash icon.
- **Single unified `/budgets` page** (2026-08-08) — dropped the Orçamentos/Despesas Fixas
  tabs; the split made the hierarchy harder to see since a fixed expense already nests in its
  budget row. Bundled fixes: the tree's fixed-expense bar uses `actualAmount` not the
  `projectedAmount` placeholder; `/budgets` lists the month's transactions at the bottom via
  `TransactionExplorer`.
- **Payment icon always visible + "Cancelar pagamento"** (2026-08-10, after a test payment
  left real data stuck "paid"). `PayFixedExpenseDialog` branches on `isPaidThisMonth`: paid
  shows a summary + rollback via `cancelFixedExpensePayment(fixedExpenseId, month)`, scoped
  strictly to the viewed month.
- **Fixed expense payments support CREDIT_CARD** (migration `0012`, 2026-08-10) — `/budgets`
  used to filter the account pickers to non-CREDIT_CARD, so a card-billed subscription had
  no valid way to be registered. `payFixedExpense` branches on the server-read account type:
  CREDIT_CARD → 1x `card_purchases` linked via `card_purchases.fixed_expense_id`. Both
  pickers now use the shared `AccountSelect`.
- **Amount history** (migration `0023`, 2026-08-23) — `fixed_expenses.amount` was one value
  for the expense's whole life, so editing rent R$1500 → R$2000 rewrote every past month
  (the same bug `0009` fixed for `budgets`). `fixed_expense_amount_history`
  (`{fixed_expense_id, amount, effective_from}`); `updateFixedExpense` writes a new row at
  `effective_from = current month` (never retroactive, never asked). `fixed_expenses.amount`
  stays as a cache of the latest value. Migration `0024` = `NOTIFY pgrst`.
- **Link-existing-payment mode** (2026-08-23) — after the user deleted the "Claude" fixed
  expense by mistake (it had an August payment) and recreating it lost the trace.
  `PayFixedExpenseDialog` gained a "Já lancei isso manualmente" mode listing EXPENSE rows
  with `fixed_expense_id IS NULL`, filtered by the fixed expense's category.
  `getUnlinkedExpenseCandidates`/`linkExistingTransaction`.
- **Competence window** (migration `0026`, 2026-08-25) — a fixed expense was perpetual by
  construction, so a canceled or not-yet-started subscription still imposed its floor on
  every month. `start_competence` (required) / `end_competence` (optional). "Fim" is a
  direct month picker, never auto-computed from a cancellation date (explicit user choice).
  `getSubcategoryBudgetFloor` gained a `month` parameter it didn't have before. Migration
  `0027` = `NOTIFY pgrst`.
- **`fixed_expense_amount_history` vs the competence window** (clarified 2026-08-25) — the
  user asked whether the history table became redundant. It didn't: the window answers "does
  the expense exist this month?" (existence boolean); the history answers "how much did it
  cost this month, given it existed?" (`getFixedExpenses(month)` runs for any past month so
  the user can compare planned-vs-actual of that month, which is only correct with the value
  that applied *then*).
- **Hard delete, no `active`** (migration `0028`, 2026-08-25, real production bug) —
  `deactivateFixedExpense` only ran `active = false`, leaving `fixed_expense_id` on whatever
  row it had paid pointing at a still-existing "deleted" row, so `getUnlinkedExpenseCandidates`
  (which needs `fixed_expense_id IS NULL`) could never offer it for re-link. Dropped the
  column, `deleteFixedExpense` runs a real `DELETE` (`ON DELETE SET NULL` clears the link).
  Every already-soft-deleted row was hard-deleted as part of the migration — including a real
  "Claude" expense whose linked `card_purchases` became available to re-link. Migration
  `0029` = `NOTIFY pgrst`.

# Reservoir (Receita Programada)

- **Display-only rename** (2026-08-07) — "Reservatórios"/`Droplets` → "Receita
  Programada"/`Vault`. Route (`/reservoirs`), tables, service, DTOs unchanged by design.
  Search the codebase for `reservoir`, not "receita programada".
- **Hard delete, not `active`** (2026-08-10) — `deactivateReservoir` was defined but never
  wired to any button; there was no way to delete a single ledger entry. Both now use a real
  `DELETE`. `deleteReservoirTransaction`: if it's a withdrawal, the linked
  `transactions`/`card_purchases` row is deleted too (a ledger entry's only reason to exist
  is that specific withdrawal). `deleteReservoir`: `reservoir_transactions` cascade away, but
  a withdrawal's linked row is untouched (the FK points the other way) — real money history
  always survives. `deactivateReservoir` removed as dead code. The `active` column itself is
  still in the schema and `getReservoirs()` still filters `.eq("active", true)` — vestigial,
  permanently `true`, a future cleanup migration could drop it.
- **Reservoir-level defaults** (migration `0010`, 2026-08-09) — `default_percentage`,
  `default_destination_account_id`.
- **`reservoir_transactions.date`** (migration `0011`) — added, backfilled from `created_at`;
  the AccrualDialog's date picker was silently discarded before (the column didn't exist).

# Dashboard

- **Period presets removed** (2026-08-28) — "Retire o filtro de periodo desta tela... vai
  pesar muito a tela... pretendo refaze-lo talvez em alguma aba de relatorios no futuro". The
  presets (Mês / 3 / 6 / 12 meses / Ano / Personalizado) and custom range are gone;
  `parseDashboardFilters` always resolves to a single month. `resolvePeriodPreset`/
  `DashboardPeriodPreset` in `date.ts` are left unused for a future reports tab. The Monthly
  Evolution 15-month window is independent and unchanged.
- **"Tipo" dropdown folded into the category filter** (2026-08-28) — checking a whole
  "Receitas"/"Despesas" group (via `onToggleGroup` → `useCategoryFilter().setGroup`) is the
  new "só receitas"/"só despesas". Tri-state group checkbox. Not a perfect equivalent
  (selecting all categories of a type excludes *uncategorized* rows of that type) — accepted.
- **"Comparativo" horizontal-bar charts removed** (2026-08-28) — `CategoryBars` duplicated
  the donut's data once both expense+income pairs existed. Deleted with `getCategoryComparison`
  and `CategoryComparisonDTO`. Same as `income-expense-chart.tsx` was on 2026-08-14.
- **Monthly Evolution window** — was inheriting the page's period preset (so the default
  "Mês" preset rendered it as a single bar). Fixed to always 12 months back + 3 forward from
  the viewed month (`monthlyEvolutionFilters` built separately in `dashboard/page.tsx`). The
  3 future months exist so already-scheduled card installments show.
- **`getCurrentMonthObligations` / "Despesas de {mês}" card** (2026-08-28) — replaced the
  "Vence essa semana" alert (`upcoming-due-alert.tsx`, removed): whole month not ≤7 days,
  three sources not just fixed expenses, a pay button per row. Also absorbed `OpenDebtsAlert`.
  First version counted card by `getCardBalanceThroughMonth` and undercounted (showed 4.803
  when DESPESAS was 6.306); fixed the same day to count card by competence
  (`currentMonthInvoice`/`currentMonthPaidAmount`). Follows the viewed month
  (`getCurrentMonthObligations(month)`), was today-anchored initially.
- **Unpaid-obligations projection spread to the whole dashboard expense side** (2026-08-28) —
  "Dashboard Graficos de Despesas por categoria e Card de Despesas devem seguir a mesma
  regra". `fetchUnpaidObligationEntries` returns the viewed month's unpaid fixed expenses +
  `PAYABLE` `OVERDUE_BILL`/`INSTALLMENT_PLAN` as synthetic EXPENSE entries;
  `fetchPeriodEntries`/`getFinancialSummary`/`getCategoryDistribution`/`getMonthlyEvolution`
  gained an `obligationsMonth?` param. DESPESAS/Balanço/expense donut/viewed-month evolution
  bar all now project. A deliberate documented break from "Money Reality Rules" — dashboard
  presentation only.
- **`getDefaultDashboardMonth`** (2026-08-28) — mirrors `getDefaultCardsMonth`: without
  `?month=`, opens on next month if today's obligations are all paid and next month has
  something to show.

# Performance pass (2026-08-10, migration `0013`)

Dashboard/filter/tab switches felt sluggish even with little data. Root causes, none of them
data volume: (1) `getOptionalUser()` calls `supabase.auth.getUser()` which always revalidates
against the Auth server (by design — never trust a local JWT server-side), and every service
function called it independently → 8-10 redundant round-trips per dashboard load. Now wrapped
in React's `cache()`. (2) `getDebts`/`getReservoirs`/`getFixedExpenses`/`getBudgets`/
`getBudgetTree` used sequential `for...await` loops for per-row aggregates → one round-trip
per row. All parallelized with `Promise.all`. (3) Schema had exactly one explicit index;
migration `0013` added indexes on every FK/filter column (Postgres never auto-indexes FKs) —
real but secondary at current row counts. Alongside: every `(app)` route got a `loading.tsx`
(`loading-overlay.tsx`), and `NavigationProgressProvider` wraps `router.push` in
`useTransition` to show the same overlay on searchParams-only changes (which don't trigger
Next's `loading.tsx`).

# Resolved bugs (kept for the record)

- **`is_system` categories were budget-plannable in the tree editor** (fixed 2026-08-31) —
  `BudgetTreeFields` (shared by "Planejar orçamentos" and the onboarding budget step) filtered
  `c.type === "EXPENSE"` but not `!c.isSystem`, so `Ajuste` / `Juros` / `Estorno` / `Pagamento
  de Cartão` showed up as rows you could set a budget on — contradicting the documented rule
  (`is_system` is never form-selectable) and the single-row `BudgetFormDialog`, which uses
  `CategorySelect` (already filtered). Added `&& !c.isSystem` in `budget-tree-fields.tsx`,
  `budget-tree-editor.tsx`, and `onboarding-budget-form.tsx`.
- **`src/types/database.ts` had drifted from `schema.sql`** (fixed 2026-08-31) — during a full
  code/doc reconciliation pass: `BudgetRow` was missing `month` (NOT NULL since migration
  0009), `TransactionRow` was missing `refund_of_transaction_id` (0019); `card_refunds` (0019)
  and `fixed_expense_amount_history` (0023) had no row interface at all. All added. Also
  corrected `ARCHITECTURE.md`'s `getAccountBalance` CREDIT_CARD contract line (it claimed
  "totalCommitted − totalPayments, floored at 0"; the code returns a negative raw-sum figure
  with no consumer) and `AI_CONTEXT.md`'s reservoir-withdrawal note (the "(or `card_purchases`)"
  path is documented but not implemented).
- **Edit paths skipped validation** (fixed 2026-08-23) — `updateAccountAction`/
  `updateCardPurchaseAction` called their services directly, bypassing
  `updateAccountSchema`/`updateCardPurchaseSchema` (dead code at the time). Both now
  `.parse()` the merged `{ id, ...input }` first.
- **`updateCardPurchase` `??` vs `!== undefined`** (fixed 2026-08-08) — merged
  `categoryId` with `input.categoryId ?? current.category_id`, so clearing a purchase's
  category to "Sem categoria" via inline edit never persisted (`??` treats explicit `null`
  like `undefined`). Switched to `input.categoryId !== undefined ? … : …`. Also added the
  missing `revalidatePath("/budgets")` to `inlineEditTransaction`.
- **`TransactionViewDTO` installment rows passed the installment id to `updateCardPurchase`**
  (fixed 2026-08-08) — a `card_purchases` update keyed on an installment id matched zero rows
  and threw. Fixed by adding `TransactionViewDTO.purchaseId` (set only for
  `source: "installment"`).
- **Phantom scrollbars on every dialog** (fixed 2026-08-23) — `DialogContent` had
  `overflow-y-auto` on the element rendering `<CornerMarks />`, whose `-6px` negative offsets
  bleed past the box edge and count as overflow. Fixed by moving the scroll to an inner
  `<div className="overflow-y-auto p-4">` around `{children}` only.
- **Month-label click did nothing** (fixed 2026-08-07) — the month navigator overlaid an
  invisible `<input type="month">`; browsers only react to a click on their own
  calendar-icon hit-area. Fixed by a shared `month-picker.tsx` calling `showPicker()` from
  the wrapping label's `onClick`.
- **`/accounts` "Total em contas" donut dropped negative-balance accounts** (fixed
  2026-08-26) — it summed from the array already filtered to `balance > 0`. Now the center
  label uses the true `netTotal` from every account; the pie keeps the positive-only slices.
- **Standalone "Reclassificar em lote" button removed** (2026-08-07) — bulk reassignment now
  only exists inside `DeleteCategoryDialog`'s guided-deletion step.
  `bulkReassignTransactions`/`batch-reassign-dialog.tsx` deleted.
- **`0002_seed.sql` hand-edited after being applied** — its current content already omits the
  "Pagamento de Cartão" subcategory `INSERT` that migration `0006` was written to delete, so
  `0006`'s `DELETE` is a no-op against a fresh database. The migration history as it reads
  no longer matches what the file sequence implies. No fix — rewriting `0002` again would
  repeat the mistake. This note exists so a future session doesn't try to reconcile it.

# Found, not fixed — needs a product decision

Paying a "Despesa Programada" via a credit card whose invoice already closed for the current
cycle can leave that expense permanently showing as unpaid/overdue for the month it was due.
Reproduced: "Streaming X" (`dueDay=10`, card closes the 5th) paid on the 26th → the
`card_purchases` installment correctly bills to *next* month's invoice, but
`getFixedExpenses(month)` computes `isPaidThisMonth` by matching a linked installment's
competence to the viewed month, so the payment only ever satisfies next month. The "Despesas
de {mês}" card keeps showing it "Atrasada" with no way for that specific month to be marked
paid. May be intentional (the competence shift for the charge is already accepted) but the
user-facing consequence — an alert that can't be silenced by the action it demands — needs a
decision, not a unilateral fix.

# Known layer disagreements (low priority)

- **`reservoirs.active`** — vestigial, see "Reservoir" above.
- **`percentage` range** — `src/lib/validations/reservoirs.ts` allows `0`
  (`z.number().min(0).max(100)`), the DB `CHECK` on `reservoirs.default_percentage` /
  `reservoir_transactions.percentage` requires `> 0`. Submitting exactly `0` passes zod and
  fails at the DB with a raw Postgres error. Probably align zod to `> 0`.

# Mobile usability pass (2026-08-26)

Applied every fix from a 375×812 audit, presentation-layer only: empty chart cards stopped
reserving a fixed 320px; the dashboard period-preset row became horizontally scrollable
(`w-0 min-w-0 flex-1 overflow-x-auto`); `SelectTrigger` truncates instead of wrapping;
"Vence essa semana" got an inline "Pagar" per row; the Transaction Explorer got a stacked
card layout below `sm:`; the three row-action icon buttons grew to ~34×34px (real padding,
not the negative-margin trick, so adjacent hit boxes can't overlap); `/budgets`'s three top
actions got a hierarchy ("Planejar orçamentos" primary, the rest secondary); `/reservoirs`'
header got `flex-wrap`. (Some of these — the period-preset row, the "Vence essa semana"
alert — were later removed for unrelated reasons.)
