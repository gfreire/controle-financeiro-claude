-- Onboarding ganha um passo de conta (AI_CONTEXT.md "Onboarding — conta padrão"), a pedido do
-- usuário: hoje o onboarding só cobre categorias/orçamento, então um usuário novo termina sem
-- NENHUMA conta cadastrada e não consegue lançar nada até ir em Configurações/Contas por conta
-- própria. Em vez de forçar um formulário completo de conta logo de cara, o trigger que já cria
-- `profiles` no signup (migration 0003) passa a criar também uma conta "Carteira" (CASH, saldo
-- inicial 0) — o onboarding só precisa perguntar o saldo atual dela, não os outros campos.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_account_id uuid;
begin
  insert into public.profiles (user_id, name, email)
  values (new.id, new.raw_user_meta_data ->> 'name', new.email)
  on conflict (user_id) do nothing;

  insert into public.accounts (user_id, type, name)
  values (new.id, 'CASH', 'Carteira')
  returning id into new_account_id;

  insert into public.cash_accounts (account_id, initial_balance)
  values (new_account_id, 0);

  return new;
end;
$$;
