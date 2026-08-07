import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";
import { CornerMarks } from "./corner-marks";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-heading font-semibold text-sm leading-tight transition-colors disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-bg border border-accent hover:bg-accent-600 active:bg-accent-700",
        secondary: "bg-transparent text-text border border-divider hover:bg-text/[0.07] active:bg-text/[0.14]",
        ghost: "bg-transparent text-accent border border-transparent px-1 hover:bg-accent/10 active:bg-accent/[0.18]",
        danger: "bg-transparent text-danger-600 border border-danger-500 hover:bg-danger-100 active:bg-danger-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[13px]",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  frame?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, frame, children, ...props }, ref) => {
    // asChild renders via Radix Slot, which requires exactly one element child —
    // it must never receive the `showFrame && <CornerMarks />` sibling below, even
    // though that expression evaluates to `false` (still a second child in the array).
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    const showFrame = frame ?? variant === "primary";
    return (
      <button className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
        {showFrame && <CornerMarks />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
