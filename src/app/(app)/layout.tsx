import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/getUser";
import { getProfile } from "@/services/profile.service";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNavigation } from "@/components/layout/bottom-navigation";
import { NavigationProgressProvider } from "@/components/providers/navigation-progress";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  // Covers every path into the app, not just the signup->session-established happy path
  // (e.g. logging in later after confirming email) — see profiles.onboarding_completed.
  const profile = await getProfile();
  if (!profile.onboardingCompleted) {
    // Onboarding now starts at the wallet-balance step, not category picking (reordered
    // 2026-08-24) — see AI_CONTEXT.md "Onboarding — conta padrão".
    redirect("/onboarding/account");
  }

  return (
    <NavigationProgressProvider>
      <div className="flex min-h-svh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header userName={profile.name} userEmail={user.email ?? null} />
          <main className="flex-1 overflow-x-hidden p-4 pb-20 md:p-6 md:pb-6">{children}</main>
        </div>
        <BottomNavigation />
      </div>
    </NavigationProgressProvider>
  );
}
