import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { CornerMarks } from "./corner-marks";

export function Card({ className, frame = true, elevation, ...props }: React.HTMLAttributes<HTMLDivElement> & { frame?: boolean; elevation?: "sm" | "md" | "lg" }) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 border border-divider bg-transparent p-4",
        elevation === "sm" && "shadow-xs",
        elevation === "md" && "shadow-md",
        elevation === "lg" && "shadow-lg",
        className
      )}
      {...props}
    >
      {frame && <CornerMarks />}
      {props.children}
    </div>
  );
}

export function CardKicker({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-[10px] font-semibold uppercase tracking-[0.1em] text-accent", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-heading text-[17px] font-semibold leading-tight", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("m-0 flex-1 text-[13px] opacity-80", className)} {...props} />;
}

export function CardMeta({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-1.5 text-[11px] text-text/50", className)} {...props} />;
}
