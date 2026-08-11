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

**Built**: auth (signup/login/signout, email-confirmation-aware), onboarding (category tree-picker — uncheck a subcategory to keep the rest of the category; re-openable from Settings to import more, always showing the FULL is_default catalog with already-imported categories/subcategories rendered checked+disabled rather than hidden), all 8 services + their Server Actions, Dashboard (filters incl. month-by-month navigator via the shared `MonthPicker` — click-anywhere-on-label opens the native picker, not just the browser's own tiny icon hit-area —, account filter shows each account's type icon, category filter grouped under "Receitas"/"Despesas" `SelectGroup`s, 4 charts, budgets/fixed-expenses panel scoped to the filtered period (not always the current month) with fixed expenses nested under their parent budget, Transaction Explorer with inline category edit + delete + account-type icon per row — no standalone batch-reassign button, that only lives inside category deletion now), Transactions (month-scoped like Cards/Dashboard — a `MonthNav` filters the list to one month at a time instead of loading every transaction ever logged; create/delete; no manual "pay card bill" here — see below; `CREDIT_CARD_PAYMENT` rows show a "Pagamento de Cartão" label instead of a category), Accounts (create with institution-first naming — no institution field for `CASH`; initial balance for CASH/BANK; Informar Rendimento restricted to `BANK` since cash doesn't yield; Ajustar Saldo for CASH+BANK; Ajustar Limite/Ajustar Cartão quick action for `credit_limit`/`overdraft_limit`, editable anytime, and for `CREDIT_CARD` also `closing_day`/`due_day` in the same dialog; `credit_limit` required and always > 0 for `CREDIT_CARD` accounts; each `CREDIT_CARD` account card shows the same `totalCommitted / creditLimit` usage figure as the Cards page; account-type icon — Banknote/Wallet/CreditCard — shown consistently on the Accounts page, transaction lists, and the dashboard's account filter), Cards (create/edit/delete a purchase — edit rolls back and regenerates every installment; competence month defaults from `closing_day` but is directly overridable; inline category/subcategory editing per installment row, same `EditableCategoryCell` pattern as the dashboard; pay-the-bill flow suggests the statement balance through TODAY's real month regardless of the page's month filter; soft credit-limit warning, never blocks; card summary shows usado/total against the full committed balance incl. future installments, the VIEWED month's invoice, and the overdue amount; a purchase can be backfilled as retroactive — "compra antiga" checkbox + "pago até" month picker flags a contiguous prefix of its installments as `paid_before_system`, excluded from the committed/outstanding balance but still counted in category analytics and, as a computed (non-transaction) amount, in the dashboard's income totals — see AI_CONTEXT.md "Compras retroativas"), "Receita Programada" — displayed name for the Reservoir feature, route/table/service/DTO names still `reservoir*` (accrual/withdrawal entries, description defaults to "Movimentação da receita programada {nome}"), Debts (pie charts for "a pagar"/"a receber" at the top, each shown only when that side has data; payment/increase dialog defaults its description to "Movimentação da dívida {nome}"; a payment that fully settles or overpays a debt is soft-deleted automatically after a confirm-again warning), Budgets/Fixed Expenses (budgets are month-scoped — `MonthNav` browses any month, but only the current real month and the next one, once the current month has a budget, are creatable/editable; every earlier month is read-only history; "Clonar de {mês}" copies a prior month's rows verbatim when the viewed editable month is empty; a category's own number is always real-or-absent, never an implicit sum of its subcategories — saving a subcategory budget can only erase an insufficient category row, never inflate one; a fixed expense is still a committed floor that auto-raises/creates the category or subcategory budget with a notice, never blocks, now scoped to current + next month; a budget can never be manually lowered below what its subcategory budgets + fixed expenses commit to, a hard block, and can never be *deleted* at all while fixed expenses depend on it (only raised) — the delete button hides itself in that case, and the service blocks it too either way; `/budgets` is a single unified view now, no more separate tabs — one tree (shared read-only by the dashboard panel) nested when a category has real headroom, merged into one box when a lone subcategory has no category number of its own, or standalone boxes under a bare label when there are several, with each fixed expense's pay/edit/delete actions living directly on its own nested row, and its progress bar reflecting real paid status, never the planned placeholder; a tree-based "Planejar orçamentos" screen plans (or bulk-deletes, by clearing a field) a whole category + subcategories for one month in one place, reusing the onboarding tree-picker's visual pattern and shared with the first-time onboarding budget step; the page also lists the viewed month's transactions/card purchases at the bottom, reusing the dashboard's `TransactionExplorer`; "Registrar pagamento" defaults its description to "Pagamento — {nome da despesa fixa}"), Settings (category/subcategory CRUD with guided-deletion, curated emoji icon picker — no free-text icon field).

**Deliberate deviations from the original spec below** (each documented at its point of change — see the migration file's own comment for the *why*):
- `bank_accounts.initial_balance` added (0005) — the original schema only gave `CASH` an initial balance, forcing every new `BANK` account through an immediate `Ajustar Saldo`.
- `credit_cards.credit_limit` added (0007); a purchase that would exceed it shows a warning ("you may have forgotten to log the bill payment, or made a mistake") requiring an explicit "insert anyway" acknowledgment, never blocking the insert — that part is still soft-enforced. The limit's *presence*, however, is not: migration 0008 (decided 2026-08-08) made it `NOT NULL` + `CHECK (credit_limit > 0)` — every `CREDIT_CARD` account must have a positive limit, reversing the original "optional" design. Both this and `overdraft_limit` are editable anytime via "Ajustar Limite" (decided 2026-08-07) — see `AI_CONTEXT.md` → "Accounts".
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
- The category import picker (onboarding + Settings "Importar categorias padrão", fixed 2026-08-08 at the user's request) now always lists the complete `is_default` catalog instead of pre-filtering to only what's missing — `getAvailableDefaultCategories` was replaced by `getDefaultCategoryImportOptions`, returning `CategoryImportOptionDTO[]` with an `alreadyImported` flag per category/subcategory. Already-imported items render checked+disabled in `CategoryTreeItem` (visible, not removable — badge "Já importada"); disabled checkboxes are excluded from native form submission by the browser itself, so the server action still only ever receives genuinely new selections. `copyDefaultCategories` gained a second path for a subcategory selected under an already-imported category: it resolves the user's existing category copy by `(type, name)` and attaches the new subcategory there instead of creating a duplicate category.
- **Budgets became month-scoped (migration 0009, decided 2026-08-08)** — the biggest deviation from the original spec, which explicitly said "month is a query parameter, never a column" for this table; that line no longer applies. Bundled into the same change: `getBudgetTree`/`getBudgetMonthWindow`/`cloneBudgetMonth` are new; `reconcileBudgetFloors`'s auto-raise-the-category behavior, which used to be triggered by both fixed-expense saves and subcategory-budget saves, is now fixed-expense-only (`reconcileFixedExpenseFloors`) — a subcategory-budget save instead calls the new `deactivateCategoryBudgetIfOverCommitted`, which can only erase an insufficient category row, never inflate one. A category's own number is now always a real row or nothing — never a computed "sum of subcategories" stand-in (an earlier draft of this exact change tried that and was corrected — see `AI_CONTEXT.md` → "Category ceilings are never computed" for the full reasoning). Full detail in `AI_CONTEXT.md` → "Budgets".
- `/budgets` dropped its Orçamentos/Despesas Fixas tabs in favor of one unified tree (decided 2026-08-08, at the user's request — the split was making the category↔fixed-expense hierarchy harder to see, not easier, since a fixed expense already nests inside its budget row). Fixed-expense pay/edit/delete actions moved onto their own row inside the tree (`BudgetTree`'s new `renderFixedExpenseActions` prop); "Nova despesa fixa" sits next to "Novo orçamento" at the top instead of behind a second tab. Two more fixes landed alongside this: a fixed expense's progress bar inside the tree now uses `actualAmount` (was showing 100%/full even when unpaid, because it used the `projectedAmount` placeholder meant for other contexts); and a budget row can no longer be deleted while fixed expenses depend on it (`deactivateBudget` now checks this server-side, not just via a hidden button), with `budget-tree-editor.tsx`'s "clear a field to bulk-delete" shortcut (also new — mirrors the same guard, added so large changes don't require hunting down individual trash icons) surfacing that same block as an inline error instead of silently failing. `/budgets` also now lists the viewed month's transactions/card purchases at the bottom via the shared `TransactionExplorer`.
- `DeleteCategoryDialog`'s "Mover para outra categoria" reassign step (fixed 2026-08-08) now also lets the user pick a target *subcategory*, not just a category — it was silently dropping that half of the guided-reassignment flow described in `AI_CONTEXT.md` → "Deleting a category or subcategory". This also surfaced and fixed a real bug in `categories.service.ts#reassignCategory`: when reassigning rows away from a *subcategory* being deleted, the old code only ever updated `subcategory_id`, ignoring whatever target category the caller passed — it now always writes both `category_id` and `subcategory_id` together. The reassign-target category list is also now filtered to the source's own `type`, since a category's `type` must always match what it's attached to.
- Credit card accounts must always carry a positive `credit_limit` (decided 2026-08-08, migration `0008`) — see `AI_CONTEXT.md` → "Accounts". This reverses the original "optional" design from migration `0007`; the soft-enforce behavior on purchases exceeding the limit is unchanged.
- Contas now shows each `CREDIT_CARD` account's usage as the identical `totalCommitted / creditLimit` figure the Cards page shows (fixed 2026-08-08), instead of the generic `account.balance` line every other account type uses — see `AI_CONTEXT.md` → "Accounts".
- Cards page installment rows now support inline category/subcategory editing (fixed 2026-08-08, at the user's request — "igual temos no sistema inteiro"), reusing `EditableCategoryCell` from the dashboard rather than requiring the full `PurchaseFormDialog` edit flow just to fix a category. Fixing this also surfaced a real, pre-existing bug: `TransactionViewDTO` rows with `source: "installment"` were passing the *installment's* id to `inlineEditTransaction`, which forwards it to `updateCardPurchase` — a `card_purchases` update keyed on an installment id, silently matching zero rows and throwing (`Cannot coerce the result to a single JSON object`). This affected the Dashboard's Transaction Explorer too, for any card-purchase row's category edit. Fixed by adding `TransactionViewDTO.purchaseId` (set only for `source: "installment"` rows) and using that instead of `id` when the edit lands on `card_purchases`.
- Found live during Budgets verification (fixed 2026-08-08): `cards.service.ts#updateCardPurchase` merged `categoryId`/`subcategoryId` with `input.categoryId ?? current.category_id` — since `??` treats an explicit `null` (meaning "clear this field") the same as `undefined` (meaning "not part of this update"), clearing a card purchase's category to "Sem categoria" via inline edit silently never persisted; the UI showed the change optimistically but a fresh page load always reverted to the old category. Fixed by switching to `input.categoryId !== undefined ? input.categoryId : current.category_id`, the same pattern already used elsewhere (e.g. `updateBudget`) for partial updates where `null` is a meaningful value. Also added the missing `revalidatePath("/budgets")` to `inlineEditTransaction` — editing a transaction/purchase's category can change what a budget's `actualAmount` sums, and that path wasn't being invalidated alongside `/dashboard`, `/transactions`, `/cards`.

- Validation/UX pass (2026-08-09): credit card `closing_day`/`due_day` tightened from 1-31 to 1-28 everywhere (schema, zod, HTML) — see `AI_CONTEXT.md` "Accounts". Every monetary `<input type="number">` across the app now carries a `min` matching its zod rule (mostly `0.01` for `positive()` fields, `0` for `overdraftLimit`) — previously several had no HTML min at all, or `min="0"` next to a zod `positive()` rule that actually rejects zero. Budget amount inputs (`BudgetFormDialog`, `BudgetTreeFields`/`BudgetTreeEditor`, the onboarding budget step) now fetch/compute the same hierarchy floor the server already enforced (`AI_CONTEXT.md` "Budget hierarchy") and apply it as the input's `min` plus a pre-submit check, instead of the floor only surfacing as a post-submit error. The category/subcategory picker was unified into a single `CategorySelect`/`SubcategorySelect` component (`src/features/categories/components/category-select.tsx`) used by every form that assigns a category — including ones that had no create-inline affordance before (Budget, Fixed Expense, Receita Programada, and the dashboard/Cards inline table-cell editor) — replacing the old `InlineCategoryCreate` Popover-button pattern (which only existed in Lançamentos/Compra no Cartão) with a "Nova categoria/subcategoria" item at the end of the dropdown itself. The dashboard's category pie chart gained an explicit "voltar" button next to its title (visible only when a category filter is active) alongside the existing click-the-same-slice-again toggle.
- **Fixed-expense-to-budget reconciliation no longer bubbles a subcategory-level fixed expense up to the category (2026-08-10, at the user's request)** — see `AI_CONTEXT.md` → "Budget hierarchy" for the 4 worked cases. Previously, registering a fixed expense under a subcategory could auto-create or auto-raise the *category's* budget too (via `getCategoryBudgetFloor`, which sums subcategory budgets), even when the user never set a category-level number — the same "phantom ceiling" bug already fixed for subcategory-budget saves on 2026-08-08, just not extended to the fixed-expense codepath at the time. `reconcileBudgetFloors` (`_shared.ts`) now branches: a subcategory-level fixed expense only raises/creates the *subcategory's* row, then calls `deactivateCategoryBudgetIfOverCommitted` to possibly erase (never inflate) an already-existing category row. A category-level fixed expense (no subcategory) is unaffected — it still raises/creates the category directly, since there's no subcategory level to defer to. Bundled with this: `deactivateCategoryBudgetIfOverCommitted`'s threshold was tightened from "subcategory sum strictly exceeds the category amount" to "subcategory sum reaches *or* exceeds it" — an exact fill (zero headroom left) now also erases the category row, matching what `AI_CONTEXT.md` already described but the code hadn't actually implemented. `reconcileFixedExpenseFloors`'s next-month propagation check was also fixed to look for an existing budget at the *same level* the fixed expense targets (subcategory or category), instead of always checking for a category-level row even when reconciling a subcategory.

- **Fixed expense payments now support every account type, `CREDIT_CARD` included (2026-08-10, at the user's request)** — see `AI_CONTEXT.md` → "Fixed Expenses" for the full reasoning. `/budgets` used to pass a `liquidAccounts` (non-`CREDIT_CARD`) list into both `FixedExpenseFormDialog`'s "Conta padrão" and `PayFixedExpenseDialog`'s "Conta," so a fixed bill that's actually charged to a card (e.g. a streaming subscription) had no valid way to be registered. Both now receive the full `accounts` list, rendered through the new shared `AccountSelect` (`src/components/ui/account-select.tsx`) — grouped by type in `CASH → BANK → CREDIT_CARD` order with each account's type icon shown, since a bank account and a card can share the same name. `payFixedExpense` (`fixed-expenses.service.ts`) now looks up the chosen account's `type` server-side and branches: `CASH`/`BANK` still creates a plain `EXPENSE` transaction (unchanged); `CREDIT_CARD` creates a single-installment (1x) `card_purchases` row instead, linked via a new `card_purchases.fixed_expense_id` column (migration `0012`) — competence is derived the normal way from the card's `closing_day`/`due_day`, no bespoke logic added. `getFixedExpenses`'s `actualAmount` now also sums the linked purchase's `card_installments.amount` by competence.
- **The "Registrar pagamento" trigger on a fixed expense's row is now always visible, and doubles as a payment-cancel affordance (2026-08-10, at the user's request, after a test payment left real `/budgets` data in a wrongly-"paid" state with no visible way to undo it).** Previously `PayFixedExpenseDialog`'s trigger only rendered when `!f.isPaidThisMonth` — once paid, there was no UI path back to "not paid" short of a manual DB fix. The same icon now always renders (`src/app/(app)/budgets/page.tsx`); `PayFixedExpenseDialog` branches on `expense.isPaidThisMonth`: unpaid still opens the original account/amount/date form, but paid opens a plain-text summary — `"{nome} pago no valor de {actualAmount} no dia {paidDate}"` — with "OK" (close) and "Cancelar pagamento" (rollback) instead. `FixedExpenseDTO.paidDate` is new (`getFixedExpenses`, `fixed-expenses.service.ts`) — the date of whichever real record made `isPaidThisMonth` true that month. "Cancelar pagamento" calls the new `cancelFixedExpensePaymentAction` → `fixed-expenses.service.ts#cancelFixedExpensePayment(fixedExpenseId, month)`, which deletes that month's linked `transactions` row(s) and/or linked `card_purchases` row(s) (installments cascade) — the exact inverse of whichever branch `payFixedExpense` took, scoped to the viewed month only so cancelling doesn't touch a different month's separate payment.
- **Performance pass (2026-08-10, at the user's request — dashboard/filters/tab switches felt sluggish even with little data).** Root-caused to three things, none of them data volume: (1) `getOptionalUser()` (`src/lib/auth/getUser.ts`) calls `supabase.auth.getUser()`, which always revalidates against the Supabase Auth server (a real network round-trip, by design — never trust a locally-decoded JWT server-side) — but it was called independently by every service function with no memoization, so a single dashboard load fanned out into 8-10 redundant round-trips to the same auth check. Now wrapped in React's `cache()`, collapsing that to one per request. (2) `getDebts`, `getReservoirs`, `getFixedExpenses`, `getBudgets`, and `getBudgetTree` each used a `for...of` loop with `await` inside to compute a per-row aggregate (ledger balance, linked-transaction sum, `getActualAmountForCategory`) — one sequential DB round-trip per row instead of one parallel batch; `getBudgetTree` in particular chains this two levels deep (once per category, once per subcategory), and both `/budgets` and the dashboard panel call it plus a sibling function doing the same category/subcategory aggregation again. All five now parallelize with `Promise.all`. (3) Schema had exactly one explicit index (`budgets_user_month_idx`) — migration `0013_performance_indexes.sql` added indexes on every FK/filter column the services actually query on (Postgres never auto-indexes foreign keys); real but secondary at current row counts vs. (1) and (2). Alongside these, since none of this makes individual requests instant and there was previously zero loading feedback anywhere in the app: every `(app)` route got a `loading.tsx` (new `src/components/ui/loading-overlay.tsx`, a full-screen "Carregando…" overlay in the Industry corner-marks style) — but that Next.js mechanism only fires on an actual segment/route change, not on a searchParams-only filter change re-rendering the *same* page.tsx, which is exactly what every filter/month-picker in this app does. So `src/components/providers/navigation-progress.tsx` (`NavigationProgressProvider`, mounted once in `(app)/layout.tsx`) wraps `router.push` in `useTransition` and renders the same overlay for the duration of `isPending`; every filter/month-nav component (`dashboard-filters`, `card-filters`, `transaction-filters`, both `month-nav.tsx`, `category-pie`) now calls `navigate()` from `useNavigationProgress()` instead of calling `router.push` directly. Verified in-browser: both paths correctly show the overlay for the navigation's full real duration (observed ~3.5s against the linked cloud Supabase project in this dev environment) and clear it once the new data lands.

- **Backfilled/retroactive card purchases (migration `0014`, 2026-08-10, at the user's request).** Lets a user register a card purchase from before they started using the system, with a prefix of its installments already paid outside the system (no `card_payments` row tracked here) — meant to lower onboarding friction for a user who already has installment purchases in progress and would otherwise have to manually compute "what's left to pay." `card_purchases.paid_through_competence` ("YYYY-MM", the user's "já paguei até este mês" input) drives `card_installments.paid_before_system` (boolean, one flag per installment, always a contiguous prefix by competence — never an arbitrary subset). `cards.service.ts#getCardBalanceThroughMonth`/`getCardTotalCommitted` now exclude flagged installments (already settled, just not through a tracked payment); `getCardSummary`'s `currentMonthInvoice` deliberately does not (it represents the historical billed fact, unaffected by a later retroactive log). Category/expense analytics are unaffected — `card_installments` already fed those regardless of any flag. `dashboard.service.ts` gained `fetchRetroactiveIncomeEntries`, called only from `getFinancialSummary`/`getMonthlyEvolution` to add these amounts into the dashboard's INCOME totals as a **computed** figure, never a real `transactions` row — deliberately not wired into `getCategoryDistribution`/`getCategoryComparison`/`getTransactionsFiltered`, since those group by `categoryId` and a retroactive installment has no real INCOME category (a fake `categoryId` risks leaking into a `category_id.in(...)` filter expecting a uuid, the same class of bug `uncategorizedOnly` exists to avoid). `FinancialSummaryDTO.retroactiveIncomeShare` mirrors `adjustmentShare`'s pattern (a derived %, not itself a transaction) but is a deliberately distinct signal — Ajuste is about bookkeeping looseness, this is about a purchase genuinely predating the system. See `AI_CONTEXT.md` → "Compras retroativas" for the full reasoning.

- **Reservoir (Receita Programada) deletion — individual ledger entries and the whole reservoir, both hard deletes (2026-08-10, at the user's request).** Neither existed in the UI before: `deactivateReservoir` (soft delete, `active = false`) was defined in the service but never wired to any button, and there was no way to remove a single ledger entry at all. Both gaps are now closed, and both use a real `DELETE`, not the `active` soft-delete convention most of the rest of the schema follows (see `AI_CONTEXT.md` → "Reservoir deletion" for the full reasoning) — `deactivateReservoir` was removed as dead code in the same change. `reservoirs.service.ts#deleteReservoirTransaction` removes one ledger row; if it's a withdrawal (linked to a `transactions` or `card_purchases` row), that linked record is deleted too, since a ledger row's only reason to exist is to represent that specific withdrawal. `reservoirs.service.ts#deleteReservoir` removes the whole reservoir header; its `reservoir_transactions` cascade away with it (`ON DELETE CASCADE`, unchanged from the original schema), but a withdrawal's linked `transactions`/`card_purchases` row is untouched by that cascade — the FK points the other way (`reservoir_transactions.linked_transaction_id → transactions`, `ON DELETE SET NULL`, only relevant if a transaction is deleted, not a reservoir) — so real money history the withdrawal created always survives even when the reservoir and its ledger don't. Both actions render as a trash icon (`DeleteReservoirTransactionButton`, `DeleteReservoirButton`) grouped with the existing edit icon on the right side of their row, matching the row-action convention already used elsewhere (e.g. fixed-expense rows in `/budgets`).
- **`AccountSelect` adopted by the two account pickers on `/reservoirs` (2026-08-10, at the user's request — "esse deve ser o padrão sempre").** `WithdrawalDialog`'s "Conta de destino" and `ReservoirFormDialog`'s "Conta de destino padrão" were still plain flat `<Select>`s listing account names with no type grouping or icon — the standard already established for Fixed Expenses (`AI_CONTEXT.md` → "Fixed Expenses", migration `0012`'s account-type-icon rationale) is that any account picker uses the shared `AccountSelect` (`src/components/ui/account-select.tsx`), grouped `CASH → BANK → CREDIT_CARD` with a type icon per row. Both reservoir pickers only ever receive `liquidAccounts` (non-`CREDIT_CARD`), so in practice they only ever render the `CASH`/`BANK` groups — expected, not a bug.

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
8. `0008_credit_card_limit_required.sql` — makes `credit_cards.credit_limit` `NOT NULL` + `CHECK (> 0)`.
9. `0009_monthly_budgets.sql` — `budgets.month`, `NOT NULL` + a **partial** unique index `NULLS NOT DISTINCT (user_id, category_id, subcategory_id, month) WHERE active = true` (not a plain constraint — must coexist with the `active` soft-delete convention) + a `(user_id, month)` index.
10. `0010_reservoir_defaults.sql` — `reservoirs.default_percentage`, `reservoirs.default_destination_account_id`.
11. `0011_reservoir_transaction_date.sql` — `reservoir_transactions.date`, backfilled from `created_at` (the AccrualDialog's date picker was silently discarded before this — the column didn't exist).
12. `0012_card_purchase_fixed_expense.sql` — `card_purchases.fixed_expense_id`, `ON DELETE SET NULL` — lets a fixed expense be paid on a credit card as a single-installment (1x) purchase, tracked through `card_installments` like any other card purchase, instead of only supporting a plain `transactions` row against a CASH/BANK account.
13. `0013_performance_indexes.sql` — indexes on every hot filter/join column across `transactions`, `card_purchases`, `card_installments`, `reservoir_transactions`, `debt_transactions`, `fixed_expenses`, `accounts`, `debts`, `reservoirs` (Postgres never auto-indexes FKs). Shipped alongside two code-level fixes for the actual reported slowness, not the schema: `getOptionalUser()` (`src/lib/auth/getUser.ts`) now wrapped in React's `cache()` — it was re-validating against the Supabase Auth server on every call, and a single page load fans out into many parallel service calls that each call it independently (8-10 redundant round-trips per dashboard load, uncached); and the sequential `for...await` loops in `getDebts`/`getReservoirs`/`getFixedExpenses`/`getBudgets`/`getBudgetTree` (each doing a per-row DB round-trip one at a time) were parallelized with `Promise.all`.
14. `0014_card_installment_paid_before_system.sql` — `card_purchases.paid_through_competence` (date, nullable) + `card_installments.paid_before_system` (boolean, `NOT NULL DEFAULT false`) — lets a card purchase be backfilled from before the user started using the system, with a prefix of its installments marked already paid outside the system. See `AI_CONTEXT.md` → "Compras retroativas".

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
 │  ├ budgets/components (budget-form-dialog [create+edit, month-scoped], fixed-expense-form-dialog [create+edit], budget-tree-editor ["Planejar orçamentos" — whole category+subcategory tree in one screen for one month, reuses onboarding's tree pattern; clearing an existing field deletes that row, same guards as the single-row delete], budget-tree-fields [the reusable amount-input tree, shared with the onboarding budget step], budget-tree [the ONLY list on /budgets now — no separate fixed-expense tab; renders category/subcategory boxes plus a `renderFixedExpenseActions` slot per nested fixed-expense row for pay/edit/delete, shared read-only (no action slots passed) by the dashboard panel], progress-row [shared planned-vs-actual bar], clone-budget-button, deactivate-budget-button [hidden by the caller when fixed expenses are attached; deactivateBudget itself also blocks it server-side], deactivate-fixed-expense-button, pay-fixed-expense-dialog)
 │  └ categories/components (category-form-dialog, subcategory-form-dialog, category-tree-item [onboarding/Settings re-import — always renders the full is_default catalog, already-imported items checked+disabled], category-select [CategorySelect/SubcategorySelect — standard picker used everywhere a category/subcategory is assigned, with a "Nova categoria/subcategoria" item at the end of the same dropdown instead of a separate button; replaced the old inline-category-create.tsx, decided 2026-08-09], delete-category-dialog)
 ├ components
 │  ├ ui (button, card, input/field/label/textarea, dialog, select [incl. SelectGroup/SelectLabel for grouped options], tabs, checkbox, switch, dropdown-menu, popover, table, badge, icon-picker + icon-set, account-type-icon [CASH/BANK/CREDIT_CARD → Banknote/Wallet/CreditCard, shared by Accounts + transaction lists], account-select [standard account picker grouped by type in CASH→BANK→CREDIT_CARD order with the type icon per row, used wherever an account of any type — including CREDIT_CARD — can be picked, e.g. Fixed Expenses], month-picker [prev/next + click-anywhere-on-label native month picker, shared by Dashboard/Cards/Transactions month navigators], loading-overlay [full-screen "Carregando…" overlay, Industry corner-marks card — rendered by every route's loading.tsx AND by NavigationProgressProvider below], confirm-delete-dialog, corner-marks — the Industry blueprint frame)
 │  ├ layout (sidebar, header, bottom-navigation, nav-items)
 │  └ providers (navigation-progress.tsx — NavigationProgressProvider/useNavigationProgress, mounted once in (app)/layout.tsx; every filter/month-nav component calls navigate() from this instead of router.push directly, added 2026-08-10 — see "Known gaps" note below on why this exists alongside loading.tsx)
 ├ types (database.ts — raw row shapes; dto.ts — the DTOs below, source of truth)
 └ app
    ├ (auth)/login, (auth)/signup, (auth)/actions.ts
    ├ onboarding/ (outside the (app) group — no sidebar/nav chrome; reused for the Settings re-import flow too; onboarding/budget/ is the first-time-only "plan this month's budget" step reached right after picking starter categories)
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
getDefaultCategoryImportOptions() → CategoryImportOptionDTO[]
  -- catálogo is_default INTEIRO (fixed 2026-08-08 — antes filtrava e só devolvia o que
  -- faltava), cada item marcado com alreadyImported (+ userCategoryId quando true) — a
  -- picker do onboarding/Settings renderiza os já importados marcados e desabilitados
copyDefaultCategories(selectedCategoryIds, selectedSubcategoryIds)  -- fluxo de onboarding/
  -- reimportação, INSERT de cópia; uma subcategoria selecionada cujo pai NÃO está em
  -- selectedCategoryIds é anexada à categoria já existente do usuário (resolvida por
  -- type+name), não cria uma categoria duplicada
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
  -- data.paidThroughCompetence (NOVO 0014, "YYYY-MM") marca a compra como retroativa/backfill —
  -- toda installment gerada com competence <= isso nasce com paid_before_system = true (prefixo
  -- contíguo, nunca parcelas alternadas). Ver AI_CONTEXT.md "Compras retroativas"
getCardPurchases(cardId)
getCardInstallments(cardId)
getCardBalanceThroughMonth(creditCardId, throughMonth) → number
  -- installments com competence <= throughMonth E paid_before_system = false, menos pagamentos
  -- já feitos, floor em 0 — parcelas de compra retroativa já contam como quitadas
getCardTotalCommitted(creditCardId) → number
  -- TODAS as installments já geradas pro cartão (passadas, do mês atual e futuras ainda não
  -- vencidas) COM paid_before_system = false, menos TODOS os pagamentos já feitos, floor em 0 —
  -- a figura correta de "usado contra o limite" (fixed 2026-08-07). Deliberadamente diferente de
  -- getCardBalanceThroughMonth, que exclui parcelas futuras ainda não vencidas de propósito (ver
  -- AI_CONTEXT.md "CREDIT_CARD_PAYMENT" — essa outra alimenta a sugestão do "Pagar fatura", não o
  -- card "usado/total")
getCardSummary(creditCardId, viewedMonth, creditLimit) → CardSummaryDTO
  -- dois conceitos de mês independentes, de propósito não são o mesmo parâmetro:
  -- usedThroughCurrentMonth/overdueAmount ficam SEMPRE ancorados no mês real de hoje (o quanto
  -- devo agora — alimenta a sugestão do "Pagar fatura"), mesmo que a página esteja navegando
  -- por outro mês via o filtro; currentMonthInvoice reflete `viewedMonth` (o mês filtrado na
  -- página); totalCommitted (= getCardTotalCommitted) não depende de mês nenhum — é o "usado/total"
  -- correto contra o limite. Ver AI_CONTEXT.md "Credit Card Purchases" pro raciocínio completo.
  -- currentMonthInvoice NÃO exclui parcelas paid_before_system — representa o fato histórico "o
  -- que foi faturado naquele mês", que não muda por causa de um lançamento retroativo posterior.
registerCardPayment(data)
```

## reservoirs.service.ts
```
-- feature exibida na UI como "Receita Programada" (renomeado 2026-08-07, só o label/ícone —
-- ver AI_CONTEXT.md "Reservoir (Cofre)"); nomes de rota/tabela/service/DTO permanecem reservoir*
createReservoir(data)   -- data pode incluir defaultPercentage/defaultDestinationAccountId (0010)
updateReservoir(data)   -- edita name/categoryId/subcategoryId/defaultPercentage/
  -- defaultDestinationAccountId a qualquer momento (partial update)
addReservoirTransaction(data)   -- lançamento de acúmulo (amount positivo); description default
  -- = "Movimentação da receita programada {nome}" quando não informada
updateReservoirTransaction(data)  -- edita um lançamento de acúmulo (date/amount/grossAmount/
  -- percentage/description); bloqueia se o lançamento for um saque (linked_transaction_id ou
  -- linked_card_purchase_id setado) — saques não são editáveis por aqui, só excluíveis
withdrawReservoir(data)         -- saque (amount negativo, cria transaction vinculada); mesmo
  -- default de description do acúmulo, aplicado tanto no ledger quanto na transaction vinculada
deleteReservoirTransaction(id)  -- NOVO (2026-08-10): exclui um lançamento do ledger (acúmulo ou
  -- saque). Se for um saque, também exclui a transactions/card_purchases vinculada — excluir só
  -- o lançamento do ledger e deixar a transaction real órfã não faz sentido, já que ela só
  -- existe por causa do saque
getReservoirs() → ReservoirDTO[]   -- inclui defaultPercentage/defaultDestinationAccountId, usados
  -- pra pré-preencher AccrualDialog/WithdrawalDialog (AI_CONTEXT.md "Reservoir (Cofre)")
getReservoirTransactions(reservoirId) → ReservoirTransactionDTO[]
deleteReservoir(id)   -- NOVO (2026-08-10): hard delete, não segue o convênio `active` do resto
  -- do schema (AI_CONTEXT.md "Reservoir deletion") — reservoir_transactions cascateia (ON DELETE
  -- CASCADE), mas qualquer transactions real vinculada por um saque nunca é tocada pela cascata
  -- (a FK aponta na direção contrária), então o histórico de dinheiro real sempre sobrevive
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

## budgets.service.ts
```
createBudget(data) → { id, notices[] }   -- data inclui month (imutável após criação)
updateBudget(id, data) → { notices[] }
  -- ambos aplicam o piso da hierarquia (ver AI_CONTEXT.md "Budget hierarchy") antes de
  -- salvar: se amount < floor (soma de budgets de subcategoria + fixed_expenses diretas,
  -- ambos escopados ao mesmo month), lança erro — bloqueio duro, nunca silencioso. Depois
  -- de salvar um orçamento de SUBcategoria, chama deactivateCategoryBudgetIfOverCommitted
  -- (_shared.ts) — NUNCA reconcileBudgetFloors (esse era o bug: subcategoria nunca deve
  -- criar/aumentar a categoria, só pode invalidar uma linha explícita já insuficiente)
deactivateBudget(id)  -- soft delete
  -- NOVO (2026-08-08): bloqueia se a linha for o piso de alguma fixed_expense ativa (mesma
  -- checagem de deactivateCategoryBudgetIfOverCommitted, mas do lado do delete manual) —
  -- lança erro em vez de apagar, pra nunca orfanizar o piso. Vale tanto pro botão de
  -- excluir de uma linha quanto pro atalho "limpar o campo" do budget-tree-editor
getBudgets(month) → BudgetDTO[]   -- month agora filtra a coluna budgets.month (migration 0009)
getBudgetTree(month, fixedExpenses) → BudgetTreeCategoryDTO[]
  -- leitura agrupada/em árvore usada por /budgets e o painel do dashboard — ver AI_CONTEXT.md
  -- "Category ceilings are never computed". `budget` de cada categoria é a linha real do mês
  -- ou null (nunca uma soma implícita); fixedExpenses vem de getFixedExpenses(month), já
  -- calculado pelo caller, só é reagrupado aqui
getBudgetMonthWindow() → BudgetMonthWindowDTO
  -- currentMonth/nextMonth/hasCurrentMonthBudget/lastRegisteredMonth — decide quais meses
  -- podem ser criados/editados agora e de onde "clonar" copia (ver AI_CONTEXT.md "Which
  -- months can be planned")
cloneBudgetMonth(fromMonth, toMonth) → { count }
  -- copia toda linha ativa de fromMonth pra toMonth verbatim, sem revalidar floors (uma
  -- cópia de um mês já consistente não pode gerar inconsistência)
getBudgetFloor(categoryId, subcategoryId, month) → number
  -- NOVO (2026-08-09): wrapper fino sobre getCategoryBudgetFloor/getSubcategoryBudgetFloor,
  -- exposto via getBudgetFloorAction pro client mostrar/aplicar o piso direto no input de
  -- valor (BudgetFormDialog, BudgetTreeFields) em vez de só descobrir via erro pós-submit —
  -- o bloqueio real continua sendo createBudget/updateBudget no servidor
```

## fixed-expenses.service.ts
```
createFixedExpense(data) → { id, notices[] }
updateFixedExpense(id, data) → { notices[] }
  -- uma despesa fixa é um piso comprometido do orçamento da sua categoria/subcategoria —
  -- nunca bloqueia; ambas chamam reconcileFixedExpenseFloors (_shared.ts) depois de salvar,
  -- pro mês corrente sempre + o próximo mês também se já existir orçamento NAQUELE MESMO
  -- NÍVEL (categoria OU subcategoria, o que a despesa fixa realmente usa) — devolve
  -- `notices[]` com o texto pronto. Despesa fixa direto na CATEGORIA (sem subcategoria)
  -- ainda cria/aumenta o orçamento da categoria normalmente; despesa fixa numa
  -- SUBCATEGORIA (revisado 2026-08-10) só cria/aumenta o orçamento da subcategoria — nunca
  -- o da categoria, que só pode ser desativado (nunca criado/aumentado) por reflexo, ver
  -- reconcileBudgetFloors abaixo
deactivateFixedExpense(id)  -- soft delete
getFixedExpenses(month) → FixedExpenseDTO[]
  -- actualAmount soma transactions.fixed_expense_id (por date) + card_installments das
  -- card_purchases.fixed_expense_id (por competence, NUNCA purchase_date — atualizado 2026-08-10
  -- junto com o suporte a pagar despesa fixa no cartão, ver payFixedExpense abaixo)
payFixedExpense(data)  -- NOVO (2026-08-09), estendido 2026-08-10 pra aceitar CREDIT_CARD: o
  -- tipo da conta (lido do banco, nunca confiado do client) decide o lançamento — CASH/BANK
  -- continua criando uma transaction EXPENSE (createTransaction com fixedExpenseId); CREDIT_CARD
  -- agora cria uma card_purchases de 1x (createCardPurchase com fixedExpenseId, installments: 1),
  -- competência derivada normalmente do closing_day/due_day do cartão (nenhuma lógica de
  -- competência própria — reaproveita a mesma de qualquer outra compra). Ambos os caminhos
  -- defaultam description pra "Pagamento — {nome}" no servidor quando vem vazio, mesmo padrão de
  -- registerCardPayment/addDebtTransaction. payFixedExpenseAction (budgets/actions.ts) chama isso
  -- em vez de createTransaction/createCardPurchase direto.
cancelFixedExpensePayment(fixedExpenseId, month)  -- NOVO (2026-08-10): contraparte de
  -- payFixedExpense, pro rollback de um pagamento registrado por engano. Apaga os registros
  -- reais de UM mês específico que fazem getFixedExpenses() computar isPaidThisMonth = true
  -- pra aquela despesa: transactions.fixed_expense_id no intervalo do mês, e card_purchases.
  -- fixed_expense_id cujas installments têm competence no mês (card_installments cascateiam
  -- com a purchase, nenhuma limpeza extra). cancelFixedExpensePaymentAction (budgets/actions.ts)
  -- chama isso a partir de PayFixedExpenseDialog quando o usuário clica "Cancelar pagamento".
```

## _shared.ts
```
getActualAmountForCategory(...)  -- reusado por budgets e fixed-expenses pro actualAmount do mês
getCategoryBudgetFloor(supabase, userId, categoryId, month) → number
  -- SUM(budgets de subcategoria ativos da categoria NAQUELE month) + SUM(fixed_expenses
  -- ativas direto na categoria, sem subcategoria — essas não são escopadas por mês)
getSubcategoryBudgetFloor(supabase, userId, subcategoryId) → number
  -- SUM(fixed_expenses ativas daquela subcategoria) — sem parâmetro month, só lê fixed_expenses
reconcileBudgetFloors(supabase, userId, categoryId, subcategoryId, month) → string[]
  -- auto-raise/create pra UM mês específico, só chamada a partir de reconcileFixedExpenseFloors.
  -- REVISADO (2026-08-10): com subcategoryId setado, só cria/aumenta a SUBcategoria — nunca
  -- mais bubbling automático pra categoria (esse era o comportamento antigo, que contradizia
  -- "category ceilings are never computed"); em seguida chama
  -- deactivateCategoryBudgetIfOverCommitted pra só DESATIVAR a categoria se perdeu o espaço
  -- vago. Com subcategoryId null (despesa fixa direto na categoria) mantém o comportamento
  -- original: cria/aumenta a categoria a partir de getCategoryBudgetFloor
reconcileFixedExpenseFloors(supabase, userId, categoryId, subcategoryId) → string[]
  -- decide os meses (mês corrente sempre + próximo mês se já existir orçamento NAQUELE MESMO
  -- NÍVEL — categoria ou subcategoria, fixed 2026-08-10, antes checava sempre o nível
  -- categoria mesmo quando a despesa era de subcategoria) e chama reconcileBudgetFloors pra
  -- cada um
deactivateCategoryBudgetIfOverCommitted(supabase, userId, categoryId, month) → string | null
  -- chamada depois de criar/editar um orçamento de SUBcategoria OU de aumentar uma
  -- subcategoria via despesa fixa (unificado 2026-08-10) — nunca cria nem aumenta a
  -- categoria, só desativa a linha ativa da categoria (nesse month) se ela não sobrou MAIOR
  -- que a soma das subcategorias — um empate (preenchimento exato, sem sobra) também
  -- desativa agora (tightened 2026-08-10, antes só desativava se a soma ULTRAPASSASSE) — e
  -- devolve o aviso pronto pra UI. Nunca desativa se a categoria tem fixed_expenses diretas
  -- (o piso delas nunca pode ficar órfão)
```

---

# DTO Definitions

Source of truth is `src/types/dto.ts` — this block mirrors it exactly; if they ever drift, the code wins and this block needs fixing, not the other way around.

```typescript
type FinancialSummaryDTO = {
  balance: number; income: number; expense: number; result: number
  adjustmentShare: number // % of period total sitting under "Ajuste" — bookkeeping-looseness signal
  retroactiveIncomeShare: number // % of period total from paid-before-system installments (backfilled purchases) — distinct signal from adjustmentShare, see AI_CONTEXT.md "Compras retroativas"
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
  source: "transaction" | "installment" // "installment" rows come from card_purchases — amount/date/installment-count edit and delete stay Cards-page-only; category/subcategory can be inline-edited from either place (dashboard or Cards), via `purchaseId` below
  purchaseId?: string // set only when source === "installment" — the id inline edits must target (card_purchases), since `id` above is the installment's own id and card_installments carries no category itself
  paidBeforeSystem?: boolean // set only when source === "installment" — backfilled purchase installment already paid outside the system, see AI_CONTEXT.md "Compras retroativas"
}

type ReservoirDTO = {
  id: string; name: string; balance: number; categoryId: string | null; categoryName: string | null // balance = SUM(reservoir_transactions.amount)
  defaultPercentage?: number; defaultDestinationAccountId?: string // NOVO (0010) — pré-preenchem AccrualDialog/WithdrawalDialog
}

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
  paidThroughCompetence?: string // "YYYY-MM" — compra retroativa ("já paguei até este mês"); toda parcela gerada com competence <= isso nasce com paid_before_system = true, ver AI_CONTEXT.md "Compras retroativas"
}

type CardInstallmentDTO = {
  id: string; purchaseId: string
  installmentNumber: number    // derivado — ordenado por competence entre TODAS as parcelas da purchase (não só as do período filtrado), nunca uma coluna
  totalInstallments: number    // = card_purchases.installments
  amount: number; competenceMonth: string; description: string
  paidBeforeSystem: boolean    // parcela de compra retroativa já paga antes do sistema — some do saldo/fatura em aberto do cartão, mas conta normal em despesa por categoria
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
  paidDate?: string            // NOVO (2026-08-10): só setado quando isPaidThisMonth — data da transaction/card_purchase que pagou naquele mês, pro texto do "já pago"
  status: "OK" | "EXCEEDED"
}

// Leitura em árvore usada por /budgets e o painel do dashboard (AI_CONTEXT.md "Budgets" —
// "Category ceilings are never computed"). `budget` nulo = sem linha ativa da categoria nesse
// mês — NUNCA um valor implícito calculado; a UI então não mostra número nenhum de categoria.
type BudgetTreeSubcategoryDTO = {
  budgetId: string; subcategoryId: string; subcategoryName: string
  plannedAmount: number; actualAmount: number; status: "OK" | "EXCEEDED"
  fixedExpenses: FixedExpenseDTO[]
}
type BudgetTreeCategoryDTO = {
  categoryId: string; categoryName: string; icon: string | null
  budget: { id: string; plannedAmount: number; actualAmount: number; status: "OK" | "EXCEEDED" } | null
  subcategories: BudgetTreeSubcategoryDTO[]   // sempre linhas reais
  directFixedExpenses: FixedExpenseDTO[]      // implica budget !== null, por construção
}

// getBudgetMonthWindow() — quais meses podem ser planejados agora e de onde "clonar" copia.
type BudgetMonthWindowDTO = {
  currentMonth: string; nextMonth: string
  hasCurrentMonthBudget: boolean; lastRegisteredMonth: string | null
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
  creditLimit?: number | null // CREDIT_CARD — obrigatório e sempre > 0 (migration 0008); nulo só em contas não-CREDIT_CARD. Soft-enforced é só o excesso de compra contra o limite, nunca a presença do limite em si
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

type CategoryImportOptionDTO = {
  id: string; name: string; type: CategoryType; color: string; icon: string | null
  alreadyImported: boolean
  userCategoryId: string | null  // set quando alreadyImported — a cópia já existente do usuário
  subcategories: { id: string; name: string; alreadyImported: boolean }[]
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
