import { cache } from "react";
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

// supabase.auth.getUser() always revalidates against the Supabase Auth server (a real network
// round-trip) rather than just decoding the local JWT — that's deliberate, it's what makes it
// safe to trust server-side. But every service function calls getUser() independently, and a
// single page load fans out into many parallel service calls (e.g. the dashboard's Promise.all),
// so without memoization one render pass was firing 8-10 redundant round-trips to the same auth
// check. React's cache() memoizes per request, collapsing that back down to one.
export const getOptionalUser = cache(async () => {
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
});
