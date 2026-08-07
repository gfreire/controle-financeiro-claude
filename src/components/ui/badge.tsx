import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-[11px] tracking-wide", {
  variants: {
    variant: {
      accent: "bg-accent-100 text-accent-800",
      neutral: "bg-neutral-100 text-neutral-800",
      outline: "border border-accent text-accent",
      success: "bg-success-100 text-success-800",
      danger: "bg-danger-100 text-danger-800",
      warning: "bg-warning-100 text-warning-700",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
