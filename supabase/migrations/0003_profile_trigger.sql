-- ============================================================
-- Auto-create profiles row on signup, via a DB trigger.
--
-- Why: the client-side insert (`profiles.insert(...)` right after
-- `auth.signUp()`) hits RLS ("own profile" requires auth.uid() = user_id)
-- whenever the Supabase project has email confirmation enabled — signUp()
-- creates the auth.users row but returns no session until the user
-- confirms, so auth.uid() is null at insert time and the RLS check fails.
-- A SECURITY DEFINER trigger on auth.users bypasses that timing issue
-- entirely and works the same way regardless of email-confirmation
-- settings, magic links, OAuth, etc.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, name, email)
  values (new.id, new.raw_user_meta_data ->> 'name', new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
