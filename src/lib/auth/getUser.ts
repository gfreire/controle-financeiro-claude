import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side auth guard. Never trust a user_id passed from the client — always derive it here. */
export async function getUser() {
  const user = await getOptionalUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getOptionalUser() {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    // A stale/corrupt session cookie (e.g. an access token whose `iat` clock-skewed
    // ahead of the auth server) throws instead of returning a clean { user: null }.
    // Treat it the same as "not authenticated" — signing in again overwrites the
    // bad cookie with a freshly issued one.
    return null;
  }
}
