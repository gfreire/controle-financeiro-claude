"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { CardTitle } from "./card";
import { cn } from "@/lib/utils/cn";

/**
 * Granular per-chart / per-field help, layered under the page-level `HelpButton` in the header:
 * that one answers "what is this screen"; a `HelpHint` answers "what does THIS chart/field mean".
 *
 * First-visit behaviour (`autoOpenOnce`): the hint pops open by itself the first time the user
 * lands on a screen that has one it hasn't seen, then marks itself seen forever (a remount /
 * router.refresh() never reopens it). `autoCloseMs` dismisses that auto-opened popover after a
 * few seconds so it never sits on top of an input the user is trying to type in — a popover the
 * user opened by tapping the "?" stays until they dismiss it.
 *
 * "Seen" lives in `localStorage` (`help-seen:<id>`); if storage is unavailable (private window,
 * blocked) every hint just behaves as already-seen — nothing auto-opens, the manual "?" still
 * works. `resetHelpHints()` (Configurações → "Rever dicas das telas") clears the lot.
 */

const SEEN_PREFIX = "help-seen:";

function isSeen(id: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + id) === "1";
  } catch {
    return true; // storage blocked → treat as seen so nothing auto-opens
  }
}

function markSeen(id: string) {
  try {
    window.localStorage.setItem(SEEN_PREFIX + id, "1");
  } catch {
    /* ignore — see isSeen */
  }
}

export function resetHelpHints() {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(SEEN_PREFIX)) toRemove.push(key);
    }
    toRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

/**
 * Coordinates "at most one hint auto-opens per screen visit" — the first unseen hint to mount
 * (i.e. the topmost one in the DOM) claims the slot; the rest wait for a future visit. Without
 * this, first-loading a screen with five chart hints would fire five popovers at once. Mounted
 * once in `(app)/layout.tsx`; a `HelpHint` rendered with no provider around it simply never
 * auto-opens (claim() returns false).
 */
type TourValue = { claim: (id: string) => boolean };
const TourContext = React.createContext<TourValue>({ claim: () => false });

export function HelpTourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const claimRef = React.useRef<{ path: string; id: string | null }>({ path: pathname, id: null });

  const claim = React.useCallback(
    (id: string) => {
      if (claimRef.current.path !== pathname) {
        claimRef.current = { path: pathname, id: null };
      }
      if (claimRef.current.id === null) {
        claimRef.current.id = id;
        return true;
      }
      return claimRef.current.id === id;
    },
    [pathname]
  );

  return <TourContext.Provider value={{ claim }}>{children}</TourContext.Provider>;
}

export function HelpHint({
  id,
  title,
  children,
  autoOpenOnce = false,
  autoCloseMs,
  variant = "chart",
  align = "start", // the "?" sits just after a left-aligned title, so the popover grows rightward
  className,
}: {
  /** Stable key for the "already seen" flag — e.g. "dashboard.expense-donut". */
  id: string;
  title?: string;
  children: React.ReactNode;
  autoOpenOnce?: boolean;
  /** Only arms when the popover was auto-opened. Defaults: 10s for charts, 7s for fields. */
  autoCloseMs?: number;
  variant?: "chart" | "field";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // `armed` = "opened by the first-visit auto-open, so it should also auto-close". Any user
  // interaction with the popover (`handleOpenChange`) clears it, so a hint the user opened by
  // hand stays until they dismiss it.
  const [armed, setArmed] = React.useState(false);
  const { claim } = React.useContext(TourContext);
  const decidedRef = React.useRef(false);

  // Decision effect (post-mount only): whether to auto-open depends on `localStorage` (unsafe in
  // SSR render — would also hydration-mismatch server "closed" vs client "open") and on the tour
  // `claim`, so it belongs in an effect. Runs its decision exactly once (`decidedRef`).
  React.useEffect(() => {
    if (!autoOpenOnce || decidedRef.current) return;
    decidedRef.current = true;
    // markSeen writes synchronously, so a second hint sharing this `id` (e.g. the two debt pies)
    // sees `isSeen` true in its own effect and won't also auto-open.
    if (isSeen(id) || !claim(id)) return;
    markSeen(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-mount decision, see comment above
    setOpen(true);
    setArmed(true);
  }, [autoOpenOnce, id, claim]);

  // Auto-close timer — separate effect so it re-arms cleanly (StrictMode double-invoke, re-renders)
  // instead of a single decision-effect cleanup permanently killing the only timer.
  React.useEffect(() => {
    if (!armed || !open) return;
    const delay = autoCloseMs ?? (variant === "field" ? 7000 : 10000);
    const timer = window.setTimeout(() => {
      setOpen(false);
      setArmed(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [armed, open, autoCloseMs, variant]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    setArmed(false); // user touched it → cancel the auto-close cycle
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full border border-divider text-text/50 hover:border-accent hover:text-accent",
            variant === "field" ? "size-4" : "size-6",
            className
          )}
          aria-label={title ? `Ajuda — ${title}` : "Ajuda"}
        >
          <HelpCircle className={variant === "field" ? "size-3" : "size-3.5"} strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72"
        align={align}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {title && <p className="mb-1.5 font-heading text-sm font-semibold">{title}</p>}
        <div className="flex flex-col gap-1.5 text-xs leading-relaxed opacity-80">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A `CardTitle` with a chart `HelpHint` right next to it — the standard header for every
 * chart/analytics card. The "?" sits immediately after the title text (not pushed to the far
 * edge) so it reads the same whether or not there's another control on that header row.
 */
export function CardTitleWithHelp({
  id,
  help,
  helpTitle,
  children,
  className,
}: {
  id: string;
  help: React.ReactNode;
  helpTitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <CardTitle>{children}</CardTitle>
      <HelpHint id={id} title={helpTitle} variant="chart" autoOpenOnce>
        {help}
      </HelpHint>
    </div>
  );
}
