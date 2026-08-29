"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Checkbox({ className, ...props }: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "group flex size-4 shrink-0 items-center justify-center border border-divider bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-bg">
        {/* Indicator mounts for both "checked" and "indeterminate" — swap the glyph by state. */}
        <Check className="size-3 group-data-[state=indeterminate]:hidden" />
        <Minus className="hidden size-3 group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
