"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

type NavigationProgressContextValue = {
  navigate: (url: string) => void;
  isPending: boolean;
};

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null);

/**
 * Next.js's own loading.tsx only shows up for a real segment change (switching pages) — a
 * searchParams-only navigation (filters, month pickers) re-renders the same page.tsx without
 * tripping that Suspense boundary, so those clicks gave zero visual feedback before this.
 * Wrapping router.push in useTransition and surfacing isPending here covers that gap: every
 * filter/nav component calls navigate() (from useNavigationProgress()) instead of router.push
 * directly, and the overlay renders for the duration of ANY pending navigation, segment change
 * or not.
 */
export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(url: string) {
    startTransition(() => {
      router.push(url);
    });
  }

  return (
    <NavigationProgressContext.Provider value={{ navigate, isPending }}>
      {children}
      {isPending && <LoadingOverlay />}
    </NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress() {
  const ctx = useContext(NavigationProgressContext);
  if (!ctx) throw new Error("useNavigationProgress must be used within NavigationProgressProvider");
  return ctx;
}
