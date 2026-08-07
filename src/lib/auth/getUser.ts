import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side auth guard. Never trust a user_id passed from the client — always derive it here. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getOptionalUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
