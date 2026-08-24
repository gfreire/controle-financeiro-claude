# Email Templates (Supabase Auth)

Templates de email transacional do Supabase Auth (confirmação de cadastro, magic link, reset de senha, etc.), estilizados com a identidade visual do app ("Industry" blueprint — steel-blue, cantos quadrados, marcações de canto "+", Barlow Condensed nos títulos — mesma paleta de `src/app/globals.css`).

**Não são configuração automática.** O Supabase Auth não lê arquivos deste repositório para os templates de email de um projeto hospedado — cada template precisa ser colado manualmente no dashboard. Esta pasta existe só para manter o HTML **versionado e revisável no git**, já que de outra forma a única cópia existiria dentro da configuração do projeto Supabase, sem histórico nem diff.

## Arquivos

- `email-templates/confirm-signup.html` — template do "Confirm signup" (email enviado após `supabase.auth.signUp()`, ver `src/app/(auth)/actions.ts#signUp`).

## Como aplicar uma mudança

1. Edite o `.html` correspondente aqui no repo (mantendo as convenções abaixo).
2. Copie o conteúdo completo do arquivo.
3. No Supabase Dashboard → **Authentication → Email Templates**, selecione o template correspondente (ex.: "Confirm signup") e cole o HTML no campo de conteúdo.
4. Salve. A mudança é imediata para os próximos emails enviados — não precisa de deploy nem de migration.

Sempre que o template mudar aqui, aplique a mesma mudança no dashboard do Supabase na mesma sessão de trabalho — assim como qualquer outro doc deste projeto, o arquivo só serve como fonte de verdade se o que está no dashboard realmente bater com ele.

## Convenções ao editar/criar um template

- **CSS inline, nunca `<style>` em bloco ou externo.** Vários clientes de email (Gmail em particular) removem `<style>` do `<head>`; só o `style=""` inline é garantido.
- **Layout em `<table>`, nunca flexbox/grid.** É o único modelo de layout com suporte consistente entre clientes de email (Gmail, Outlook, Apple Mail, Yahoo).
- **Cores hardcoded, nunca `var(--color-*)`.** Clientes de email não resolvem custom properties CSS. Os valores usados são uma cópia literal do tema **light** de `src/app/globals.css` (`--color-bg`, `--color-accent-600`, etc.) — dark mode não é usado aqui porque o suporte via `prefers-color-scheme` em email é inconsistente o bastante para não valer o risco de texto ilegível em algum cliente.
- **Fontes com fallback.** `'Barlow Condensed', Arial, Helvetica, sans-serif` — a maioria dos clientes de email bloqueia `@import`/`<link>` de fontes externas (o app usa Google Fonts via Next.js, o que não se aplica aqui), então o Barlow Condensed só aparece em quem já tem a fonte instalada; o fallback sans-serif é o que a maior parte dos destinatários realmente vê.
- **Marcações de canto (`+`) são cosméticas, não essenciais.** Replicam `.corner` de `globals.css` via `position:absolute`. Funcionam na maioria dos clientes modernos, mas o Outlook desktop (motor de renderização Word) pode ignorá-las — isso é aceitável, pois não afeta a legibilidade nem a função do email caso não apareçam.
- **Variáveis do Supabase** (sintaxe Go template, resolvidas pelo Supabase Auth ao enviar): `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}`, `{{ .Token }}`, `{{ .TokenHash }}`, `{{ .RedirectTo }}`. Cada tipo de template do Supabase (Confirm signup, Magic Link, Change Email, Reset Password, Reinvite) tem seu próprio conjunto disponível — conferir no editor do dashboard antes de usar uma variável nova.
