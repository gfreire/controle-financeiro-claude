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

**Built**: auth (signup/login/signout, email-confirmation-aware), onboarding (category tree-picker — uncheck a subcategory to keep the rest of the category; re-openable from Settings to import more, always showing the FULL is_default catalog with already-imported categories/subcategories rendered checked+disabled rather than hidden), all 8 services + their Server Actions, Dashboard (filters incl. month-by-month navigator via the shared `MonthPicker` — click-anywhere-on-label opens the native picker, not just the browser's own tiny icon hit-area —, account filter shows each account's type icon, category filter grouped under "Receitas"/"Despesas" `SelectGroup`s, 4 charts, budgets/fixed-expenses panel scoped to the filtered period (not always the current month) with fixed expenses nested under their parent budget, Transaction Explorer with inline category edit + a full-edit dialog (pencil icon, amount/date/description/account/type, `source: "transaction"` rows only — installments stay Cards-page-only) + delete + account-type icon per row — no standalone batch-reassign button, that only lives inside category deletion now), Transactions (month-scoped like Cards/Dashboard — a `MonthNav` filters the list to one month at a time instead of loading every transaction ever logged; create/edit/delete; no manual "pay card bill" here — see below; `CREDIT_CARD_PAYMENT` rows show a "Pagamento de Cartão" label instead of a category), Accounts (create with institution-first naming — no institution field for `CASH`; initial balance for CASH/BANK; Informar Rendimento restricted to `BANK` since cash doesn't yield; Ajustar Saldo for CASH+BANK; Ajustar Limite/Ajustar Cartão quick action for `credit_limit`/`overdraft_limit`, editable anytime, and for `CREDIT_CARD` also `closing_day`/`due_day` in the same dialog; `credit_limit` required and always > 0 for `CREDIT_CARD` accounts; each `CREDIT_CARD` account card shows the same `totalCommitted / creditLimit` usage figure as the Cards page; account-type icon — Banknote/Wallet/CreditCard — shown consistently on the Accounts page, transaction lists, and the dashboard's account filter), Cards (create/edit/delete a purchase — edit rolls back and regenerates every installment; competence month defaults from `closing_day` but is directly overridable; inline category/subcategory editing per installment row, same `EditableCategoryCell` pattern as the dashboard; pay-the-bill flow suggests the statement balance through TODAY's real month regardless of the page's month filter; soft credit-limit warning, never blocks; card summary shows usado/total against the full committed balance incl. future installments, the VIEWED month's invoice, and the overdue amount; a purchase can be backfilled as retroactive — "compra antiga" checkbox + "pago até" month picker flags a contiguous prefix of its installments as `paid_before_system`, excluded from the committed/outstanding balance but still counted in category analytics and, as a computed (non-transaction) amount, in the dashboard's income totals — see AI_CONTEXT.md "Compras retroativas"), "Receita Programada" — displayed name for the Reservoir feature, route/table/service/DTO names still `reservoir*` (accrual/withdrawal entries, description defaults to "Movimentação da receita programada {nome}"), Debts (pie charts for "a pagar"/"a receber" at the top, each shown only when that side has data; payment/increase dialog defaults its description to "Movimentação da dívida {nome}"; a payment that fully settles or overpays a debt is soft-deleted automatically after a confirm-again warning; a debt has a default category, typed to whichever direction a payment always produces, pre-filled — always overridable — on the payment dialog only, never on the opposite-typed "increase" one; the debt itself is editable — agent/side/initial balance/default category — and manually deletable for a forgiven/given-up-on debt, no payment needed; each ledger entry is editable or deletable too, propagating amount/date/description/category to its linked transaction when one exists, direction locked so a payment can never become an increase via edit), Budgets/Fixed Expenses (budgets are month-scoped — `MonthNav` browses any month, but only the current real month and the next one, once the current month has a budget, are creatable/editable; every earlier month is read-only history; "Clonar de {mês}" copies a prior month's rows verbatim when the viewed editable month is empty; a category's own number is always real-or-absent, never an implicit sum of its subcategories — saving a subcategory budget can only erase an insufficient category row, never inflate one; a fixed expense is still a committed floor that auto-raises/creates the category or subcategory budget with a notice, never blocks, now scoped to current + next month; a budget can never be manually lowered below what its subcategory budgets + fixed expenses commit to, a hard block, and can never be *deleted* at all while fixed expenses depend on it (only raised) — the delete button hides itself in that case, and the service blocks it too either way; `/budgets` is a single unified view now, no more separate tabs — one tree (shared read-only by the dashboard panel) nested when a category has real headroom, merged into one box when a lone subcategory has no category number of its own, or standalone boxes under a bare label when there are several, with each fixed expense's pay/edit/delete actions living directly on its own nested row, and its progress bar reflecting real paid status, never the planned placeholder; a tree-based "Planejar orçamentos" screen plans (or bulk-deletes, by clearing a field) a whole category + subcategories for one month in one place, reusing the onboarding tree-picker's visual pattern and shared with the first-time onboarding budget step; the page also lists the viewed month's transactions/card purchases at the bottom, reusing the dashboard's `TransactionExplorer`; "Registrar pagamento" defaults its description to "Pagamento — {nome da despesa fixa}"), Settings (category/subcategory CRUD with guided-deletion, curated emoji icon picker — no free-text icon field).

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
- **Phantom scrollbars on every dialog (fixed 2026-08-23, found by the user testing).** `DialogContent` (`src/components/ui/dialog.tsx`) had `overflow-y-auto` on the same element that renders `<CornerMarks />`, the shared "Industry" corner-tick decoration — but `.corner-tl`/`.corner-tr`/`.corner-bl`/`.corner-br` (`globals.css`) are absolutely positioned with **negative** offsets (`-6px`), deliberately bleeding past the box edge to sit outside the visible border. A scrollable ancestor counts that bleed as real overflow, so every dialog showed both a horizontal and a vertical scrollbar even when its content plainly fit — visually, a stray light rounded shape and scrollbar tracks around an otherwise normal modal. Fixed by moving the scroll to a new inner `<div className="overflow-y-auto p-4">` wrapping only `{children}`, while `DialogContent` itself (where `<CornerMarks />` lives) no longer scrolls — so the corner decoration's bleed is never counted as content overflow. `Card` (`src/components/ui/card.tsx`) never had this problem since it doesn't set its own overflow.
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
- **Debts gained a default category (migration `0015`, 2026-08-11, at the user's request).** `DebtFormDialog` now has a "Categoria padrão (ao pagar)" field (`debts.default_category_id`), typed `EXPENSE` for a `PAYABLE` debt and `INCOME` for a `RECEIVABLE` one — the same type a *payment* against that debt always produces (`debts.service.ts#addDebtTransaction`'s existing side/direction logic, unchanged). `DebtTransactionDialog` now shows a "Categoria" field whenever it's creating a linked transaction, pre-filled from the debt's default only in `mode="payment"` (never `"increase"`, which is always the opposite category type and has no default) and freely overridable before submitting. `debtTransactionSchema` gained an optional `categoryId`; `addDebtTransaction` writes it onto the linked `transactions` row, falling back to the debt's `default_category_id` server-side only when the payment path (`isReduction`) omits it outright — a linked transaction created via "increase" mode never falls back to the mismatched-type default. Since `default_category_id` is a normal `RESTRICT` FK to `categories` (no `ON DELETE`, matching every other category reference in the schema), it's wired into the same guided-deletion machinery as `transactions`/`card_purchases`/`budgets`/`fixed_expenses`/`reservoirs`: `categories.service.ts#countReferences`/`reassignCategory` special-case `debts` (its column is `default_category_id`, not `category_id`, and it has no subcategory concept at all), and `CategoryUsageDTO.debtsCount` surfaces it in `DeleteCategoryDialog`'s usage preview.
- **Debts gained edit/delete for both the debt header and individual ledger entries (migration `0016`, 2026-08-11, at the user's request — "falta colocar um form de edit da divida", "falta botao de excluir divida", "faltou a parte de editar ou deletar as transacoes de dividas relfetindo a transacao linkada").** Three gaps closed together, all following patterns already established for `reservoirs`/`reservoir_transactions`:
  - `DebtFormDialog` gained an edit mode (`debt?` prop, mirroring `ReservoirFormDialog`'s `reservoir?` prop) — agent/side/initial balance/default category are all freely editable after creation via `debts.service.ts#updateDebt`. This is the actual fix for "no way to set or change the default category after creating the debt."
  - `DeleteDebtButton` (new) calls the existing `deactivateDebt` directly (no ledger entry, no linked transaction) — for a debt that's forgiven, or one the user has simply given up on collecting. This is a manual trigger for the same soft-delete `addDebtTransaction` already applies automatically when a payment brings the balance to zero; the manual path just skips the payment.
  - `debt_transactions` gained a `date` column (previously missing entirely — see migration `0016` above) and are now editable/deletable in place, mirroring `reservoirs.service.ts#updateReservoirTransaction`/`deleteReservoirTransaction` — but *less* restrictive: reservoirs blocks editing a withdrawal outright, while `debts.service.ts#updateDebtTransaction` allows editing any entry (linked or not) and propagates amount/date/description/category onto the linked `transactions` row when one exists, per `AI_CONTEXT.md` → "Linked Records Consistency". The one thing editing can never do is flip an entry's direction (a payment can't become an increase) — enforced by comparing `Math.sign()` of the old and new amount server-side, since the create-side UI already treats "aumento" and "pagamento" as two separate dialogs/buttons, never a toggle. `deleteDebtTransaction` deletes the linked `transactions` row too, exactly like `deleteReservoirTransaction`. Both re-run the same settle-to-zero balance check `addDebtTransaction` does post-insert, since an edit or delete can just as well bring a debt to zero as a new entry can (there's no path to *reactivate* a debt this way, since a deactivated one no longer renders in the list `updateDebtTransaction`/`deleteDebtTransaction` are reachable from). `DebtTransactionDTO.categoryId` (new) exposes the linked transaction's own category so the edit dialog can prefill it; account reassignment was deliberately left out of scope (not requested, and riskier — an edit dialog doesn't offer to change which account a linked transaction posted against).

- **Debts gained subtypes — `PERSONAL`/`OVERDUE_BILL`/`INSTALLMENT_PLAN` (migration `0021`, 2026-08-23, at the user's request).** See `AI_CONTEXT.md` → "Dívidas — subtipos" for the full design. `PERSONAL` preserves the original behavior exactly (default value, never touches the dashboard). `OVERDUE_BILL`/`INSTALLMENT_PLAN` are always `PAYABLE` (`DebtFormDialog` locks and hides the direction picker for them) and both now surface in a new, always-visible (period-filter-independent) dashboard card, `OpenDebtsAlert` — "Dívidas em aberto." `INSTALLMENT_PLAN` additionally carries `monthlyAmount`/`dueDay` and a computed `paidThisMonth` (`getDebts()`), driving a due-date badge identical in spirit to Fixed Expenses' — with a "Registrar pagamento" one-click trigger (`DebtTransactionDialog`'s new `defaultAmount` prop) instead of any automatic transaction generation, a decision the user made explicitly ("lembrete + 1 clique," rejecting a fully-automatic monthly post as inconsistent with the rest of the system never creating a ledger entry without an explicit user action). `DebtTransactionDialog`'s `mode="increase"` also gained an optional interest-percentage calculator (suggests `currentBalance × %`, `roundMoney`) — available to any debt, not just the new kinds.
- **Dashboard chart overhaul (2026-08-14, at the user's request).** Several distinct changes, all in the presentation layer — no schema change, no new domain rule:
  - Every Recharts tooltip across the app was missing an explicit text `color`, defaulting to Recharts' own near-black — unreadable against a dark-mode surface. Centralized into `src/components/ui/chart-tooltip.tsx` (`chartTooltipStyle`, spread onto every `<Tooltip>`), replacing 5 copies of the same near-miss inline style (4 dashboard charts + `debts-charts.tsx`).
  - The plain "Receita vs. Despesa" bar chart (`income-expense-chart.tsx`) was removed outright — it duplicated what the summary cards and Monthly Evolution already show, and added nothing beyond a single-period totals bar.
  - **The dashboard's category filter is now additive/multi-select**, not single-select: `DashboardFilters.categories` was already `string[]` (and `parseDashboardFilters` already parsed a comma-joined list) — only the UI was single-select before. `src/features/dashboard/use-category-filter.ts` (`useCategoryFilter`) centralizes the toggle/clear logic against the `categories` URL param; `CategoryMultiSelect` (replacing the old single `<Select>` in `dashboard-filters.tsx`) and the click-to-toggle affordance on `CategoryPie`/`CategoryBars` all share it, so picking a category from the dropdown and clicking a slice/bar always agree on the same selection. `CategoryBars` gained `onClick` for the first time — previously only the donut was clickable, despite `getCategoryComparison` being `getCategoryDistribution` minus `icon`, i.e. the same underlying data.
  - **Monthly Evolution now always spans 12 months in the past plus 3 months in the future** relative to the currently-viewed reference month, independent of the dashboard's own period preset (previously it inherited whatever period was selected, so the default "Mês" preset rendered it as a single bar — an evolution chart with one data point; extended to include 3 future months 2026-08-14, at the user's follow-up request, so already-scheduled future card installments show up too). `dashboard/page.tsx` builds a separate `monthlyEvolutionFilters` (`periodStart = startOfMonth(addMonthsToIsoDate(referenceMonthStart, -11))`, `periodEnd = endOfMonth(addMonthsToIsoDate(referenceMonthStart, 3))`), keeping the same category/account/type filters as the rest of the page. Future months only ever show EXPENSE bars in practice — a real `transactions` INCOME row can't exist for a date that hasn't happened, but `card_installments` for an already-registered multi-installment purchase legitimately do.
  - **Added a "Receitas por categoria" donut+comparison pair mirroring the existing expense pair**, reusing `CategoryPie`/`CategoryBars` (now accepting a `title` prop) with `transactionType` forced to `"INCOME"`/`"EXPENSE"` respectively — both pairs always render side by side regardless of the global "Tipo" filter, since `getCategoryDistribution`/`getCategoryComparison` already supported this via a per-call override (no service change needed beyond the account-type segmentation below).
  - **The expense donut+comparison pair can be segmented by account type** (Todas as contas / Dinheiro + Banco / Cartões) via `ExpenseSourceToggle`, local to that pair only — not the global filter bar, not the income pair. Backed by a new `DashboardFilters.source?: "all" | "liquid" | "cards"` that `fetchPeriodEntries` (`dashboard.service.ts`) uses to skip its `transactions` query (`source: "cards"`) or its `card_installments` query (`source: "liquid"`) — a plain EXPENSE transaction is never posted against a `CREDIT_CARD` account (that always flows through `card_purchases`/`card_installments`), so this cleanly splits the two source queries without needing per-account-id filtering.
  - **New "Evolução mensal do cartão" chart on `/cards`** (`CardEvolutionChart`, `cards.service.ts#getCardMonthlyEvolution`) — 6 months before through 6 months after the page's viewed month (13 months total; revised from an initial trailing-12 design 2026-08-14, at the user's follow-up request, so upcoming already-scheduled installments are visible alongside history) of `card_installments.amount` by competence (never `purchase_date`), scoped to whichever card(s) the page's existing "Cartão" filter has narrowed to, with its own local multi-select category filter (`evoCategories` URL param, `useEvolutionCategoryFilter`) deliberately independent from the page's existing single-select `categoryId` (which still only filters the installment list below). `total` is the historical billed total per month, same convention as `CardSummaryDTO.currentMonthInvoice` — does not exclude `paid_before_system` installments. **With no category selected the bars show that plain `total`; selecting one or more categories switches to stacked bars** (`CardMonthlyEvolutionDTO.byCategory`, one segment per selected category, colored/named from the category itself) instead of just narrowing the total to a smaller single number — added 2026-08-14 at the user's explicit request ("gostaria das barras dele fossem agregadas com o filtro"), so the filter shows composition, not just a shrunk sum.
  - The generic checkbox-popover UI (`src/components/ui/category-checkbox-filter.tsx`, `CategoryCheckboxFilter`) is shared by both the dashboard's `CategoryMultiSelect` and the Cards page's evolution-chart filter.

- **"Vence essa semana" dashboard alert (2026-08-23, at the user's request, from the system audit's usability findings).** New `src/features/dashboard/components/upcoming-due-alert.tsx` (`UpcomingDueAlert`) renders a small warning card above the summary cards listing every unpaid fixed expense either overdue or due within 7 days — omitted entirely when the list is empty, same "no empty-state noise" convention as the debts pie charts. No schema/service change: it's computed purely from `FixedExpenseDTO.dueDay`/`isPaidThisMonth` already returned by `getFixedExpenses`, via the new pure helper `daysUntilDueThisMonth(dueDay, todayIsoDate)` (`src/lib/utils/date.ts`). Always anchored to **today's real month**, never the dashboard's viewed-period filter — `dashboard/page.tsx` reuses the already-fetched `fixedExpenses` when the viewed month is today's month, and only fires a second `getFixedExpenses(todayIso())` call when browsing a different month, mirroring the existing `usedThroughCurrentMonth`/`openInvoiceMonth` today-anchored convention. Scoped to fixed expenses only for now — card invoice due dates and debt due dates are not yet folded into this alert.
- **Fixed expense "notices" no longer block the dialog (2026-08-23, at the user's request).** Saving a fixed expense that auto-raises/creates a budget floor (`reconcileFixedExpenseFloors`) used to swap `FixedExpenseFormDialog`'s entire content for a notice screen requiring an explicit "Ok" click before the dialog would close — friction on what's usually a routine, non-decision notification. The dialog now always closes immediately on a successful save; if there were notices, they render instead as a small self-dismissing (8s, or manual ×) banner anchored next to the trigger, never blocking or requiring the user to acknowledge before moving on. Same underlying `notices[]` from `createFixedExpenseAction`/`updateFixedExpenseAction`, just presented as an inline toast instead of a modal.

- **Invoice paid/partial-paid indicator on Cards and Contas (2026-08-12, at the user's request).** No schema change — `card_payments` has no competence/invoice-month column at all, only `{ credit_card_id, account_id, transaction_id, amount, payment_date }`, so "how much of THIS month's invoice is paid" isn't a stored fact, it's derived in `cards.service.ts#getCardSummary` (new `CardSummaryDTO.currentMonthPaidAmount`). The allocation rule: a `paid_before_system` installment in the viewed month counts as paid outright (already settled outside the system, per migration `0014`); the rest is covered by whatever's left of all-time `card_payments` after paying off every non-`paid_before_system` installment strictly before the viewed month — i.e. payments are assumed to apply oldest-competence-first, the same assumption `getCardBalanceThroughMonth`/`overdueAmount` already make implicitly (a payment reduces the oldest unpaid balance, never a month the user explicitly targets). This is a heuristic, not a ground truth: a payment actually intended to prepay a future month in advance will still show as clearing the oldest month first. `src/components/ui/invoice-paid-badge.tsx` (new, shared) renders a green "Paga" badge when `currentMonthPaidAmount >= currentMonthInvoice`, or `"{pago} pago · faltam {resto}"` when partial, and nothing when unpaid (`currentMonthPaidAmount === 0`) — used identically by `/cards` and `AccountCard` so the two screens can't show conflicting paid status for the same invoice, same convention as their shared `totalCommitted/creditLimit` block. See `AI_CONTEXT.md` → "Fatura: indicador de pago/parcial" for the full reasoning.

- **Open-invoice line on Cards and Contas (2026-08-23, at the user's request).** Both screens used to show only one invoice line per card ("Fatura de {mês}"), tied to whichever month is being viewed (the page's filter on `/cards`, always today's real month on `/accounts`). This conflates two genuinely different things once the card's closing day has already passed for the viewed month: the invoice being displayed, and the invoice actually still open (accumulating new charges right now). `cards.service.ts#getCardSummary` gained `CardSummaryDTO.openInvoiceMonth`/`openInvoiceAmount` — the competence a purchase made *today* would land in, via the same `calculateInstallmentCompetences` math a real purchase uses, always anchored to today (never the viewed-month filter), same convention as `usedThroughCurrentMonth`. Both `src/app/(app)/cards/page.tsx` and `AccountCard` now render a second "Fatura aberta ({mês}): {valor}" line — but only when `openInvoiceMonth` differs from the month already shown on the first line; when they're the same competence, the second line is omitted rather than showing a redundant duplicate. See `AI_CONTEXT.md` → "Credit Card Purchases" → "Fatura aberta vs. fatura do mês visualizado".
  - **This surfaced a real, pre-existing bug in `calculateInstallmentCompetences` itself (fixed the same day)**: the competence formula only accounted for `closing_day` (which cycle a purchase falls into), never the relationship between `closing_day` and `due_day` (which calendar month that cycle is actually due in). Harmless when `due_day > closing_day` (the common case), but wrong for a card like closes-28th/due-10th — the due date can only be chronologically after the close by landing in the *next* month, which the old formula didn't shift for. Fixed by adding a `dueMonthOffset` step; see `src/lib/utils/date.ts#calculateInstallmentCompetences`'s doc comment and `AI_CONTEXT.md` → "Credit Card Purchases" for the full before/after reasoning. Only affects the *default suggested* competence on new/edited purchases going forward — does not retroactively rewrite already-stored `card_installments.competence` (no migration was needed for the user's own data, since those particular purchases were already entered via the manual month-picker override).

- **Onboarding reordered to account → categories → budget, plus a quick-start category whitelist (2026-08-24, at the user's request).** First-time onboarding used to run categories → account → budget; `signUp` (`(auth)/actions.ts`) and the `(app)/layout.tsx` gate now redirect straight to `/onboarding/account` instead of `/onboarding`, and each step's own forward redirect was updated to match the new order (account → categories → budget → dashboard) — see `AI_CONTEXT.md` → "Onboarding — conta padrão". The categories step (`/onboarding/page.tsx`) also stopped pre-checking the *entire* `is_default` catalog for a first-time user — only a 5-category shortlist (`QUICK_START_CATEGORY_NAMES`: Alimentação, Compras, Moradia, Transporte, Salário) comes pre-checked now, everything else opt-in; this list is onboarding-screen-only, unrelated to the `is_default` flag itself. As a side effect (not new logic), the budget step that follows is naturally shorter for a first-time user, since it only ever shows categories the user actually imported.
- **Cards page empty state gained a working "create card" shortcut (2026-08-24, at the user's request).** `/cards` with zero cards used to just show static text pointing at Contas with no actual link. The button now navigates to `/accounts?newAccountType=CREDIT_CARD`; `AccountsPage` reads that param and passes `initialOpen`/`initialType` into `AccountFormDialog` (both new, optional props), so the "nova conta" dialog opens pre-set to `CREDIT_CARD` instead of its default `BANK`.

**Known gaps** (not started, don't assume otherwise): no automated tests yet (see "Testing & Migrations" in `AI_GENERATION_RULES.md` for the intended scope); still no *general* account-level edit dialog (name/institution) — only the type-specific actions (balance, yield/reconcile, limit) exist, by design; OFX import remains out of scope per `AI_CONTEXT.md`.

**Known bugs** (found in a full docs-vs-code audit, 2026-08-23; the first two below were fixed the same day, at the user's request — kept here as the record of what was wrong and why):
- **FIXED — edit paths now validate.** `updateAccountAction`/`updateCardPurchaseAction` (`src/features/accounts/actions.ts`, `src/features/cards/actions.ts`) previously called their services directly, skipping `updateAccountSchema`/`updateCardPurchaseSchema` entirely — so editing a card's `closingDay`/`dueDay`/`creditLimit` or a purchase's `amount`/`installments` had no server-side range/positivity check outside the bare `CHECK (credit_limit > 0)` in the database. Both actions now `.parse()` the merged `{ id, ...input }` through the existing (previously dead-code) schemas before calling the service, the same pattern the create-side actions already used.
- **FIXED — income categories can no longer get a subcategory via the service.** `categories.service.ts#createSubcategory` now looks up the parent category's `type` and throws before inserting if it's `INCOME`, instead of relying only on `src/app/(app)/settings/page.tsx` never rendering the create affordance for an income category. `validateCategoryTypeMatchesTransaction` (`src/lib/validations/transactions.ts`) — the separate, still-unused rule about a transaction's own type matching its category's type — remains dead code; not in scope of this fix.
- **`reservoirs.active` is vestigial, not actually removed.** `AI_CONTEXT.md` → "Reservoir deletion" describes reservoirs as having fully moved to hard-delete, and `deactivateReservoir` genuinely was deleted from the service — but the `active` column itself is still in the schema and `getReservoirs()` still filters `.eq("active", true)`. Since nothing ever writes `active = false` anymore, the column is permanently `true` and functionally dead weight, not a bug with user-visible effect — a future cleanup migration could drop it, but that's optional, not urgent.
- **`percentage` range disagrees between layers for reservoir accrual entries.** `src/lib/validations/reservoirs.ts` allows `percentage` down to `0` (`z.number().min(0).max(100)`), but the database `CHECK` on both `reservoirs.default_percentage` and `reservoir_transactions.percentage` requires `> 0`. Submitting exactly `0` passes client/zod validation and only fails at the database with a raw Postgres error instead of a friendly message. `AI_CONTEXT.md` describes the rule as "between 0 and 100" without settling which bound is inclusive — worth deciding (probably `> 0`, since a 0% cut is meaningless) and aligning the zod schema to match.

## Migrations changelog (`supabase/migrations/`)

Applied in order; each is additive (no destructive rewrites of an already-shipped migration — a new file corrects an old one). `schema.sql`/`seed.sql` in this folder always represent the *current* merged state, not migration 0001 alone.

1. `0001_initial_schema.sql` — full base schema (tables, enums, RLS).
2. `0002_seed.sql` — `is_system` categories + `is_default` starter pack + subcategories + `financial_institutions`.
3. `0003_profile_trigger.sql` — `on_auth_user_created` trigger, auto-creates `profiles` on signup.
4. `0004_onboarding_flag.sql` — `profiles.onboarding_completed`.
5. `0005_bank_initial_balance.sql` — `bank_accounts.initial_balance`.
6. `0006_remove_card_payment_subcategory.sql` — drops "Pagamento de Cartão" from the default `Dívidas` subcategories. **Known inconsistency (found in a docs audit, 2026-08-23):** `0002_seed.sql`'s current content already omits the `INSERT` for "Pagamento de Cartão" (only a comment explaining the removal remains), meaning `0002` was hand-edited after already being applied to the linked Supabase project — the one thing `AGENTS.md`/`AI_GENERATION_RULES.md` says never to do. The practical effect is limited (a fresh database built from today's migration files never has the subcategory either way, and `0006`'s `DELETE` is a harmless no-op against it), but the migration history as it reads today no longer matches what the sequence of files implies happened. No fix applied — rewriting `0002` again would repeat the same mistake; this note exists so a future session doesn't waste time trying to reconcile the discrepancy.
7. `0007_credit_card_limit.sql` — `credit_cards.credit_limit`.
8. `0008_credit_card_limit_required.sql` — makes `credit_cards.credit_limit` `NOT NULL` + `CHECK (> 0)`.
9. `0009_monthly_budgets.sql` — `budgets.month`, `NOT NULL` + a **partial** unique index `NULLS NOT DISTINCT (user_id, category_id, subcategory_id, month) WHERE active = true` (not a plain constraint — must coexist with the `active` soft-delete convention) + a `(user_id, month)` index.
10. `0010_reservoir_defaults.sql` — `reservoirs.default_percentage`, `reservoirs.default_destination_account_id`.
11. `0011_reservoir_transaction_date.sql` — `reservoir_transactions.date`, backfilled from `created_at` (the AccrualDialog's date picker was silently discarded before this — the column didn't exist).
12. `0012_card_purchase_fixed_expense.sql` — `card_purchases.fixed_expense_id`, `ON DELETE SET NULL` — lets a fixed expense be paid on a credit card as a single-installment (1x) purchase, tracked through `card_installments` like any other card purchase, instead of only supporting a plain `transactions` row against a CASH/BANK account.
13. `0013_performance_indexes.sql` — indexes on every hot filter/join column across `transactions`, `card_purchases`, `card_installments`, `reservoir_transactions`, `debt_transactions`, `fixed_expenses`, `accounts`, `debts`, `reservoirs` (Postgres never auto-indexes FKs). Shipped alongside two code-level fixes for the actual reported slowness, not the schema: `getOptionalUser()` (`src/lib/auth/getUser.ts`) now wrapped in React's `cache()` — it was re-validating against the Supabase Auth server on every call, and a single page load fans out into many parallel service calls that each call it independently (8-10 redundant round-trips per dashboard load, uncached); and the sequential `for...await` loops in `getDebts`/`getReservoirs`/`getFixedExpenses`/`getBudgets`/`getBudgetTree` (each doing a per-row DB round-trip one at a time) were parallelized with `Promise.all`.
14. `0014_card_installment_paid_before_system.sql` — `card_purchases.paid_through_competence` (date, nullable) + `card_installments.paid_before_system` (boolean, `NOT NULL DEFAULT false`) — lets a card purchase be backfilled from before the user started using the system, with a prefix of its installments marked already paid outside the system. See `AI_CONTEXT.md` → "Compras retroativas".
15. `0015_debt_default_category.sql` — `debts.default_category_id` (nullable FK to `categories`, RESTRICT). Pre-fills (and is always overridable) the category of a payment transaction registered against a debt. See `AI_CONTEXT.md` → "Debts".
16. `0016_debt_transaction_date.sql` — `debt_transactions.date` (date, `NOT NULL DEFAULT CURRENT_DATE`, backfilled from `created_at`). Same gap/fix as migration `0011` for `reservoir_transactions`: the date picker in `DebtTransactionDialog` was always shown but only ever reached the linked `transactions` row (when one existed) — an unlinked entry's chosen date was silently discarded. Needed so `updateDebtTransaction` has a real column to edit. See `AI_CONTEXT.md` → "Debts".
17. `0017_supermercado_own_category.sql` — data-only: promotes "Supermercado" from a default subcategory under "Alimentação" to its own default `EXPENSE` category (decided 2026-08-11, at the user's request — made more sense standalone in their own usage). Only touches the `is_default` catalog rows (`is_default = true`, `user_id IS NULL`) — no schema change, and no effect on any user's already-copied categories/subcategories.
18. `0018_supermercado_color.sql` — data-only: fixes "Supermercado" (`is_default` catalog) reusing "Alimentação"'s exact color (`#f97316`) since migration `0017` promoted it without giving it its own — the two were indistinguishable on any category chart. New default `#f59e0b`. Found and fixed 2026-08-14 alongside a pass recoloring the owner's own custom categories (see below) — same underlying bug: `CategoryFormDialog` defaults a brand-new category to `CATEGORY_COLORS[0]`, so any category created without the user explicitly touching the color picker ends up identical to every other un-recolored one.
19. `0019_estorno_refunds.sql` — adds the `Estorno` `is_system` category pair (EXPENSE + INCOME, mirroring `Ajuste`), `transactions.refund_of_transaction_id` (nullable self-FK, traceability only), and the new `card_refunds` table (`card_purchase_id` UNIQUE — full refund only). See `AI_CONTEXT.md` → "Estorno" for the full design, decided 2026-08-23 at the user's request after the system audit flagged refunds as a real coverage gap.
20. `0020_reload_schema_cache.sql` — no schema change, just `NOTIFY pgrst, 'reload schema'`. `supabase db push` connects directly to Postgres, which doesn't trigger the same schema-cache refresh the Dashboard/SQL Editor does — PostgREST kept returning "Could not find the table 'public.card_refunds'" until this ran. Worth remembering: any migration that adds a new table/column pushed via the CLI may need a same-day follow-up like this.
21. `0021_debt_kinds.sql` — adds `debts.kind` (`'PERSONAL' | 'OVERDUE_BILL' | 'INSTALLMENT_PLAN'`, default `'PERSONAL'` — preserves every existing debt's behavior), `debts.monthly_amount`, `debts.due_day` (both only meaningful for `INSTALLMENT_PLAN`, validated in `src/lib/validations/debts.ts`, not a DB CHECK). See `AI_CONTEXT.md` → "Dívidas — subtipos", decided 2026-08-23 at the user's request.
22. `0022_reload_schema_cache.sql` — same reasoning as `0020`, for the `debts` columns above.
23. `0023_fixed_expense_amount_history.sql` — adds `fixed_expense_amount_history` (`{fixed_expense_id, amount, effective_from}`, unique per `(fixed_expense_id, effective_from)`) — fixes a real bug the user caught testing: editing a fixed expense's amount used to rewrite every past month's `plannedAmount` retroactively, the exact mistake `budgets` migration `0009` already fixed for a different table. Backfills one row per existing fixed expense at `effective_from = '1970-01-01'` so nothing already displayed changes; only a future edit creates a genuinely forward-dated row. See `AI_CONTEXT.md` → "Despesas fixas — histórico de valor."
24. `0024_reload_schema_cache.sql` — same reasoning as `0020`, for `fixed_expense_amount_history`.
25. `0025_default_wallet_account.sql` — `CREATE OR REPLACE FUNCTION public.handle_new_user()`, no new table/column. The signup trigger (migration `0003`) now also inserts a "Carteira" `CASH` account (`accounts` + `cash_accounts`, `initial_balance = 0`) alongside the `profiles` row, so a brand-new user always has at least one account to log against before ever reaching the dashboard. See `AI_CONTEXT.md` → "Onboarding — conta padrão."

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
 │  ├ dashboard/components (dashboard-filters incl. shared MonthPicker + account-type icons per account + category-multi-select.tsx for the additive category filter, use-category-filter.ts, filters.ts [parseDashboardFilters], upcoming-due-alert.tsx ["Vence essa semana", always today-anchored], open-debts-alert.tsx ["Dívidas em aberto" — OVERDUE_BILL/INSTALLMENT_PLAN debts, always shown regardless of period filter, see AI_CONTEXT.md "Dívidas — subtipos"], summary-cards, monthly-chart [always 12 months back + 3 months forward from the viewed reference month, independent of the page's period preset], category-pie + category-bars [additive multi-select via use-category-filter.ts, shared by both — CategoryBars is clickable too now], expense-source-toggle [segments the expense pair only, by account type], budgets-panel [nests fixed expenses under their parent budget], transaction-explorer [account-type icon per row — no longer has its own "Reclassificar em lote" trigger, see below], editable-category-cell — income-expense-chart removed 2026-08-14, see Implementation Status)
 │  ├ transactions/components (transaction-form-dialog, delete-transaction-button, refund-transaction-dialog.tsx [full refund only, see AI_CONTEXT.md "Estorno"], month-nav, transaction-filters.tsx — Lançamentos is month-scoped like Cards/Dashboard, not an unfiltered all-time list)
 │  ├ accounts/components (account-form-dialog [no institution field for CASH], account-card, accounts-overview-charts.tsx [donut pair on /accounts: net balance + credit-card limit usage across cards, composable card selection], balance-adjust-dialog [Informar Rendimento BANK-only], limit-adjust-dialog [Ajustar Limite/Ajustar Cartão — credit_limit/overdraft_limit editable anytime; for CREDIT_CARD also edits closing_day/due_day in the same dialog, just a different trigger label])
 │  ├ cards/components (purchase-form-dialog [create+edit, competence override, over-limit warning], payment-form-dialog, refund-purchase-dialog.tsx [full refund only, see AI_CONTEXT.md "Estorno"], advance-installments-dialog.tsx ["Antecipar parcelas" — pays off one purchase's remaining not-yet-billed installments early, see AI_CONTEXT.md "Antecipar parcelas"], delete-purchase-button, month-nav, card-filters.tsx, card-expense-donut.tsx [current viewed month's billed total, segmented by card], card-evolution-chart [±6 months around the viewed month by competence, own local multi-select category filter via use-evolution-category-filter.ts — stacks bars by category when a filter is active, single total bar otherwise])
 │  ├ reservoirs/components (reservoir-form-dialog, accrual-dialog [description pre-filled with "Movimentação da receita programada {nome}"], withdrawal-dialog, delete-reservoir-button.tsx, delete-reservoir-transaction-button.tsx — feature displayed as "Receita Programada" in the UI, folder/file names unchanged)
 │  ├ debts/components (debt-form-dialog [create+edit, incl. default category + kind selector (Pessoal/Conta em atraso/Parcelamento combinado), locks side to PAYABLE for the latter two, shows monthlyAmount/dueDay fields for INSTALLMENT_PLAN], debt-transaction-dialog [create+edit, defaults description to "Movimentação da dívida {nome}"; optional interest-percentage calculator on mode="increase" (suggests amount = currentBalance × %, still editable); accepts a `defaultAmount` prop for quick-pay triggers; warns and requires a second confirm before a payment that fully settles/overpays the debt; editing propagates to the linked transaction, direction locked], delete-debt-button [manual soft delete — forgiven/given-up-on debt], delete-debt-transaction-button [deletes the linked transaction too], debt-side-filter.tsx ["Todas/A pagar/A receber", 2026-08-23], debts-charts ["Dívidas a pagar"/"Dívidas a receber" pies, each rendered only when that side has data])
 │  ├ budgets/components (budget-form-dialog [create+edit, month-scoped], fixed-expense-form-dialog [create+edit], budget-tree-editor ["Planejar orçamentos" — whole category+subcategory tree in one screen for one month, reuses onboarding's tree pattern; clearing an existing field deletes that row, same guards as the single-row delete], budget-tree-fields [the reusable amount-input tree, shared with the onboarding budget step], budget-tree [the ONLY list on /budgets now — no separate fixed-expense tab; renders category/subcategory boxes plus a `renderFixedExpenseActions` slot per nested fixed-expense row for pay/edit/delete, shared read-only (no action slots passed) by the dashboard panel], progress-row [shared planned-vs-actual bar], clone-budget-button, deactivate-budget-button [hidden by the caller when fixed expenses are attached; deactivateBudget itself also blocks it server-side], deactivate-fixed-expense-button, pay-fixed-expense-dialog)
 │  └ categories/components (category-form-dialog, subcategory-form-dialog, category-tree-item [onboarding/Settings re-import — always renders the full is_default catalog, already-imported items checked+disabled], category-select [CategorySelect/SubcategorySelect — standard picker used everywhere a category/subcategory is assigned, with a "Nova categoria/subcategoria" item at the end of the same dropdown instead of a separate button; replaced the old inline-category-create.tsx, decided 2026-08-09], delete-category-dialog)
 ├ components
 │  ├ ui (button, card, input/field/label/textarea, dialog, select [incl. SelectGroup/SelectLabel for grouped options], tabs, checkbox, switch, dropdown-menu, popover, table, badge, icon-picker + icon-set, color-picker.tsx [CATEGORY_COLORS swatch picker, shared by category/subcategory creation], account-type-icon [CASH/BANK/CREDIT_CARD → Banknote/Wallet/CreditCard, shared by Accounts + transaction lists], account-select [standard account picker grouped by type in CASH→BANK→CREDIT_CARD order with the type icon per row, used wherever an account of any type — including CREDIT_CARD — can be picked, e.g. Fixed Expenses], month-picker [prev/next + click-anywhere-on-label native month picker, shared by Dashboard/Cards/Transactions month navigators], loading-overlay [full-screen "Carregando…" overlay, Industry corner-marks card — rendered by every route's loading.tsx AND by NavigationProgressProvider below], chart-tooltip [shared Recharts tooltip style with an explicit text color — every chart's Tooltip spreads `chartTooltipStyle`], category-checkbox-filter [generic additive multi-select category popover, shared by the dashboard's and Cards page's category filters], donut-with-total.tsx [shared Recharts donut with a centered total label, used by accounts-overview-charts.tsx and card-expense-donut.tsx], invoice-paid-badge.tsx [green "Paga"/yellow partial badge, shared by /cards and AccountCard], help-button.tsx [the "?" popover on every main page's header, static per-page content — see AI_CONTEXT.md "Ajuda por tela"], confirm-delete-dialog, corner-marks — the Industry blueprint frame)
 │  ├ layout (sidebar, header, bottom-navigation, nav-items)
 │  └ providers (navigation-progress.tsx — NavigationProgressProvider/useNavigationProgress, mounted once in (app)/layout.tsx; every filter/month-nav component calls navigate() from this instead of router.push directly, added 2026-08-10 — see "Known gaps" note below on why this exists alongside loading.tsx)
 ├ types (database.ts — raw row shapes; dto.ts — the DTOs below, source of truth)
 └ app
    ├ page.tsx (root route — redirects into (auth) or (app) depending on session state)
    ├ (auth)/login, (auth)/signup, (auth)/actions.ts
    ├ onboarding/ (outside the (app) group — no sidebar/nav chrome; reused for the Settings re-import flow too; first-time order is account → categories → budget, reordered 2026-08-24 — onboarding/account/ [incl. onboarding-account-form.tsx] is now the FIRST first-time-only step, "confirm your wallet's balance" — see AI_CONTEXT.md "Onboarding — conta padrão"; onboarding/page.tsx [categories] comes next, pre-checking only a 5-category quick-start whitelist instead of the full is_default catalog; onboarding/budget/ [incl. onboarding-budget-form.tsx] is the first-time-only "plan this month's budget" step reached right after that)
    └ (app)/dashboard, transactions, accounts, cards, reservoirs, debts, budgets, settings — layout.tsx here redirects to /onboarding whenever profiles.onboarding_completed is false; every route also has its own loading.tsx (see loading-overlay above)
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
  categories?: string[] // additive/multi-select in the UI — checking a second category adds it to the sum, doesn't replace the first
  subcategories?: string[]
  transactionType?: "INCOME" | "EXPENSE"
  uncategorizedOnly?: boolean // set when a chart's "no category" slice is clicked — never stuff a fake id into `categories`
  source?: "all" | "liquid" | "cards" // account-type segmentation for the expense donut+comparison pair only — "liquid" = transactions only, "cards" = card_installments only. Not part of the global filter bar.
}
```

Supported periods: single month, custom month range, last 3/6/12 months, full year.

Dashboard layout:

1. Financial Summary Cards (balance, income, expense, result)
2. Monthly Evolution (bar) — always 12 months back + 3 months forward from the viewed reference month, independent of the period preset above (2026-08-14 — previously inherited the page's period, so the default "Mês" preset rendered a single bar; the future months surface already-scheduled card installments)
3. Category Distribution + Comparison, EXPENSE (donut + horizontal bar, segmented by account type via `source` above) and INCOME (same pair, mirrored) — both pairs always render regardless of the "Tipo" filter
4. Budgets & Fixed Expenses panel (planned vs actual, alerts; fixed expenses nested under their parent category/subcategory budget — see AI_CONTEXT.md "Budget hierarchy")
5. Transaction Explorer (table, reacts to all filters and to chart clicks)

**Inline editing is a requirement, not a nice-to-have.** The Transaction Explorer (and any other dashboard table showing individual records) must allow editing category/subcategory/description directly on the row — never force a detour to a separate menu/form to fix something spotted while browsing the dashboard. The exact interaction (click-to-edit, inline dropdown, mobile pattern) is a visual design decision — resolve it in Design, not here; what's fixed at this layer is that `updateTransaction` must support partial, low-friction updates callable straight from dashboard components.

**`reassignCategory` (`categories.service.ts`) is exclusive to the category/subcategory deletion flow — fixed 2026-08-07.** The Transaction Explorer used to also expose a standalone "Reclassificar em lote" button (`batch-reassign-dialog.tsx`, now removed) letting a user bulk-move transactions between categories at any time, independent of deleting anything. That duplicated a capability that only makes sense as part of guided deletion (see "Deleting a category or subcategory" in `AI_CONTEXT.md`) and was removed at the user's request — bulk reassignment now only happens through `DeleteCategoryDialog`'s own reassignment step. Per-row inline edits (`EditableCategoryCell` → `inlineEditTransaction`) are unaffected and remain on every dashboard/Lançamentos row.

Charts must use **aggregated SQL data** from services. Never compute totals in the UI (`reduce()`/`map()` aggregation is forbidden in components).

---

# Service Layer & Contracts

## dashboard.service.ts
```
getFinancialSummary(filters) → FinancialSummaryDTO
getMonthlyEvolution(filters) → MonthlyEvolutionDTO[]
  -- dashboard/page.tsx passes a filters object with periodStart/periodEnd overridden to 11
  -- months before + the reference month + 3 months after (via startOfMonth/endOfMonth/
  -- addMonthsToIsoDate on filters.periodEnd) — MonthlyChart never reflects the page's own period
  -- preset, always this 15-month window (2026-08-14)
getCategoryDistribution(filters) → CategoryDistributionDTO[]
  -- filters.source ("liquid"/"cards") narrows fetchPeriodEntries to transactions-only or
  -- card_installments-only — used by the expense pair's account-type toggle only
getCategoryComparison(filters) → CategoryComparisonDTO[]
getTransactionsFiltered(filters) → TransactionViewDTO[]
```

## transactions.service.ts
```
createTransaction(data) / updateTransaction(id, data) / deleteTransaction(id) / getTransactions(filters)
refundTransaction(transactionId, refundDate)
  -- NOVO (0019) — estorno integral de uma despesa fora do cartão (AI_CONTEXT.md "Estorno").
  -- Reclassifica a despesa original pra categoria system "Estorno" (EXPENSE) e cria uma nova
  -- transaction INCOME (categoria "Estorno") no mesmo valor, creditada na MESMA conta de origem,
  -- na data em que o estorno de fato aconteceu (pode ser meses depois — nunca reescreve o
  -- lançamento original). refund_of_transaction_id só existe pra rastreabilidade. Bloqueia um
  -- segundo estorno checando se category_id já é a categoria "Estorno".
```

## accounts.service.ts
```
getAccounts() / getFinancialInstitutions() / createAccount(data) / updateAccount(id, data)
  -- updateAccount aceita Partial<AccountInput> — usado pelo "Ajustar Limite" pra editar só
  -- creditLimit ou overdraftLimit a qualquer momento, sem tela de edição geral de conta.
  -- CUIDADO (achado em auditoria 2026-08-23): updateAccountAction chama updateAccount
  -- diretamente sem rodar updateAccountSchema.parse antes — o zod que valida closing_day/
  -- due_day (1-28) e creditLimit (> 0) na EDIÇÃO existe (accounts.ts) mas é código morto,
  -- não é chamado. O único enforcement real nesse caminho hoje é o CHECK (credit_limit > 0)
  -- do banco (sem faixa nenhuma pra closing_day/due_day) e o min/max do HTML no client.
deactivateAccount(id) / deleteAccount(id)  -- deactivateAccount é o soft delete padrão (active=false);
  -- deleteAccount (hard) existe mas é último recurso, ver AI_GENERATION_RULES.md "active"
getAccountBalance(accountId) → number
  -- CASH/BANK: initial_balance + SUM de transactions que afetam a conta. CREDIT_CARD: usa outra
  -- fórmula (totalCommitted - totalPayments, floor em 0) — não é a mesma conta de saldo líquido
registerYield(accountId, realBalance)
  -- "Informar Rendimento": só oferecido na UI para contas BANK (CASH não rende sozinho) —
  -- compara realBalance ao calculado; cria transaction INCOME/"Rendimentos" pra diferença
reconcileAccountBalance(accountId, realBalance)
  -- "Ajustar Saldo": mesmo cálculo de diferença, mas categoria system "Ajuste"
  -- (INCOME ou EXPENSE conforme o sinal) — disponível pra CASH e BANK
```

## categories.service.ts
```
getCategories(type?) / getSubcategories(categoryId)
  -- type opcional filtra direto por CategoryType — usado por qualquer picker que só quer um lado
  -- (ex: CategorySelect de um formulário de EXPENSE não precisa buscar categorias INCOME também)
createCategory(data) / createSubcategory(data)
updateCategory(id, data) / updateSubcategory(id, data)
getDefaultCategoryOptions()  -- catálogo is_default cru, reusado internamente por
  -- getDefaultCategoryImportOptions abaixo
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
reassignCategory(input: ReassignCategoryInput)
  -- assinatura real é um objeto único (src/lib/validations/categories.ts#reassignCategorySchema):
  -- { fromCategoryId?, fromSubcategoryId?, fromUncategorized?, toCategoryId, toSubcategoryId? } —
  -- fromUncategorized:true mira rows com category_id IS NULL em vez de uma categoria específica.
  -- UPDATE em lote de category_id/subcategory_id em transactions + card_purchases (e nos configs
  -- que ainda apontam pra ela); toCategoryId: null = deixa sem categoria. Uso é exclusivo do fluxo
  -- guiado de deleção (DeleteCategoryDialog) — não existe mais um botão avulso de reclassificação
deleteCategory(id) / deleteSubcategory(id)
  -- só sucede depois que reassignCategory zerou as referências — a FK é
  -- RESTRICT por padrão, então a ordem é garantida pelo banco
```

## profile.service.ts
```
getProfile() → ProfileDTO
  -- self-healing: a row de profiles normalmente vem do trigger on_auth_user_created
  -- (migration 0003), mas uma conta criada antes do trigger existir não tem row — em vez de
  -- quebrar no .single(), cria a row sob demanda no primeiro getProfile()
updateProfile({ name?, phone? })
markOnboardingCompleted()  -- seta profiles.onboarding_completed = true, chamado ao fim do
  -- onboarding (categorias + budget opcional)
```

## cards.service.ts
```
createCardPurchase(data)   -- calcula installments a partir de closing_day/due_day do cartão
  -- data.paidThroughCompetence (NOVO 0014, "YYYY-MM") marca a compra como retroativa/backfill —
  -- toda installment gerada com competence <= isso nasce com paid_before_system = true (prefixo
  -- contíguo, nunca parcelas alternadas). Ver AI_CONTEXT.md "Compras retroativas"
getCardPurchases(cardId)
updateCardPurchase(id, input) / deleteCardPurchase(id)
  -- updateCardPurchase é o "rollback e re-registro" (ver AI_CONTEXT.md "Credit Card Purchases") —
  -- apaga e regenera todas as installments a partir dos novos valores. deleteCardPurchase cascateia
  -- as installments (ON DELETE CASCADE). CUIDADO (achado em auditoria 2026-08-23):
  -- updateCardPurchaseAction chama updateCardPurchase direto, sem rodar updateCardPurchaseSchema.parse
  -- antes — esse zod (amount > 0, installments 1-48) existe mas é código morto nesse caminho; a
  -- única checagem que de fato roda na edição é a de "paidThroughCompetence não pode ser mês futuro",
  -- que está hardcoded dentro do próprio service, não vem do zod
getCardInstallments(cardId, filters?: { periodStart?, periodEnd? })
getCardBalanceThroughMonth(creditCardId, throughMonth) → number
  -- installments com competence <= throughMonth E paid_before_system = false, menos pagamentos
  -- já feitos, floor em 0 — parcelas de compra retroativa já contam como quitadas. NOVO (0019):
  -- também subtrai card_refunds até throughMonth — um estorno reduz o devido igual um pagamento
getCardTotalCommitted(creditCardId) → number
  -- TODAS as installments já geradas pro cartão (passadas, do mês atual e futuras ainda não
  -- vencidas) COM paid_before_system = false, menos TODOS os pagamentos já feitos, floor em 0 —
  -- a figura correta de "usado contra o limite" (fixed 2026-08-07). Deliberadamente diferente de
  -- getCardBalanceThroughMonth, que exclui parcelas futuras ainda não vencidas de propósito (ver
  -- AI_CONTEXT.md "CREDIT_CARD_PAYMENT" — essa outra alimenta a sugestão do "Pagar fatura", não o
  -- card "usado/total"). NOVO (0019): também subtrai TODOS os card_refunds já feitos — um
  -- estorno integral libera o limite de volta
refundCardPurchase(purchaseId, refundDate)
  -- NOVO (0019), revisado 2026-08-23 mesmo dia — estorno integral de uma compra no cartão
  -- (AI_CONTEXT.md "Estorno"). Reclassifica a compra pra categoria system "Estorno" (EXPENSE),
  -- ADIANTA toda parcela ainda não faturada (competence > fatura aberta no momento de
  -- refundDate) pra essa mesma competência — replica o emissor real: parcelas futuras de uma
  -- compra estornada não continuam pingando pelos meses originais, o restante é jogado de uma
  -- vez na fatura aberta na hora do estorno — e insere um card_refunds no valor total da compra
  -- (nunca aceito do client). Parcela já faturada (competence <= a fatura aberta na hora do
  -- estorno) nunca é tocada. A constraint UNIQUE em card_refunds.card_purchase_id impede estornar
  -- a mesma compra duas vezes.
getCardSummary(creditCardId, viewedMonth, creditLimit) → CardSummaryDTO
  -- dois conceitos de mês independentes, de propósito não são o mesmo parâmetro:
  -- usedThroughCurrentMonth/overdueAmount ficam SEMPRE ancorados no mês real de hoje (o quanto
  -- devo agora — alimenta a sugestão do "Pagar fatura"), mesmo que a página esteja navegando
  -- por outro mês via o filtro; currentMonthInvoice reflete `viewedMonth` (o mês filtrado na
  -- página); totalCommitted (= getCardTotalCommitted) não depende de mês nenhum — é o "usado/total"
  -- correto contra o limite. Ver AI_CONTEXT.md "Credit Card Purchases" pro raciocínio completo.
  -- currentMonthInvoice NÃO exclui parcelas paid_before_system — representa o fato histórico "o
  -- que foi faturado naquele mês", que não muda por causa de um lançamento retroativo posterior.
  -- currentMonthPaidAmount (NOVO 2026-08-12) — quanto de currentMonthInvoice já foi pago; derivado
  -- (card_payments não referencia mês/competência nenhum), alocação mais-antigo-primeiro sobre as
  -- installments não-paid_before_system, ver AI_CONTEXT.md "Fatura: indicador de pago/parcial"
  -- openInvoiceMonth/openInvoiceAmount (NOVO 2026-08-23) — qual fatura está aberta (ainda
  -- acumulando lançamentos) agora, calculado com calculateInstallmentCompetences a partir de
  -- HOJE + closing_day/due_day do cartão — sempre ancorado em hoje, nunca em viewedMonth, mesma
  -- convenção de usedThroughCurrentMonth. Ver AI_CONTEXT.md "Credit Card Purchases" → "Fatura
  -- aberta vs. fatura do mês visualizado"
registerCardPayment(data)
getPurchaseFutureInstallments(purchaseId) → { id, competence, amount }[]
  -- parcelas de UMA compra ainda não faturadas (competence > fatura aberta agora), ordenadas por
  -- competence, excluindo paid_before_system — a lista sobre a qual advancePurchaseInstallments opera
advancePurchaseInstallments(purchaseId, count)
  -- NOVO (2026-08-23, sem migration), CORRIGIDO no mesmo dia — "Antecipar parcelas": das parcelas
  -- ainda não faturadas de uma compra, o usuário escolhe QUANTAS (count, não precisa ser todas).
  -- As `count` mais próximas viram todas a mesma competence da fatura aberta agora; as demais são
  -- renumeradas em sequência logo em seguida, sem pular mês — encurtando o parcelamento em
  -- `count` meses. NUNCA cria pagamento/transaction/card_payments — é só remanejo de
  -- card_installments.competence, igual refundCardPurchase faz, só que parcial e escolhido pelo
  -- usuário. Pra de fato pagar as parcelas antecipadas, o fluxo continua sendo "Pagar fatura"
  -- normal depois. Ver AI_CONTEXT.md "Antecipar parcelas".
getCardMonthlyEvolution(cardIds, referenceMonth, categoryIds?) → CardMonthlyEvolutionDTO[]
  -- NOVO (2026-08-14), revisado no mesmo dia — 6 meses antes + 6 meses depois de referenceMonth
  -- (13 meses) de card_installments.amount por competence (nunca purchase_date), somado por mês.
  -- cardIds escopa quais cartões entram (a página passa todo cartão, ou só o filtrado via
  -- "Cartão"); categoryIds, se informado, filtra via join com card_purchases (categoria vive lá,
  -- não na installment) E também direciona o breakdown byCategory de cada mês. total é o valor
  -- faturado histórico do mês, mesma convenção de CardSummaryDTO.currentMonthInvoice — NÃO
  -- exclui parcelas paid_before_system. byCategory[] traz o mesmo total quebrado por categoria
  -- (só as categorias presentes nas purchases já filtradas) — usado pro gráfico empilhar uma
  -- barra por categoria selecionada em vez de só somar tudo numa barra só
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
createDebt(data)   -- data.defaultCategoryId (NOVO 0015) opcional, tipo EXPENSE (PAYABLE) ou
  -- INCOME (RECEIVABLE) — mesmo tipo que um pagamento contra a dívida sempre produz.
  -- data.kind (NOVO 0021) — PERSONAL | OVERDUE_BILL | INSTALLMENT_PLAN, ver AI_CONTEXT.md
  -- "Dívidas — subtipos". monthlyAmount/dueDay obrigatórios (validados em zod) só quando
  -- kind === INSTALLMENT_PLAN
updateDebt(id, data)  -- NOVO (0016), estendido 2026-08-23: partial update de agent/side/kind/
  -- initialBalance/defaultCategoryId/monthlyAmount/dueDay — todos livremente editáveis depois de
  -- criada a dívida; só a fórmula do remainingBalance (initial_balance +
  -- SUM(debt_transactions.amount)) é fixa
addDebtTransaction(data) → { settled: boolean }
  -- amount positivo=aumento, negativo=pagamento; linked_transaction_id opcional. Se
  -- `description` vier vazio, usa "Movimentação da dívida {agent}" como default — tanto na
  -- linked transaction quanto na própria linha do ledger (fixed 2026-08-07). Depois de
  -- inserir, recalcula o saldo restante real do banco; se <= 0 (quitou ou pagou a mais —
  -- ex.: juros que o pagador/credor decidiu acertar), chama deactivateDebt automaticamente —
  -- soft delete, a dívida some de getDebts(). A UI avisa ANTES de enviar quando o pagamento
  -- vai fazer isso (DebtTransactionDialog), mas a decisão de fato é sempre pelo saldo real
  -- pós-insert, não pela previsão do client.
  -- data.categoryId (NOVO 0015) opcional — grava category_id na linked transaction quando
  -- createLinkedTransaction=true; se omitido E for um pagamento (amount negativo), cai pro
  -- debts.default_category_id da dívida; um "aumento" (tipo oposto ao default) nunca herda o
  -- default, só fica sem categoria se o client não mandar uma
updateDebtTransaction(data) → { settled: boolean }  -- NOVO (0016): edita um lançamento do
  -- ledger (date/amount/description/categoryId), propagando pra transaction vinculada quando
  -- existir (linked_transaction_id) — amount/date/description/category_id são atualizados lá
  -- também. Nunca deixa o sinal de amount inverter (aumento virar pagamento ou vice-versa) —
  -- valida Math.sign(novo) === Math.sign(antigo) e lança erro caso contrário. Recalcula o
  -- saldo real depois e reaplica a mesma auto-desativação de addDebtTransaction se zerar
deleteDebtTransaction(id)  -- NOVO (0016): espelha reservoirs.service.ts#deleteReservoirTransaction
  -- — apaga a linha do ledger e, se linked_transaction_id existir, a transaction vinculada junto
getDebts() → DebtDTO[]   -- filtra active = true, então uma dívida quitada já não aparece.
  -- paidThisMonth (NOVO 0021) calculado aqui pra INSTALLMENT_PLAN: existe debt_transactions com
  -- amount < 0 datado no mês corrente? Ver AI_CONTEXT.md "Dívidas — subtipos"
getDebtTransactions(debtId) → DebtTransactionDTO[]
deactivateDebt(id)  -- soft delete; chamado automaticamente por addDebtTransaction/
  -- updateDebtTransaction/deleteDebtTransaction ao zerar o saldo, e manualmente pelo botão
  -- "Excluir dívida" (NOVO 0016) pra dívida perdoada/desistida — sem lançamento nenhum
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
  -- NOVO (0023): também insere a 1ª linha de fixed_expense_amount_history
  -- (effective_from = '1970-01-01', "vale desde sempre")
updateFixedExpense(id, data) → { notices[] }
  -- uma despesa fixa é um piso comprometido do orçamento da sua categoria/subcategoria —
  -- nunca bloqueia; ambas chamam reconcileFixedExpenseFloors (_shared.ts) depois de salvar,
  -- pro mês corrente sempre + o próximo mês também se já existir orçamento NAQUELE MESMO
  -- NÍVEL (categoria OU subcategoria, o que a despesa fixa realmente usa) — devolve
  -- `notices[]` com o texto pronto. Despesa fixa direto na CATEGORIA (sem subcategoria)
  -- ainda cria/aumenta o orçamento da categoria normalmente; despesa fixa numa
  -- SUBCATEGORIA (revisado 2026-08-10) só cria/aumenta o orçamento da subcategoria — nunca
  -- o da categoria, que só pode ser desativado (nunca criado/aumentado) por reflexo, ver
  -- reconcileBudgetFloors abaixo.
  -- CORRIGIDO (0023, 2026-08-23): mudar `amount` NUNCA mais reescreve meses passados — grava
  -- (upsert) uma linha nova em fixed_expense_amount_history com effective_from = mês real
  -- corrente. `fixed_expenses.amount` continua atualizada como cache do valor mais recente
  -- (usada pelo piso de orçamento acima, que só olha mês atual/próximo, e pra pré-preencher
  -- o form). Ver AI_CONTEXT.md "Despesas fixas — histórico de valor".
deactivateFixedExpense(id)  -- soft delete
getFixedExpenses(month) → FixedExpenseDTO[]
  -- actualAmount soma transactions.fixed_expense_id (por date) + card_installments das
  -- card_purchases.fixed_expense_id (por competence, NUNCA purchase_date — atualizado 2026-08-10
  -- junto com o suporte a pagar despesa fixa no cartão, ver payFixedExpense abaixo).
  -- plannedAmount (CORRIGIDO 0023) resolve de fixed_expense_amount_history pro MÊS PEDIDO,
  -- nunca de fixed_expenses.amount direto — só assim um mês passado mantém o valor que valia
  -- naquela época mesmo depois de uma edição posterior
getUnlinkedExpenseCandidates(categoryId) → { id, date, description, amount }[]
  -- NOVO (2026-08-23) — despesas (EXPENSE) do usuário sem fixed_expense_id nenhum, filtradas pela
  -- categoria da despesa fixa quando ela tem uma; alimenta "Vincular lançamento existente"
linkExistingTransaction(fixedExpenseId, transactionId)
  -- NOVO (2026-08-23) — só reatribui transactions.fixed_expense_id; pro caso de recriar uma
  -- despesa fixa apagada por engano sem perder o rastro de um pagamento manual já lançado antes.
  -- Ver AI_CONTEXT.md "Despesas fixas — vincular pagamento já lançado"
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
  refundShare: number // % of period total (either direction) sitting under "Estorno" — distinct signal, see AI_CONTEXT.md "Estorno"
}

type MonthlyEvolutionDTO = { month: string; income: number; expense: number }

type CategoryDistributionDTO = { categoryId: string; categoryName: string; total: number; color: string; icon: string | null }

type CategoryComparisonDTO = { categoryId: string; categoryName: string; total: number; color: string } // categoryId/color adicionados 2026-08-14 junto com CategoryBars ficar clicável

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
  originAccountId?: string | null // set only when source === "transaction" — accountId/account above already merge origin+destination for display; the full-edit dialog (TransactionFormDialog transaction= prop, 2026-08-23) needs both sides distinguished, e.g. to edit a TRANSFER
  destinationAccountId?: string | null // set only when source === "transaction"
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
  kind: "PERSONAL" | "OVERDUE_BILL" | "INSTALLMENT_PLAN" // NOVO (0021) — PERSONAL nunca afeta o dashboard; OVERDUE_BILL/INSTALLMENT_PLAN sempre contam em "Dívidas em aberto", ver AI_CONTEXT.md "Dívidas — subtipos"
  originalAmount: number
  remainingBalance: number // NUNCA é coluna — sempre initial_balance + SUM(debt_transactions.amount), calculado no service
  active: boolean
  defaultCategoryId?: string // NOVO (0015) — pré-preenche (sobrescrevível) a categoria de um pagamento contra a dívida
  monthlyAmount?: number // NOVO (0021) — só INSTALLMENT_PLAN, valor combinado a pagar por mês
  dueDay?: number // NOVO (0021) — só INSTALLMENT_PLAN, dia de vencimento mensal (1-28)
  paidThisMonth?: boolean // NOVO (0021) — só INSTALLMENT_PLAN, se já existe um debt_transactions.amount < 0 datado no mês corrente
}

type DebtTransactionDTO = {
  id: string; debtId: string; date: string; description: string | null
  amount: number  // positivo = aumento; negativo = pagamento
  linkedTransactionId?: string // opcional nos dois sentidos — só existe quando dinheiro passou por conta rastreada
  categoryId?: string // NOVO (0016) — só setado quando linkedTransactionId também está; categoria real da transaction vinculada, usada pra pré-preencher a edição
}

type CardPurchaseDTO = {
  id: string; creditCardId: string; description: string; totalAmount: number
  installmentsCount: number; purchaseDate: string
  firstCompetenceMonth: string // "YYYY-MM" — competência real da 1ª parcela, pra pré-preencher edição
  categoryId: string | null; categoryName: string | null
  subcategoryId: string | null; subcategoryName: string | null
  paidThroughCompetence?: string // "YYYY-MM" — compra retroativa ("já paguei até este mês"); toda parcela gerada com competence <= isso nasce com paid_before_system = true, ver AI_CONTEXT.md "Compras retroativas"
  refundedAt?: string // setado quando existe um card_refunds pra essa compra — só estorno integral, ver AI_CONTEXT.md "Estorno"
  remainingUnbilledAmount: number // soma das parcelas ainda não faturadas dessa compra, 0 quando não sobra nada
  remainingInstallmentsCount: number // quantas parcelas ainda não faturadas restam — o máximo pro campo "quantas antecipar"
}

// getCardMonthlyEvolution — 6 meses antes + 6 meses depois do mês visualizado (13 meses) de
// card_installments.amount por competence, opcionalmente filtrado por categoria. total é o valor
// faturado histórico do mês (não exclui paid_before_system), mesma convenção de
// CardSummaryDTO.currentMonthInvoice. byCategory quebra o mesmo total por categoria presente nas
// purchases (já filtradas, se houver filtro) — o gráfico empilha por categoria quando há filtro
// ativo, mostra só `total` quando não há nenhuma categoria selecionada.
type CardMonthlyEvolutionDTO = {
  month: string
  total: number
  byCategory: { categoryId: string; categoryName: string; color: string; amount: number }[]
}

type CardInstallmentDTO = {
  id: string; purchaseId: string
  installmentNumber: number    // derivado — ordenado por competence entre TODAS as parcelas da purchase (não só as do período filtrado), nunca uma coluna
  totalInstallments: number    // = card_purchases.installments
  amount: number; competenceMonth: string; description: string
  purchaseDate: string         // data real da compra (não a competência) — ordena a exibição e monta a linha "dd/mm/yyyy - descrição"
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
  currentMonthPaidAmount: number  // NOVO (2026-08-12) — quanto de currentMonthInvoice já foi coberto; derivado (card_payments não tem mês próprio), alocado por competência mais antiga primeiro, ver AI_CONTEXT.md "Fatura: indicador de pago/parcial". Sempre 0 <= isso <= currentMonthInvoice
  overdueAmount: number           // = usedThroughCurrentMonth - (fatura do mês de hoje), floor em 0 — sempre ancorado em hoje
  totalCommitted: number          // = getCardTotalCommitted — TODAS as installments (incl. futuras) menos pagamentos, floor em 0 — a figura correta de "usado/total" contra o limite
  openInvoiceMonth: string        // NOVO (2026-08-23) — "YYYY-MM", a competência que uma compra feita HOJE cairia (via calculateInstallmentCompetences + closing_day/due_day do cartão) — sempre ancorado em hoje, nunca no filtro de mês da página, mesma convenção de usedThroughCurrentMonth/overdueAmount
  openInvoiceAmount: number       // soma de card_installments.amount pra openInvoiceMonth — NÃO exclui paid_before_system, mesma convenção histórica de currentMonthInvoice
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
