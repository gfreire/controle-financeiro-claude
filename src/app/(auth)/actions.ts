"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string } | undefined;

export async function signIn(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-mail ou senha inválidos" };

  redirect("/dashboard");
}

export async function signUp(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  if (error) return { error: error.message };
  if (!data.user) return { error: "Não foi possível criar a conta" };

  // profiles row is created by the on_auth_user_created DB trigger (supabase/migrations/0003_profile_trigger.sql),
  // not here — a client-side insert right after signUp() hits RLS whenever email confirmation is required.

  if (!data.session) {
    return { error: "Conta criada! Confirme seu e-mail para continuar e depois faça login." };
  }

  // First-time flow now starts with the auto-created "Carteira" balance confirmation, not
  // category picking (AI_CONTEXT.md "Onboarding — conta padrão", reordered 2026-08-24 at the
  // user's request) — /onboarding/account redirects into /onboarding itself once done.
  redirect("/onboarding/account");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
