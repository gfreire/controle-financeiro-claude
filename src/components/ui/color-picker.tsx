"use client";

import { cn } from "@/lib/utils/cn";

export const CATEGORY_COLORS = [
  "#5980a6", "#4a7a5c", "#9a4f37", "#a87e2e", "#728fab", "#7a3d2b",
  "#6b5b95", "#b0413e", "#3f7d6b", "#c97a3d", "#4f6d7a", "#8a6d3b",
];

export function ColorPicker({ value, onChange, size = "size-6" }: { value: string; onChange: (color: string) => void; size?: string }) {
  const isCustom = !CATEGORY_COLORS.includes(value);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(size, value === c && "ring-2 ring-offset-2 ring-offset-bg ring-accent")}
          style={{ background: c }}
          aria-label={`Cor ${c}`}
          aria-pressed={value === c}
        />
      ))}
      <label
        className={cn(
          size,
          "relative cursor-pointer overflow-hidden border border-divider",
          isCustom && "ring-2 ring-offset-2 ring-offset-bg ring-accent"
        )}
        style={{ background: isCustom ? value : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
        title="Escolher outra cor"
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Escolher cor personalizada"
        />
      </label>
    </div>
  );
}
