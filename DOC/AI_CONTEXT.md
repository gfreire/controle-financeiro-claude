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
- `CREDIT_CARD` → `credit_cards.closing_day`, `credit_cards.due_day`, `credit_cards.credit_limit` (required, must be > 0 — see below)

`bank_accounts.initial_balance` was added after the fact (migration `0005`) — the original design only gave `CASH` an initial balance, which meant every new `BANK` account started at zero and needed an immediate `Ajustar Saldo` just to reflect reality. Both `CASH` and `BANK` now work the same way: `balance = initial_balance + SUM(transactions affecting the account)`.

`closing_day`/`due_day` are what allow the system to compute which invoice month (competence) a given purchase's installments fall into. Both are constrained to **1-28** (not 1-31, decided 2026-08-09) — the same simplification real card issuers already make, so a card set to close on the 30th never has to special-case February. Enforced in `src/lib/validations/accounts.ts` (`accountBaseSchema`) and mirrored as HTML `min`/`max` on every input that edits these fields (account creation, "Ajustar Cartão").

`credit_limit` (migration `0007`) is **required and must be > 0 for every `CREDIT_CARD` account** (migration `0008`, decided 2026-08-08 — reverses the original "optional" design). What stays **soft-enforced only** is what happens once the limit exists: a purchase that would push the card's outstanding balance past it doesn't get blocked; the UI shows a warning ("you may have forgotten to log the invoice payment, or made a mistake in this entry") and requires an explicit "insert anyway" acknowledgment before it proceeds. This is deliberate: a real payment not yet logged, or a genuine data-entry mistake, are both things the user needs to see and decide about, not be locked out of correcting. The account creation form and the "Ajustar Cartão" quick action both require a positive `creditLimit` before saving (`src/lib/validations/accounts.ts`); a card simply can't exist without one anymore.

**`credit_limit` and `bank_accounts.overdraft_limit` are both user-editable at any time**, via a dedicated quick action ("Ajustar Limite") mirroring the existing "Ajustar Saldo" pattern (a small dialog off the account, not a full account-edit form) — decided and implemented 2026-08-07 (`src/features/accounts/components/limit-adjust-dialog.tsx`). Banks routinely raise or cut these limits outside the user's control (temporary increase, revolving-credit renegotiation, etc.), so locking either value to account-creation time drifts from reality almost immediately. Same soft-enforce philosophy carries over for *purchases against the limit*: changing the limit never rewrites past purchases or warnings already shown, it only changes the threshold used for *future* soft-limit checks. The limit value itself, though, can never be cleared or zeroed for a `CREDIT_CARD` account — see above.

**Contas shows a credit card's usage exactly like the Cards tab does — decided and implemented 2026-08-08.** `AccountCard` used to just show `account.balance` for every account type, which for a `CREDIT_CARD` is a meaningless figure (a card's balance isn't "how much is committed against the limit" the way `CardSummaryDTO.totalCommitted` is — see "Credit Card Purchases" above). The Accounts page now calls the same `getCardSummary(cardId, currentMonth, creditLimit)` the Cards page uses and renders the identical `totalCommitted / creditLimit` block (progress bar, danger color past 90%, current month's invoice, overdue badge) — the two pages must never show conflicting numbers for the same card.

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

## Compras retroativas (backfill de parcelas já pagas antes do sistema)

**Decidido e implementado 2026-08-10, a pedido do usuário.** Facilita o cadastro pra um usuário leigo que começa a usar o sistema já com compras parceladas em andamento: em vez de calcular manualmente "quanto falta pagar" e cadastrar só o resto, ele cadastra a compra **inteira** (valor total real, data real, nº de parcelas real) e marca até que mês ela já foi paga fora do sistema — dinheiro que "apareceu" de algum jeito pra cobrir aquilo, sem um pagamento rastreado aqui. Cobre os dois casos que o usuário descreveu: uma compra inteiramente já paga (marcar "pago até" no mês da última parcela) ou só parte das parcelas.

- `card_purchases.paid_through_competence` é a entrada do usuário ("já paguei até este mês", um mês, não uma parcela específica). `card_installments.paid_before_system` é a flag derivada por parcela, calculada em `cards.service.ts#createCardPurchase`/`updateCardPurchase`: toda parcela cuja competência seja `<= paid_through_competence` nasce com a flag `true` — sempre um **prefixo contíguo** a partir da 1ª parcela (não dá pra marcar a 1ª e a 3ª pulando a 2ª), porque isso já cobre o caso real (fatura paga em sequência) sem precisar de um toggle por parcela na UI.
- A flag **exclui** a parcela do saldo/fatura em aberto do cartão — `getCardBalanceThroughMonth`/`getCardTotalCommitted` (e por consequência `CardSummaryDTO.usedThroughCurrentMonth`/`totalCommitted`) passam a ignorá-la, como se já tivesse sido paga (porque foi, só que fora do sistema). `CardSummaryDTO.currentMonthInvoice` **não** exclui — continua representando o fato histórico "o que foi faturado naquele mês", que não muda só porque o usuário logou esse pagamento depois.
- A flag **não muda nada** nos dashboards de despesa por categoria — `card_installments` já alimenta `getCategoryDistribution`/`getCategoryComparison`/`getMonthlyEvolution` (lado despesa) independente de qualquer flag, então uma parcela retroativa conta normalmente como despesa da categoria/mês da sua competência, sem código novo.
- A flag **soma em RECEITA** no resumo (`FinancialSummaryDTO.income`) e na evolução mensal (`MonthlyEvolutionDTO.income`) do mês de competência de cada parcela — já que, na prática, dinheiro real pagou aquilo, mesmo sem uma origem rastreada. Isso é **calculado na consulta** (`dashboard.service.ts#fetchRetroactiveIncomeEntries`), nunca uma `transactions` real criada — não polui a tabela `transactions` nem o Explorador de Lançamentos com uma linha falsa. `FinancialSummaryDTO.retroactiveIncomeShare` expõe o mesmo tipo de sinal que `adjustmentShare` já expõe pra "Ajuste" (% do total do período), mas com rótulo e ícone distintos na UI ("X% de compras retroativas") — deliberadamente **não** é o mesmo conceito de Ajuste: Ajuste é sobre desleixo de registro (o usuário devia ter lançado e não lançou), enquanto isto é sobre uma compra genuinamente anterior ao uso do sistema.
- Essa receita retroativa **não** entra em `getCategoryDistribution`/`getCategoryComparison` (donut/barras de categoria) nem como linha sintética no Explorador de Lançamentos — essas duas visões agrupam por `categoryId`, e a parcela retroativa não tem uma categoria de RECEITA real; inventar um `categoryId` sentinela arriscaria vazar pra um filtro `category_id.in(...)` que espera uuid (mesma classe de bug que a flag `uncategorizedOnly` já existe pra evitar). Fica escopado só a `getFinancialSummary`/`getMonthlyEvolution`, que só precisam de uma soma, não de agrupamento por categoria.
- Rastreabilidade fica só visual: as parcelas flagged mostram uma badge "paga antes do sistema" tanto em Cartões (`src/app/(app)/cards/page.tsx`) quanto no Explorador de Lançamentos (`TransactionViewDTO.paidBeforeSystem`), sem criar nenhuma linha de receita extra em nenhum dos dois.
- `paid_through_competence` não pode ser um mês futuro — validado no client (`purchase-form-dialog.tsx`) e repetido no service (`createCardPurchase`/`updateCardPurchase`), já que não faz sentido marcar uma parcela ainda não vencida como "paga antes do sistema".
- Editar uma compra com parcelas retroativas segue a mesma regra de "rollback e re-registro" já existente — mudar valor/data/parcelas/cartão/`paid_through_competence` recalcula a flag do zero pra todas as parcelas geradas, nunca é um patch parcela-por-parcela.

## Fatura: indicador de pago/parcial

**Decidido e implementado 2026-08-12, a pedido do usuário** ("gostaria de colocar um simbolo de pago ou se pago pela metade"). `card_payments` nunca teve (e continua sem ter) uma coluna de mês/competência — é só `{ credit_card_id, account_id, transaction_id, amount, payment_date }`, um valor solto contra o cartão como um todo. Então "quanto da fatura DESTE mês já foi pago" não é um fato guardado, é derivado: `cards.service.ts#getCardSummary` ganhou `currentMonthPaidAmount`, calculado assumindo que um pagamento sempre quita a competência mais antiga em aberto primeiro — a mesma suposição que `getCardBalanceThroughMonth`/`overdueAmount` já faziam implicitamente (nenhuma delas jamais tentou saber PARA QUAL mês um pagamento era). Concretamente: uma parcela `paid_before_system` do mês visualizado conta como paga direto (já quitada fora do sistema, ver "Compras retroativas" acima); o resto do mês visualizado é coberto pelo que sobrar dos pagamentos (`card_payments`, soma de todos os tempos) depois de quitar toda parcela não-`paid_before_system` com competência estritamente anterior ao mês visualizado.

Isso é uma heurística, não uma alocação real — se o usuário pagar hoje adiantando uma fatura futura, o sistema ainda mostra esse valor quitando o mês mais antigo em aberto primeiro, não o mês que o usuário tinha em mente. Aceito como trade-off deliberado: implementar uma alocação explícita exigiria uma coluna nova ligando pagamento a mês (ou a parcelas específicas), e o caso de uso descrito pelo usuário — "fatura de 650, paguei 600, faltam 50" — é exatamente o caso comum (pagamento parcial da fatura mais recente em aberto) que a heurística já cobre certo.

`src/components/ui/invoice-paid-badge.tsx` (novo, compartilhado entre `/cards` e `AccountCard`, mesma convenção do bloco `totalCommitted/creditLimit` que as duas telas já compartilhavam) renderiza: nada quando `currentMonthPaidAmount === 0` (comportamento anterior, sem poluir a tela pra fatura totalmente em aberto); badge verde "Paga" quando `currentMonthPaidAmount >= currentMonthInvoice`; badge amarelo "`{pago}` pago · faltam `{resto}`" no caso parcial.

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

**Onboarding is implemented and reusable, not one-shot.** `/onboarding` shows a tree picker (category checkbox + nested subcategory checkboxes — uncheck one subcategory while keeping the rest of the category, e.g. keep "Moradia" but only "Aluguel", skip "IPTU"); a new signup lands there once a session exists, and `profiles.onboarding_completed` (migration `0004`) gates every other page via the `(app)` layout so it's reachable regardless of which path established the session (immediate signup vs. confirming email then logging in later). The same page reopens from Settings ("Importar categorias padrão") to re-visit the `is_default` catalog later — e.g. importing "Transporte" only once the user actually buys a car.

**The re-import picker always shows the FULL `is_default` catalog, not just what's missing — decided and implemented 2026-08-08, at the user's explicit request.** Previously `getAvailableDefaultCategories` diffed the starter pack against the user's own categories (by `(type, name)`, since there's no FK back to the source) and only returned genuinely new ones — an already-imported category disappeared from the list entirely, so there was no way to see the whole picture or add a subcategory you'd skipped under a category you already had. `getDefaultCategoryImportOptions` (`categories.service.ts`) now returns every `is_default` category and subcategory, each annotated `alreadyImported: boolean` (still matched by `(type, name)` — no FK exists to check instead). `CategoryTreeItem` renders an already-imported item **checked and disabled** — visible, not removable, with a "Já importada" badge — while anything still missing (a whole new category, or just a subcategory under a category the user already has) stays a normal selectable checkbox. Disabled checkboxes never submit via the browser's own `FormData`, so the server action only ever receives genuinely new selections without any extra client-side filtering.

`copyDefaultCategories` was extended to match: a selected subcategory whose parent category ISN'T among the selected category ids means that category is already imported (its checkbox was disabled) and the subcategory must attach to the user's **existing** category copy — resolved by the same `(type, name)` match — rather than creating a duplicate category. Selecting a whole new category still works exactly as before.

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

**Reservoir-level defaults (decided and implemented 2026-08-09).** `reservoirs.default_percentage` and `reservoirs.default_destination_account_id` (migration `0010`) let a reservoir remember its usual gross→net cut and its usual withdrawal account, since most recurring income sources always use the same split and land in the same account. `ReservoirFormDialog` sets both at creation time and, in its edit mode (`reservoir` prop present, saves via `updateReservoirAction`), lets them be changed later too. `AccrualDialog` pre-fills its `percentage` field from `defaultPercentage`; `WithdrawalDialog` pre-fills `destinationAccountId` from `defaultDestinationAccountId`, falling back to the first account only when no default is set. Both remain fully editable per entry — these are starting values, not constraints.

Reservoir must **never** affect account balances, income/expense totals, or dashboard analytics — only a withdrawal (which creates a real transaction) does.

## Reservoir deletion — hard delete, not the `active` soft-delete convention

**Decided and implemented 2026-08-10, at the user's explicit request** ("esta poderá ser excluída direto"). Both a single ledger entry and the whole reservoir can be deleted, and both are a real `DELETE`, not the `active = false` soft-delete convention most of the schema uses (see "Money Precision" → general rule at the top of `ARCHITECTURE.md`'s Implementation Status). The user was explicit that a reservoir needs no guided-reassignment flow the way a category does — there's nothing to reassign — but was equally explicit about one constraint: **a withdrawal's real linked `transactions`/`card_purchases` row must keep existing as an ordinary transaction even after the reservoir (or the ledger entry that caused it) is deleted**, since that money genuinely moved and the rest of the app's history shouldn't lose it.

- `deleteReservoirTransaction(id)`: deletes one `reservoir_transactions` row. If it's a withdrawal (has a `linked_transaction_id` or `linked_card_purchase_id`), the linked row is deleted too — deliberately different from the whole-reservoir case below, because a ledger entry's only reason to exist *is* to represent that specific withdrawal; deleting the entry without its linked record would leave a dangling, purposeless transaction with no ledger trace of why it happened.
- `deleteReservoir(id)`: deletes the reservoir header. `reservoir_transactions` cascades away with it (`ON DELETE CASCADE`, already the schema's design, unchanged) — but this does **not** cascade further into `transactions`/`card_purchases`, because the foreign key runs the other direction (`reservoir_transactions.linked_transaction_id → transactions`, `ON DELETE SET NULL` — that clause only matters if a `transactions` row is deleted first, never the reverse). So deleting a reservoir always leaves every withdrawal it ever generated intact in Lançamentos/Cartões, just no longer traceable back to a reservoir that no longer exists. This is the intended behavior, not an oversight: once the reservoir itself is gone, "which reservoir did this withdrawal come from" is no longer a question the app needs to answer.
- `deactivateReservoir` (the original soft-delete function) was removed — it was never wired to any UI action, and keeping two competing deletion mechanisms (one soft, one hard) for the same entity would have been confusing once the hard delete above became the actual, user-facing behavior.

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

**Debts carry a default category, applied at payment time — decided and implemented 2026-08-11, at the user's request.** `debts.default_category_id` (migration `0015`) is set once, when the debt is registered (`DebtFormDialog`'s "Categoria padrão (ao pagar)"), typed to whichever direction a *payment* against that debt always produces — `EXPENSE` for a `PAYABLE` debt (paying off what's owed), `INCOME` for a `RECEIVABLE` one (money coming in) — mirroring `addDebtTransaction`'s own existing side/direction logic, not a new rule. `DebtTransactionDialog` shows a category field whenever it's registering a linked transaction, and pre-fills it from the debt's default **only in `mode="payment"`** — `mode="increase"` always produces the *opposite* type (borrowing/lending more), so it never inherits the payment-oriented default; it starts uncategorized, still freely pickable. Either way the field is always editable before submitting — the default is a starting value, never a constraint, same convention as reservoirs' `default_percentage`/`default_destination_account_id`. Server-side, `addDebtTransaction` only falls back to `debts.default_category_id` when `categoryId` is omitted and the entry is a reduction (a payment); an omitted `categoryId` on an increase stays uncategorized rather than silently attaching a mismatched-type category.

`default_category_id` is a normal `RESTRICT` FK to `categories`, no `ON DELETE` clause — same as every other category reference in the schema, and for the same reason (`AI_GENERATION_RULES.md` → "Domain Rules Enforcement": RESTRICT is what forces category deletion through the guided reassignment flow instead of silently orphaning data). Since `debts` has no `subcategory_id` column and its FK column is named differently (`default_category_id`, not `category_id`), it's special-cased rather than folded into the generic loop `categories.service.ts#countReferences`/`reassignCategory` already run over `transactions`/`card_purchases`/`budgets`/`fixed_expenses`/`reservoirs` — but it participates in the exact same flow: deleting a category that's some debt's default surfaces that debt in the usage count (`CategoryUsageDTO.debtsCount`) and gets reassigned in the same batch update before the delete is allowed to proceed.

**A debt itself is now editable and manually deletable, and its ledger entries are editable/deletable too, propagating to their linked transaction — decided and implemented 2026-08-11, at the user's request.** Three gaps, closed together:

- **Editing a debt** (`DebtFormDialog`'s edit mode, `debts.service.ts#updateDebt`): agent, side, initial balance, and the default category above are all freely editable after creation — this is the actual fix for "there's no way to set or change the default category once the debt already exists." Changing `side` after transactions already exist doesn't touch their history (each entry's real type was fixed at the moment it was created); it only changes which type future entries use.
- **Deleting a debt manually** (`DeleteDebtButton`, calling the existing `deactivateDebt` directly): for a debt that's forgiven, or one the user has simply given up on collecting — no payment, no ledger entry, just the same `active = false` soft delete `addDebtTransaction` already applies automatically once a real payment zeroes the balance. The manual path is that same ending state reached without the payment step.
- **Editing or deleting a ledger entry** (`debt_transactions`), mirroring `reservoirs.service.ts#updateReservoirTransaction`/`deleteReservoirTransaction` but *less* restrictive: reservoirs blocks editing a withdrawal outright (only accrual entries are editable), while a debt entry is editable either way — `debts.service.ts#updateDebtTransaction` propagates amount/date/description/category onto the linked `transactions` row when one exists (`AI_GENERATION_RULES.md` → "Linked Records Consistency": editing the source of a linked record must propagate consistently). What editing can never do is flip an entry's direction — a payment can't silently become an increase — since the create-side UI already treats "aumento" and "pagamento" as two separate flows, never a toggle; the service rejects a sign mismatch outright. `deleteDebtTransaction` deletes the linked `transactions` row too, same reasoning as `deleteReservoirTransaction`: a linked ledger entry's only reason to exist is to represent that specific movement. Both recompute the real balance afterward and reapply the same settle-to-zero auto-deactivation `addDebtTransaction` already does post-insert — an edit or delete can just as well zero out a debt as a new entry can.
- This surfaced a real, pre-existing gap: `debt_transactions` had no `date` column at all (only `created_at`, not user-editable) — `DebtTransactionDialog`'s date picker was always shown but silently discarded for any entry without a linked transaction. Migration `0016` adds `debt_transactions.date`, the same fix migration `0011` already made for `reservoir_transactions` for the identical reason.

---

# Budgets

A **standing target** per category/subcategory foi substituído por linhas mensais (migration `0009`, decidido 2026-08-08) — cada linha de `budgets` pertence a exatamente um mês (`budgets.month`, primeiro dia do mês). O design anterior ("standing target, mês é só parâmetro de consulta") permitia que subir um orçamento (ex: aluguel) sobrescrevesse silenciosamente o histórico; isso não vale mais para esta tabela.

- Never generates a transaction. Purely informational — reflects into alerts and the dashboard, and exists only for planning.
- `actualAmount` = real sum of that category's transactions + installments in the queried month.
- `status = EXCEEDED` whenever `actualAmount > plannedAmount`. Does not block anything, only alerts.
- Example: Mercado (groceries) budget of R$800/month — dashboard shows real progress (e.g. "600/800") as the month goes on; exceeding it only triggers an alert, spending isn't capped.

## Which months can be planned, and cloning forward

**Decided and implemented 2026-08-08** (`budgets.service.ts#getBudgetMonthWindow`/`cloneBudgetMonth`). Only two months are ever directly creatable/editable at a time:

- **The current real calendar month** — always plannable, even the very first time (a brand-new user with zero budgets is a normal, expected state, not an error).
- **The next calendar month** — unlocks only once the current month already has at least one active budget row (`getBudgetMonthWindow().hasCurrentMonthBudget`). Rent and similar costs are "extremamente mutável" (the user's own framing) — there's little value in planning further than one month ahead, and every month in between still needs its own real plan.
- **Every earlier month is read-only history** — browsable (reuses the shared `MonthNav`/`MonthPicker`, same pattern as `/cards` and `/transactions`) but never editable, so past numbers stay exactly what was actually planned at the time.

**Cloning** (`CloneBudgetButton`, `cloneBudgetMonthAction`) copies every active row from one month into another verbatim — offered when the viewed (editable) month has zero rows and a prior month exists. The clone source is always `lastRegisteredMonth` — the most recent month with *any* active budget row — **not** the literal previous calendar month. This matters for a sloppy user: someone who plans January and doesn't reopen the app until April should still get April cloned from January, not from an empty February/March. `getBudgetMonthWindow()` computes this via `MAX(month)` over the user's active budgets.

## Category ceilings are never computed — only ever real or absent

**Decided 2026-08-08, corrected mid-design after an initial draft got this wrong**: a category's `plannedAmount` is always either a real, explicitly-user-set row, or there is no category-level number at all — never an implicit "sum of its subcategories." The tempting alternative (show the sum of budgeted subcategories as the category's total when no explicit row exists) was rejected because a category's `actualAmount` already covers *everything* under it, tracked or not (an untracked subcategory like "Manutenção do Veículo" still counts toward its parent category's real spend). An implicit sum would only reflect the *tracked* subcategories, so an untracked expense would look like it blew a budget the user never actually set — a false alert. So:

- A category with **no** active row for the month has no ceiling and no alert of any kind at that level — its subcategories (if any are budgeted) simply show as their own standalone lines, and anything spent in an *unbudgeted* subcategory under it is invisible to the budget system entirely. This is intentional: budgeting is opt-in per line the user actually wants to police, not a mandate to track everything under a category the moment one subcategory gets a number.
- A category *with* an active row gets its usual `actualAmount` vs. `plannedAmount` comparison — and because that `actualAmount` already includes untracked subcategories, this single number naturally gives two severities for free, no new mechanism required: the category's own `EXCEEDED` is a "soft" signal (total category spend, tracked or not, passed the ceiling), while a subcategory's own `EXCEEDED` is a "sharper" one (spend *specifically tracked* under that subcategory passed its own explicit number). Both already existed as-is; nothing new was built for this.
  - Worked example (user-supplied): category "Veículos" = R$1000, subcategory "Combustível" = R$800 (R$200 unallocated headroom). An unbudgeted "Manutenção" expense of R$300 pushes Veículos' total actual to 1100 — Veículos itself flags EXCEEDED (the soft signal), even though Combustível's own 800 was never touched. If Combustível itself later reaches R$900, *that* subcategory flags EXCEEDED too (the sharp signal) — independently, non-blocking either way (maybe the user just took an extra trip).

## Budget hierarchy — category vs. subcategory, and the fixed-expense floor

**Decided 2026-08-07, revised 2026-08-08** (`src/services/_shared.ts#reconcileBudgetFloors`/`reconcileFixedExpenseFloors`/`getCategoryBudgetFloor`/`getSubcategoryBudgetFloor`/`deactivateCategoryBudgetIfOverCommitted`, called from `budgets.service.ts` and `fixed-expenses.service.ts`). Fixed Expenses are, functionally, a special case of Budget: a fixed expense is a *committed, non-negotiable slice* of whatever a category is allowed to spend. It makes no sense for a category's budget to be smaller than the fixed expenses already registered under it — that would mean the "plan" contradicts a bill the user has already committed to.

- A budget can be set at the **category** level (`subcategory_id IS NULL`) or at the **subcategory** level (`subcategory_id` set), nested: a category's budget amount must always be `>=` the sum of (a) every subcategory budget under that category *for the same month*, and (b) every fixed expense attached directly to that category (no subcategory — fixed expenses aren't month-scoped, they're perpetual). Symmetrically, a subcategory's budget must be `>=` the sum of fixed expenses attached to that specific subcategory. The gap between a category's budget and the sum of its subcategory budgets is *unallocated* headroom.
- **Editing a budget downward is a hard block, not a warning** (deliberately inconsistent with the credit-limit soft-enforce pattern — a budget number that contradicts its own committed children is simply wrong, not a "maybe forgot something" judgment call). If the user tries to save a category or subcategory budget below the sum of its children (fixed expenses + subcategory budgets, per the invariant above), the save must fail with a clear validation error naming the floor amount — never silently clamp or partially apply. This direction was never in question and is unchanged.
- **Registering or editing a fixed expense still auto-reconciles the relevant budget upward, with a notification, never a block** — a fixed expense attached directly to a **category** (no subcategory) still auto-creates/raises that category's own row at the sum of its now-committed fixed expenses, exactly as originally designed. Scoped to **current month always, and next month too if a budget already exists at that same level there** (`reconcileFixedExpenseFloors`) — a fixed expense registered today shouldn't silently skip a month the user already pre-planned.
- **A fixed expense attached to a *subcategory* only ever raises/creates the subcategory's own row — never the category's (revised 2026-08-10, at the user's request, correcting the original design's blanket "bubble up to the category" behavior).** A subcategory-level fixed expense is a floor on its subcategory, not automatically on the category above it — creating one when no category budget exists must not conjure a category number the user never set (same "category ceilings are never computed" principle as subcategory-budget saves, immediately below). The category is only ever touched afterward via `deactivateCategoryBudgetIfOverCommitted` — the exact same erasure mechanism a subcategory-budget save already used — never via a raise/create. Four cases, all driven by the single `reconcileBudgetFloors` codepath now shared between fixed-expense saves and subcategory-budget saves:
  1. **Neither the subcategory nor the category has a budget row**: the subcategory row is created at the fixed expense's floor; the category is left alone (`deactivateCategoryBudgetIfOverCommitted` no-ops immediately — there's no category row to touch).
  2. **The subcategory has a row, the category doesn't**: the subcategory row is raised only if the floor now exceeds it; the category still isn't created.
  3. **Both have rows**: the subcategory row is raised as needed, then the category row is re-checked — if it still has real headroom over the (possibly just-raised) sum of all the category's subcategory budgets, it's left untouched; if the sum has caught up to or reached the category's amount (no headroom left), the category row is deactivated with a notice — the user still sees standalone subcategory boxes, just no category-level ceiling anymore.
  4. **The category has a row, the subcategory doesn't**: the subcategory row is created at the floor, then the same category re-check as case 3 runs — deactivate-with-notice if that new subcategory now fills the category exactly (or over), leave the category's row alone if headroom remains.
- **Fixed, corrected bug (2026-08-08, extended to fixed expenses 2026-08-10): saving a subcategory budget — or raising one via a subcategory-level fixed expense — must never raise or create the parent category's row.** The original implementation reused the exact same auto-raise mechanism for *both* fixed expenses and subcategory budgets — so creating "Delivery: 400" under "Alimentação" with no category budget yet would silently auto-create "Alimentação: 400", and adding "Restaurante: 300" would silently raise it to 700. This directly contradicted the design above ("category ceilings are never computed") and produced budgets the user never actually set. The fix (`deactivateCategoryBudgetIfOverCommitted`) replaces raising with **erasing**: raising a subcategory's floor (from either source) is never blocked by the category, but if the new subcategory total now reaches or exceeds the category's *existing explicit* row — an exact fill counts too, not only strictly passing it (tightened 2026-08-10, see below) — that row is deactivated (with a notice) — the category simply goes back to having no number of its own. Re-creating an explicit category budget afterward still must be `>=` the subcategory sum (the unchanged hard-block above). A category with direct fixed expenses is never auto-deactivated this way — its floor from those expenses must never be silently orphaned (the fixed-expense auto-create guarantees such a category always has a row to begin with).
  - Worked example (user-supplied): "Alimentação" = R$1000 (explicit). Add "Delivery" = 400, then "Restaurante" = 300 — sum is 700, still under 1000, Alimentação keeps its own row and headroom (nested display). Add "Mercado" = 800 — sum is now 1500, over 1000 — Alimentação's own row is deactivated with a notice, and the category goes back to rendering as a bare label above three standalone subcategory lines (Delivery, Restaurante, Mercado), each still in the database exactly as entered. The same deactivation now also fires on an *exact* fill — e.g. Delivery=400 + Restaurante=300 + Mercado=300 summing to exactly 1000 removes Alimentação's row too, since there's no headroom left to justify a category-level number distinct from its parts.
- **Tree display** (`src/features/budgets/components/budget-tree.tsx`): a category with an active row renders normally nested (category box + subcategory boxes — real headroom is guaranteed here, by construction). A category with **no** active row and exactly one budgeted subcategory merges into a single box labeled "Categoria · Subcategoria" (avoids a number-less header sitting above one lone child). Two or more subcategories with no category row render as a bare category-name divider above each subcategory's own standalone box.
- **Tree-based budget-entry screen**: `src/features/budgets/components/budget-tree-editor.tsx` ("Planejar orçamentos", on `/budgets`), reusing the onboarding category-tree-picker's visual pattern — each category/subcategory row gets an amount input, planning a whole tree in one screen. Category rows save before subcategory rows in the same submission, which is what lets a category's ceiling exist before its children get checked against it. Sits alongside the single-row `budget-form-dialog.tsx` (used for one-off edits) and is also reused, via the shared `BudgetTreeFields`, by the first-time onboarding budget step (`src/app/onboarding/budget/page.tsx`) — see "Onboarding hook" below.
- **The tree editor doubles as a bulk-delete tool (decided 2026-08-08, at the user's request).** Clearing a field that already has a budget doesn't just skip it — it deactivates that row (`deactivateBudgetAction`), same as clicking the single-row trash icon. This is deliberately how "big changes" are meant to be made: instead of hunting down individual trash icons across a large tree, open "Planejar orçamentos," blank out everything you want gone, save once. Goes through the exact same guards as any other delete (see next point), so a blank field on a row with fixed expenses attached fails with a clear inline error instead of silently deleting or crashing.
- **A budget row that's the committed floor for one or more fixed expenses can never be deleted — only raised (decided 2026-08-08).** Deleting it would orphan that floor. Enforced at the service layer (`budgets.service.ts#deactivateBudget` checks for attached `fixed_expenses` before deactivating, mirroring `deactivateCategoryBudgetIfOverCommitted`'s own guard on the auto-path) so every entry point respects it — the single-row delete button, and the tree editor's blank-field shortcut above. The UI additionally hides the trash icon on any category/subcategory row that has fixed expenses nested under it, so the block is never surprising — the row is still fully editable (can be raised), it just can't be removed while something depends on it. Mirrors the same shape as the category/subcategory deletion routine elsewhere in the app: guided, never silent.
- This rule applies identically to subcategory budgets — a subcategory is just one level further down the same nesting invariant, not a special case.

## Single unified page — no more Orçamentos/Despesas Fixas tabs

**Decided and implemented 2026-08-08, at the user's request** ("separar elas em tabs pode estar confundindo mais do que ajudando"). `/budgets` used to split into two tabs — a flat list of budgets, and a separate flat list of fixed-expense cards with their own pay/edit/delete actions. Since a fixed expense is functionally a special case of budget (see above) and already renders nested inside its category/subcategory's tree row, keeping a *second*, separate list of the same fixed expenses was redundant and made the hierarchy harder to see, not easier. Now there is one list — the tree — and two creation buttons at the top: "Novo orçamento" (category/subcategory, month-scoped, gated to the editable window) and "Nova despesa fixa" (always available — fixed expenses are perpetual, not month-owned, so creating one isn't tied to which month is being viewed). Each fixed expense's own row inside the tree carries its actions directly: a payment icon, edit, and delete — same components as before (`PayFixedExpenseDialog`, `FixedExpenseFormDialog`, `DeactivateFixedExpenseButton`), just wired as inline row actions via `BudgetTree`'s `renderFixedExpenseActions` prop instead of living on a standalone card.

**The payment icon is always visible, whether paid or not this month — decided and implemented 2026-08-10, at the user's request, after a test payment left real `/budgets` data stuck "paid" with no way back.** It used to only render when `!isPaidThisMonth`, so once a payment was registered — including by mistake, e.g. wrong test data or the wrong account — there was no in-app way to undo it short of a manual database fix. `PayFixedExpenseDialog` now branches on `expense.isPaidThisMonth`: unpaid opens the same account/amount/date form as before; paid opens a plain-text summary instead — *"{nome} pago no valor de {valor} no dia {data}"* — with "OK" (just closes) and "Cancelar pagamento" (rollback) buttons. "Cancelar pagamento" calls `fixed-expenses.service.ts#cancelFixedExpensePayment(fixedExpenseId, month)`, which deletes whichever real record(s) made that month's `isPaidThisMonth` true — the linked `transactions` row (CASH/BANK) or the linked `card_purchases` row (CREDIT_CARD, installments cascade with it) — scoped strictly to the viewed month, so cancelling one month's payment never touches a different month's separate payment for the same fixed expense. `FixedExpenseDTO.paidDate` (new) carries the date shown in the summary text.

**A fixed expense's bar inside the tree reflects real payment status, not the planned placeholder (decided 2026-08-08, at the user's request).** It was showing full/100% even when nothing had been paid yet, because the row was using `projectedAmount` (the planned-amount fallback used elsewhere so a monthly total doesn't look empty before the due day — see "Fixed Expenses" below, unchanged) for its own "actual" figure. Inside the budget tree specifically, a full bar must mean *paid* — `FixedExpenseRow` (`budget-tree.tsx`) now uses `actualAmount` (real linked transactions, 0 when unpaid) instead. This is deliberately different from the placeholder behavior kept elsewhere: the tree is asking "did this get paid," not "what should I expect to owe."

## Month's transactions shown at the bottom of `/budgets`

**Decided and implemented 2026-08-08, at the user's request** ("quanto mais lugares com informação melhor"). `/budgets` now also renders the same `TransactionExplorer` used on the dashboard, scoped to the viewed month (`getTransactionsFiltered({ periodStart, periodEnd })`), unfiltered by category — so a user can see exactly what they logged (transactions and card purchases alike) without leaving the budget screen, including inline category editing on each row. Shown regardless of whether the viewed month is editable — it's purely informational, same as browsing history.

## Onboarding hook

**Decided and implemented 2026-08-08.** Right after a first-time signup picks starter categories in `/onboarding` and at least one category/subcategory was actually imported, `completeOnboarding` redirects to `/onboarding/budget` (outside the `(app)` layout group, same reasoning as `/onboarding` itself — no nav chrome mid-setup) instead of straight to `/dashboard`, to plan the current month's budget while the user is already in a setup mindset. Skipping it is a fully valid, no-op choice — "se ele pular esta etapa não fazemos nada" — the only trace left is that the dashboard's budgets panel shows a "Criar orçamento" CTA instead of an empty message. Re-imports from Settings (`isFirstTime = false`) never trigger this step, only the very first onboarding does.

---

# Fixed Expenses (recurring)

Functionally a **specialized, committed slice of a Budget** for genuinely fixed recurring bills (rent, streaming, subscriptions) — `fixed_expenses.amount`, `due_day`, optional `default_account_id`. See "Budget hierarchy" above for how the two interact: a fixed expense's amount is always a floor on its category/subcategory's budget, auto-raised on registration, never silently allowed to exceed the budget without reconciling it.

- Before the real payment is registered this month, the dashboard shows the **planned amount as a placeholder** (`projectedAmount = plannedAmount`) so the monthly total reflects the expected expense even before the due day.
- Once a real `transactions` row is registered and linked via `fixed_expense_id`, the dashboard switches to showing that **real value** (`projectedAmount = actualAmount`) — this avoids ever double-counting the placeholder and the real transaction together. This same transaction is what feeds the parent budget's `actualAmount`, since both aggregate from the same `transactions`/`card_installments` rows for the category/subcategory/month.
- If the real value ends up higher than planned, it shows the real (larger) number plus an `EXCEEDED` alert.
- **Exception**: inside the budget tree specifically (`/budgets` and the dashboard panel), a fixed expense's own progress bar uses `actualAmount` directly, not `projectedAmount` — see "Budgets" → "Single unified page" above. A full bar there must mean "paid," never "this is what I expect to owe."
- **Long-term unpaid/overdue fixed expenses are out of automatic scope.** If a bill goes unpaid across months, the intended path is a manual `Debt` entry — the system does not attempt to auto-roll an unpaid fixed expense forward.
- Never generates a transaction on its own; the user (or, in the future, an import) always creates the real `transactions` row.
- The "Registrar pagamento" dialog (`pay-fixed-expense-dialog.tsx`) has no free-text description field — it passes `"Pagamento — {nome da despesa fixa}"` as the transaction's description by default (fixed 2026-08-07), so the row reads clearly in Lançamentos/Dashboard instead of showing blank.

**Paying a fixed expense supports every account type, including `CREDIT_CARD` — decided and implemented 2026-08-10.** A real fixed bill can be settled in more than one way: some are debited monthly straight from a bank/cash balance, some are charged to a credit card's invoice every cycle (a streaming subscription, for instance), and some are handled entirely outside any tracked account (cash handed over within the family) — that last case is just a `CASH` account like any other, not a special case. Previously `/budgets` filtered the account pickers (`FixedExpenseFormDialog`'s "Conta padrão" and `PayFixedExpenseDialog`'s "Conta") down to non-`CREDIT_CARD` accounts only, so a card-billed fixed expense had no correct way to be registered at all. Both pickers now use the shared `AccountSelect` (`src/components/ui/account-select.tsx`), which groups accounts by type in the same `CASH → BANK → CREDIT_CARD` order as the Accounts page and shows each account's type icon next to its name — necessary because a bank account and a credit card can share the exact same name (e.g. both named after the same institution), so the icon is what actually tells them apart, not the label.

`payFixedExpense` (`fixed-expenses.service.ts`) decides how to record the payment from the **account's own type, read server-side from the database — never from client input**: a `CASH`/`BANK` account still creates a plain `EXPENSE` transaction linked via `fixed_expense_id`, exactly as before. A `CREDIT_CARD` account instead creates a **single-installment (1x) `card_purchases` row**, also linked via the same `fixed_expense_id` column (added to `card_purchases` in migration `0012`) — this flows the payment through the normal `card_purchases` → `card_installments` pipeline instead of an invalid plain transaction against an account type `transactions` was never meant to touch directly (see "Transactions" above — `CREDIT_CARD_PAYMENT` already owns that account-type slot, for a different purpose). No new competence logic was written for this: `createCardPurchase` already derives the installment's competence month from the card's `closing_day`/`due_day` the same way any manual card purchase does, so a fixed expense paid on, say, the 20th against a card that closes on the 15th automatically lands in the *next* competence month, never the current one. `getFixedExpenses`'s `actualAmount` was extended to match — it now also sums the `card_installments.amount` (by `competence`, never `purchase_date`, same rule as every other credit card analytic) of any `card_purchases` linked to the fixed expense, alongside the pre-existing `transactions` sum.

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
