"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils/cn";
import { CornerMarks } from "./corner-marks";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// When the mobile software keyboard opens, a vertically-centered dialog can end up behind it.
// iOS Safari never shrinks the layout viewport (so `inset-0` / `dvh` / `interactive-widget`
// don't help) — only `window.visualViewport` reflects the space the keyboard took. We watch
// it and, while a keyboard-sized inset exists, pad the overlay's bottom (so `place-items-center`
// re-centers into what's visible) and cap the dialog's height to that visible band.
function useKeyboardAwareViewport(
  overlayRef: React.RefObject<HTMLDivElement | null>,
  contentRef: React.RefObject<HTMLDivElement | null>
) {
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const apply = () => {
      const overlay = overlayRef.current;
      const content = contentRef.current;
      // Height of whatever is covering the bottom of the layout viewport (the keyboard).
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const keyboardOpen = inset > 80;
      if (overlay) overlay.style.paddingBottom = keyboardOpen ? `${inset + 16}px` : "";
      if (content) content.style.maxHeight = keyboardOpen ? `${vv.height - 32}px` : "";
    };

    const overlayAtMount = overlayRef.current;
    const contentAtMount = contentRef.current;
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      if (overlayAtMount) overlayAtMount.style.paddingBottom = "";
      if (contentAtMount) contentAtMount.style.maxHeight = "";
    };
  }, [overlayRef, contentRef]);
}

// Once the keyboard has animated in, pull the focused field to the middle of the space that's
// left (helps long forms that scroll internally). Guarded to coarse pointers — desktop untouched.
function scrollFocusedFieldIntoView(e: React.FocusEvent<HTMLDivElement>) {
  if (typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches) return;
  const target = e.target as HTMLElement | null;
  if (!target?.matches("input, textarea, select, [contenteditable='true']")) return;
  window.setTimeout(() => {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 300);
}

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  useKeyboardAwareViewport(overlayRef, contentRef);

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        ref={overlayRef}
        className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-neutral-900/50 p-4 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out"
      >
        <DialogPrimitive.Content
          ref={contentRef}
          className={cn(
            "relative my-8 flex w-full max-w-[440px] max-h-[calc(100dvh-4rem)] flex-col border border-divider bg-surface shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95",
            className
          )}
          {...props}
        >
          <CornerMarks />
          {/* Scroll isolated to this inner wrapper, never the Content box above — CornerMarks'
              own corner-tl/tr/bl/br decorations sit at negative offsets (see globals.css), and a
              scrollable ancestor counts that bleed as real overflow, producing phantom
              horizontal+vertical scrollbars on every dialog even when content fits. */}
          <div className="flex flex-col gap-3 overflow-y-auto p-4" onFocus={scrollFocusedFieldIntoView}>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-heading text-xl font-semibold", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm opacity-85", className)} {...props} />;
}

export function DialogActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-2 flex justify-end gap-2", className)} {...props} />;
}
