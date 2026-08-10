import { Card } from "./card";

/**
 * Rendered as a route segment's loading.tsx — Next.js swaps this in automatically while a
 * navigation (including a searchParams-only filter change) re-fetches that segment's Server
 * Component. `fixed inset-0` deliberately escapes the (app) layout's <main> so it covers the
 * sidebar/header/bottom-nav too — a full-screen "the system is working" signal, not just a
 * content-area spinner, since prior to this there was no loading feedback at all.
 */
export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-[1px]">
      <Card className="flex-row items-center gap-3 bg-surface px-5 py-4" elevation="lg">
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
        <span className="font-heading text-sm font-medium tracking-wide">Carregando…</span>
      </Card>
    </div>
  );
}
