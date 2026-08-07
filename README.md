# Controle Financeiro Pessoal

Sistema pessoal de controle financeiro com dashboard analítico, para o dono e um grupo fechado de amigos, cada um com dados totalmente isolados (RLS). Ver `DOC/ARCHITECTURE.md`, `DOC/AI_CONTEXT.md` e `DOC/AI_GENERATION_RULES.md` para as regras de domínio e arquitetura completas.

Stack: Next.js 16 (App Router) + React 19 + TypeScript + TailwindCSS v4 + Supabase (Postgres + Auth) + Recharts. Visual baseado no design system "Industry" (estética blueprint industrial, azul-aço).

## Setup

1. Instale as dependências (já feito neste scaffold):
   ```bash
   npm install
   ```

2. Crie um projeto em [supabase.com](https://supabase.com) e copie a URL e a `anon key` (Project Settings → API).

3. Copie `.env.example` para `.env.local` e preencha:
   ```bash
   cp .env.example .env.local
   ```

4. Rode as migrations no seu projeto Supabase (SQL Editor, ou via Supabase CLI apontando pra `supabase/migrations/`):
   - `0001_initial_schema.sql` — schema completo (tabelas, enums, RLS)
   - `0002_seed.sql` — catálogo de categorias/subcategorias padrão + instituições financeiras

5. Rode o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

## Estrutura

```
src
 ├ lib          # supabase (client/server/proxy), auth, utils, validations (Zod)
 ├ services     # toda a lógica de negócio e queries Supabase — única camada com acesso ao banco
 ├ features     # componentes + server actions por domínio (dashboard, transactions, accounts, cards, reservoirs, debts, budgets, categories)
 ├ components   # ui (primitivas shadcn-like) e layout (sidebar, header, bottom nav)
 ├ types        # database.ts (linhas do schema) e dto.ts (DTOs consumidos pela UI)
 └ app          # rotas do App Router — (auth), (app), onboarding
```

## Onboarding de um novo usuário

Ao criar conta, o usuário é levado a `/onboarding`, onde escolhe quais categorias do pacote inicial (`is_default`) quer usar — elas são copiadas para o `user_id` dele. As categorias de sistema (Juros, Rendimentos, Ajuste) já ficam disponíveis automaticamente, sem escolha.

## Regras de negócio centrais

Ver `DOC/AI_CONTEXT.md` para o detalhamento completo. Resumo do que já está implementado nos services:

- Competência de parcelas de cartão sempre calculada a partir de `closing_day`/`due_day`, nunca da data da compra.
- Resto da divisão de parcelas sempre vai para a primeira parcela (`src/lib/utils/money.ts`).
- Transferências e pagamentos de fatura nunca contam como receita/despesa nas análises.
- Reservatórios e dívidas nunca afetam saldos/análises diretamente — só as transactions vinculadas.
- "Informar Rendimento" e "Ajustar Saldo" (`accounts.service.ts`) geram a mesma lógica de diferença, categorizando como `Rendimentos` ou `Ajuste` respectivamente.
- Exclusão de categoria/subcategoria nunca é direta — sempre passa pelo fluxo guiado de reassignment (`categories.service.ts#reassignCategory`).
