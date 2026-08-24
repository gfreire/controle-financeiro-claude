"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";

/**
 * "?" button on every main page (AI_CONTEXT.md "Ajuda por tela") — a short, static explanation
 * of what that screen does and the one or two things worth knowing, nothing more. Deliberately
 * not a multi-step guided tour: the user asked for "o básico de cada tela," not a spotlight
 * overlay walking through every element.
 */
export function HelpButton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-divider text-text/50 hover:border-accent hover:text-accent"
          aria-label={`Ajuda — ${title}`}
        >
          <HelpCircle className="size-3.5" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <p className="mb-1.5 font-heading text-sm font-semibold">{title}</p>
        <div className="flex flex-col gap-1.5 text-xs leading-relaxed opacity-80">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
