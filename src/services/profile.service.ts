import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";

export type ProfileDTO = { name: string | null; email: string | null; phone: string | null; onboardingCompleted: boolean };

/**
 * Self-healing: the profiles row normally comes from the on_auth_user_created DB trigger
 * (supabase/migrations/0003_profile_trigger.sql), but any account created before that trigger
 * existed has no row to find. Rather than crash on `.single()` for those accounts forever,
 * fall back to creating the row lazily on first read.
 */
export async function getProfile(): Promise<ProfileDTO> {
  const supabase = await createClient();
  const user = await getUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("name, email, phone, onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (data) {
    return { name: data.name, email: data.email, phone: data.phone, onboardingCompleted: data.onboarding_completed };
  }

  const name = (user.user_metadata?.name as string | undefined) ?? null;
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ user_id: user.id, name, email: user.email ?? null })
    .select("name, email, phone, onboarding_completed")
    .single();
  if (insertError) throw new Error(insertError.message);

  return { name: created.name, email: created.email, phone: created.phone, onboardingCompleted: created.onboarding_completed };
}

export async function updateProfile(input: { name?: string; phone?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const { error } = await supabase.from("profiles").update(input).eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

export async function markOnboardingCompleted(): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const { error } = await supabase.from("profiles").update({ onboarding_completed: true }).eq("user_id", user.id);
  if (error) throw new Error(error.message);
}
