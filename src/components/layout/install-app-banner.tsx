"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type WindowWithPrompt = Window & { __installPrompt?: BeforeInstallPromptEvent };

function isSuppressed() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return true;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) return true;
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return true;
  } catch {
    /* localStorage blocked — not suppressed on that basis */
  }
  return false;
}

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ masquerades as "Macintosh"; the touch-point count gives it away.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * In-app "Instalar app" affordance shown just under the header.
 * - Chrome (Android/desktop): captures `beforeinstallprompt` and offers a one-tap install.
 * - iOS Safari (no such event): shows the manual "Compartilhar → Adicionar à Tela de Início" steps.
 * - Never shown when already installed, previously dismissed, or on localhost.
 */
export function InstallAppBanner() {
  // The event can fire before React hydrates — the inline script in the root layout stashes it.
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window === "undefined" ? null : (window as WindowWithPrompt).__installPrompt ?? null,
  );
  const [iosHint, setIosHint] = useState(() => !isSuppressed() && detectIOS());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isSuppressed()) return;
    const w = window as WindowWithPrompt;

    const adopt = () => setDeferred(w.__installPrompt ?? null);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      w.__installPrompt = e as BeforeInstallPromptEvent;
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      w.__installPrompt = undefined;
      setDeferred(null);
      setDismissed(true);
    };

    window.addEventListener("installpromptready", adopt);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("installpromptready", adopt);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (dismissed || (!deferred && !iosHint)) return null;

  const persistDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const dismiss = () => {
    setDismissed(true);
    setIosHint(false);
    persistDismiss();
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    (window as WindowWithPrompt).__installPrompt = undefined;
    setDeferred(null);
    setDismissed(true);
    if (outcome !== "accepted") persistDismiss();
  };

  return (
    <div className="border-b border-divider bg-accent-100 px-4 py-2.5 text-sm md:px-6">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 size-4 shrink-0 text-accent-700" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          {deferred ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span>Instale o app na tela inicial para abrir sem o navegador.</span>
              <button
                type="button"
                onClick={install}
                className="font-heading font-semibold text-accent-700 underline underline-offset-2 hover:text-accent-800"
              >
                Instalar app
              </button>
            </div>
          ) : (
            <p className="leading-snug">
              Para instalar no iPhone: toque em{" "}
              <Share className="inline size-3.5 -translate-y-px" strokeWidth={1.5} /> Compartilhar
              {" "}na barra do Safari e escolha{" "}
              <strong>&ldquo;Adicionar à Tela de Início&rdquo;</strong>.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar"
          className="-m-1 shrink-0 p-1 text-text/50 hover:text-text"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
