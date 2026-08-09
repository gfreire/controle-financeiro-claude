# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@DOC/AI_GENERATION_RULES.md
@DOC/AI_CONTEXT.md
@DOC/ARCHITECTURE.md

## Commands

```bash
npm run dev      # start dev server (Next.js 16, Turbopack)
npm run build    # production build
npm run start    # run the production build
npm run lint      # ESLint (flat config: eslint-config-next core-web-vitals + typescript)
npx tsc --noEmit # typecheck only (no dedicated script; tsconfig has noEmit: true)
```

No test suite exists yet — `DOC/AI_GENERATION_RULES.md`'s "Testing & Migrations" section describes the intended (lightweight) scope: targeted integration tests on installment rounding, reservoir/debt balance calculation, and RLS isolation. There is currently no test runner configured in `package.json`.

### Supabase

- Migrations live in `supabase/migrations/`, one file per schema change, applied in order. Never hand-edit an already-applied migration — add a new one.
- The local checkout is linked to a Supabase project (`supabase/.temp/linked-project.json`); apply migrations via the Supabase CLI (`supabase db push`) or by pasting the SQL into the project's SQL Editor.
- `DOC/schema.sql` / `DOC/seed.sql` mirror the current *merged* schema state (not migration 0001 alone). Any schema change must update these alongside the new migration file, in the same turn — see "Documentation Maintenance" at the top of `DOC/AI_GENERATION_RULES.md`.

## Architecture

Personal financial control app (Next.js 16 App Router + React 19 + TypeScript + Supabase/Postgres) for the owner and a closed group of friends, each with fully RLS-isolated data. Visual design follows the "Industry" blueprint aesthetic (steel-blue, square-cornered, Tailwind v4 CSS-first theme).

The full architecture — service contracts, DTO shapes, RLS policy set, domain rules (credit card installment competence, budget/fixed-expense hierarchy, reservoir/debt ledgers, category deletion flow, etc.) — is already loaded above via the `@`-imports (`AGENTS.md`, `AI_GENERATION_RULES.md`, `AI_CONTEXT.md`, `ARCHITECTURE.md`). Read those before making changes rather than re-deriving the design by grepping `src/` — they are kept up to date specifically so a fresh session doesn't have to. `ARCHITECTURE.md`'s "Implementation Status" section is the authoritative list of what's actually built vs. still a documented deviation vs. a known gap.

Quick orientation to the folders (see `ARCHITECTURE.md` → "Project Structure" for the full tree):

- `src/lib` — pure helpers (`utils`, `validations`), Supabase clients (`supabase`), auth (`auth`). No database queries, no UI logic.
- `src/services` — the *only* layer allowed to query Supabase. One service per domain (`dashboard`, `transactions`, `accounts`, `categories`, `cards`, `reservoirs`, `debts`, `budgets`, `fixed-expenses`, `profile`), returns DTOs, `_shared.ts` holds budget/fixed-expense aggregation shared by both.
- `src/features/<domain>/components` — domain components and the Server Actions that call the services.
- `src/components/ui` and `src/components/layout` — shared primitives (shadcn-style) and page shell (sidebar/header/bottom-nav).
- `src/types` — `database.ts` (raw row shapes) and `dto.ts` (source of truth for every DTO).
- `src/app` — App Router routes: `(auth)`, `(app)` (redirects to `/onboarding` until `profiles.onboarding_completed`), `onboarding` (outside the app layout, no nav chrome).

One project-specific quirk worth knowing before writing any code: `AGENTS.md` (imported above) flags that this Next.js version has breaking changes vs. training data, and points at `node_modules/next/dist/docs/` as the source of truth to check first.
