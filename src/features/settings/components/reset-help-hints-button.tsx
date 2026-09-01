"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { resetHelpHints } from "@/components/ui/help-hint";
import { Lightbulb, Check } from "lucide-react";

/**
 * Clears every `help-seen:*` flag so the per-chart / per-field "?" hints auto-open again on the
 * first visit to each screen — see `src/components/ui/help-hint.tsx`.
 */
export function ResetHelpHintsButton() {
  const [done, setDone] = useState(false);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        resetHelpHints();
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }}
    >
      {done ? (
        <>
          <Check className="size-3.5" strokeWidth={1.5} /> Dicas reativadas
        </>
      ) : (
        <>
          <Lightbulb className="size-3.5" strokeWidth={1.5} /> Rever dicas das telas
        </>
      )}
    </Button>
  );
}
