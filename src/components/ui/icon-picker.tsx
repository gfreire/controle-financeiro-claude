"use client";

import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { CATEGORY_ICONS } from "./icon-set";
import { cn } from "@/lib/utils/cn";

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className="flex h-9 w-14 shrink-0 items-center justify-center border border-divider bg-surface text-lg hover:border-text/45 focus-visible:border-accent focus-visible:outline-none"
      >
        {value}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="grid grid-cols-8 gap-1">
          {CATEGORY_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => onChange(icon)}
              className={cn("flex size-7 items-center justify-center text-base hover:bg-accent/10", value === icon && "bg-accent/20")}
              aria-label={`Ícone ${icon}`}
              aria-pressed={value === icon}
            >
              {icon}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
