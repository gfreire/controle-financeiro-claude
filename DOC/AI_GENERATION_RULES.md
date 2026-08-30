# AI Code Generation Rules

Rules that AI code generators must follow when creating or modifying code in this project. Read together with `ARCHITECTURE.md` and `AI_CONTEXT.md`.

`CLAUDE.md` at the project root `@`-imports this file, `AI_CONTEXT.md`, and `ARCHITECTURE.md` — they load automatically at the start of every session. Don't ask the user to re-paste them or re-explain the system; read what's already here first, and use `Explore`/`grep` on `src/` only to confirm current implementation details these docs don't cover.

---

# Documentation Maintenance (read this first)

These three docs (`AI_GENERATION_RULES.md`, `AI_CONTEXT.md`, `ARCHITECTURE.md`) plus `schema.sql`/`seed.sql` are the **only** context a fresh session starts with — the whole point of auto-loading them via `CLAUDE.md` is so a new chat can pick up this project without the user re-explaining it and without you re-deriving it by reading half of `src/`. That only works if they stay accurate.

**Whenever a change in this session alters any of the following, update the relevant doc(s) in the same turn — not as a follow-up, not left for later:**

- A schema change (new column, table, constraint, trigger) → add a new file in `supabase/migrations/` (never hand-edit an already-applied one) **and** reflect the same change in `DOC/schema.sql`/`DOC/seed.sql` so that file always represents the schema as it stands today, not as it stood at t=0. Note in the migration's own comment *why*, not just *what* — the next session reads the comment, not this conversation.
- A new/changed service function, DTO shape, or service contract → update the "Service Layer & Contracts" and "DTO Definitions" sections in `ARCHITECTURE.md`.
- A new domain rule, or a correction to one already documented → update `AI_CONTEXT.md`. If something documented as a "known gap" gets built, remove the gap note — don't leave stale TODOs claiming something doesn't exist once it does.
- A new page/route, or a structural change to `src/` → update "Project Structure" / "Routing" in `ARCHITECTURE.md`.
- Any decision the user made that isn't derivable from the code itself (e.g. "drop this default subcategory, it's confusing," "soft-enforce this limit, never block") → capture the *reasoning*, not just the outcome, in `AI_CONTEXT.md` or a migration comment — future sessions (and future you) need to know *why*, or they'll second-guess or silently revert it.

See `ARCHITECTURE.md`'s "Implementation Status" section for the running log of what's actually built vs. still spec-only, and `supabase/migrations/` for the applied-migrations changelog — keep both current the same way.

---

# Language Rules

Code, database tables, and technical identifiers in English. User-facing labels, category names, and UI text in Portuguese (pt-BR).

---

# General Principles

Respect the system architecture and financial domain rules. Never invent new architectural patterns not defined in the documentation. Always follow: folder structure, service layer, DTO definitions, domain rules.

---

# Folder Structure Rules

```
src
 ├ lib (supabase, auth, utils, validations)
 ├ services
 ├ features
 ├ components
 └ types
```

`utils`: pure helper functions only, never depend on services or database queries, reusable by server and UI.
`validations`: Zod schemas and cross-field business rules not enforced by the database (e.g. income categories must not have a subcategory).

Do not create alternative structures.

---

# Database Access Rules

1. Database queries exist only inside **services**.
2. UI components never query Supabase directly.
3. Pages call services, not queries.
4. Services return DTOs.
5. Server Actions call services; never access Supabase directly themselves.
6. Never write database queries inside React components, pages, or hooks.

---

# Row Level Security (mandatory)

Every user-scoped table has RLS enabled with a policy on `auth.uid() = user_id` (see `schema.sql` for the exact policy set — tables without a direct `user_id` column, like `card_installments` or `debt_transactions`, check via `EXISTS` against their parent table).

- **Never** query with a service-role key from anything the client can reach. Service role, if ever needed, is server-only and must not bypass user isolation logic.
- Never trust a `user_id` passed from the client — always derive it from the authenticated session (`getUser()` in `src/lib/auth`) server-side.
- Global catalog tables (`financial_institutions`, system `categories`/`subcategories`) are public-read; writes to them are not exposed to the client.

---

# Service Layer Rules

Services must encapsulate all Supabase queries, return DTOs (defined in `ARCHITECTURE.md`), and contain the financial aggregation logic. Services must not contain UI logic or depend on React components.

Required services: `dashboard.service.ts`, `transactions.service.ts`, `accounts.service.ts`, `categories.service.ts`, `cards.service.ts`, `reservoirs.service.ts`, `goals.service.ts`, `debts.service.ts`, `budgets.service.ts`, `fixed-expenses.service.ts`, `profile.service.ts`.

**Never store a value in the database that can be computed from other rows** — reservoir/debt balances, installment numbers, budget/fixed-expense projected amounts are always calculated in the service (or a SQL view), never persisted as a mutable column. This is not optional — it is the pattern already established across the whole schema.

---

# DTO Rules

DTOs defined in `ARCHITECTURE.md` are the source of truth. Do not modify DTO structure unless explicitly instructed. UI components only consume DTOs, never raw database rows.

---

# Identifiers

All primary keys are `uuid`, generated with `gen_random_uuid()` at the database level (matches `auth.users.id`, which is always `uuid`). `src/lib/utils/id.ts` should mirror this (UUID v4) if an ID is ever needed client-side before insert.

---

# Chart Rules

Charts use Recharts, receive aggregated data from services, and never calculate totals (`reduce()`/manual sums are forbidden in components). All aggregation happens in SQL (`SUM`, `GROUP BY`) inside services.

Credit card analytics use `card_installments.competence`, never `card_purchases.purchase_date`.

---

# Dashboard Interaction Rules

Filter-driven: `DashboardFilters` (see `ARCHITECTURE.md`) controls charts, transaction explorer, summary cards, budgets/fixed-expenses panel. Clicking a chart updates the shared filter, which reloads the rest.

---

# UI Component Rules

Small, reusable, stateless when possible. Receive data through props. Never fetch data directly.

Dashboard tables (Transaction Explorer and similar) are the exception to "never fetch/mutate" in one sense only: they must expose inline edit affordances calling `updateTransaction`/`reassignCategory` directly from the row — don't route a dashboard edit through a full-page form when the domain already supports a partial update. The exact interaction pattern is decided in Design, not assumed here.

---

# Styling Rules

TailwindCSS + shadcn/ui only. No inline styles, no `style={{}}`, no custom CSS files unless unavoidable.

---

# State Management Rules

Local component state for UI interactions. Global state avoided unless necessary — dashboard shared filters via React context or a shared hook.

---

# Server Architecture Rules

Next.js App Router + Server Components. `page.tsx` → service → Supabase query → DTO → component. API routes only if strictly necessary. Mutations via Server Actions calling services.

---

# Form Rules

Controlled inputs, validation via `src/lib/validations`, clear error states. Forms allow creating categories/subcategories inline (transaction form, card purchase form) without leaving the screen.

---

# Domain Rules Enforcement

AI must respect `AI_CONTEXT.md`. Key examples to never violate:

- Transfers and credit-card-payment-account-side movements never count as INCOME/EXPENSE in analytics.
- Reservoir and Debt entries never affect totals directly — only the transactions they link to do.
- Budgets/Fixed Expenses never generate transactions.
- Income categories never get a subcategory (validate in `src/lib/validations`, not just UI).
- Installment competence date drives all credit card analytics, never purchase date.
- Rounding remainder on installment generation goes to the first installment.
- `is_system` categories (`Juros`, `Rendimentos`, `Ajuste`, `Estorno`, `Compras retroativas`, `Pagamento de Cartão`) are never editable/deletable by any user, never copied, and **never selectable from a form** — they never appear in `CategorySelect` (the shared assignment picker), only in the dashboard/Cards/Transactions *filter* dropdowns. Each is applied exclusively by its own dedicated flow: `registerYield` → `Rendimentos`; `reconcileAccountBalance` → `Ajuste`; `registerInterest` ("Lançar Juros", account-side for `BANK`, and the Cards page's "Fatura" menu) → `Juros`; `refundCardPurchase`/`refundTransaction` → `Estorno`; the retroactive-purchase computed income → `Compras retroativas`; `registerCardPayment` ("Pagar fatura") → `Pagamento de Cartão`, applied automatically to every `CREDIT_CARD_PAYMENT` transaction (migration `0031`). The choice of flow is the user's, not an automatic classification — except `Pagamento de Cartão`, which the system always applies since a card payment has exactly one flow anyway.
- A category's `type` is always required and must match the `type` of any transaction it's attached to (an `EXPENSE` category can't be used on an `INCOME` transaction) — this is why `Ajuste` is two rows, not one.
- Category name uniqueness is per `(user_id, type)`, not global; subcategory name uniqueness is per `category_id`, not global. Only literal duplicate names within the same tree are blocked — semantically similar names (e.g. "iFood" and "Delivery" in the same category) are allowed.
- `active` (accounts, categories, subcategories, debts, fixed_expenses, reservoirs, budgets) is the soft-delete convention — every `getX()` list function filters `active = true` by default; hard `deleteX()` remains available in the schema but should be a last resort once real history exists, since it can't be undone.
- Deleting a category/subcategory is never a bare `DELETE`: always show usage count + preview, let the user choose reassign/fall-back-to-parent/leave-uncategorized, run the batch update via `reassignCategory`, and only then delete. Never add `ON DELETE CASCADE` or `SET NULL` to `category_id`/`subcategory_id` on `transactions`, `card_purchases`, `budgets`, `fixed_expenses`, or `reservoirs` — the default `RESTRICT` is what forces this flow to run instead of silently orphaning or wiping data.
- Reservoir accrual entries' `grossAmount`/`percentage`/`amount` (net) split: `grossAmount` is always a direct user input, never recalculated. Editing `percentage` or `amount` recalculates the other one (via `calculateGrossNetSplit`), given `grossAmount` is present. All three fields stay optional — a plain `amount`-only entry is always valid.

---

# Linked Records Consistency

Examples: card purchase → installments; reservoir withdrawal → transaction/card purchase; debt payment → transaction (when money moved through a tracked account); fixed expense payment → transaction (via `fixed_expense_id`).

Editing the source of a linked record must propagate consistently (e.g. editing a purchase amount must update its installments, respecting the rounding rule).

---

# Testing & Migrations (lightweight)

- Supabase migrations via the Supabase CLI, one file per schema change, checked into the repo — never hand-edit the production schema outside of a migration.
- Prioritize a handful of integration tests around the areas most likely to break silently: installment generation/rounding, reservoir/debt balance calculation, RLS isolation (a user must never be able to read another user's row, even by guessing an id).
- Full test coverage is not a goal for this project's scale — targeted tests on money-precision and RLS logic are the priority.

---

# Code Quality Rules

Clear function names, small functions, readable structure, no duplicated logic. Avoid extremely long files. Reuse existing utilities in `src/lib/utils` over reimplementing formatting/normalization/numeric helpers.

---

# Performance Rules

Services minimize data transfer: aggregated SQL, filtered queries, pagination when needed. Avoid returning large datasets when not necessary.

---

# Final Goal

The system should remain modular, AI-readable, easy to extend, predictable, and RLS-isolated per user. All generated code follows the rules in this document.
