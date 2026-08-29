"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";

type CategoryOption = { id: string; icon: string | null; name: string };

/**
 * Generic additive/multi-select category checkbox popover, shared by the dashboard's global
 * category filter and the Cards page's local evolution-chart category filter — same interaction
 * (check one to isolate it, check another to add it, uncheck to drop it), different backing
 * state/URL param per caller.
 */
export function CategoryCheckboxFilter({
  groups,
  activeIds,
  onToggle,
  onToggleGroup,
  onClear,
  placeholder = "Todas as categorias",
  triggerClassName = "w-44",
}: {
  groups: { label: string; items: CategoryOption[] }[];
  activeIds: string[];
  onToggle: (id: string) => void;
  /** When provided, each group label gets a select-all checkbox (checked / indeterminate / off). */
  onToggleGroup?: (ids: string[], nextChecked: boolean) => void;
  onClear: () => void;
  placeholder?: string;
  triggerClassName?: string;
}) {
  const label = activeIds.length === 0 ? placeholder : activeIds.length === 1 ? "1 categoria" : `${activeIds.length} categorias`;

  return (
    <Popover>
      <PopoverTrigger
        className={`flex h-9 items-center justify-between border border-divider bg-surface px-2.5 text-sm hover:border-text/45 data-[state=open]:border-accent ${triggerClassName}`}
      >
        <span className={activeIds.length === 0 ? "text-text/40" : ""}>{label}</span>
        <ChevronDown className="size-4 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="max-h-72 overflow-y-auto p-2">
          {activeIds.length > 0 && (
            <button type="button" onClick={onClear} className="mb-1 w-full p-1 text-left text-xs text-accent hover:underline">
              Limpar seleção
            </button>
          )}
          {groups.map((group) => {
            const groupIds = group.items.map((c) => c.id);
            const selectedInGroup = groupIds.filter((id) => activeIds.includes(id)).length;
            const groupState: boolean | "indeterminate" =
              selectedInGroup === 0 ? false : selectedInGroup === groupIds.length ? true : "indeterminate";
            return (
            <div key={group.label}>
              {groups.length > 1 &&
                (onToggleGroup && groupIds.length > 0 ? (
                  <label className="flex cursor-pointer items-center gap-2 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide opacity-60 hover:bg-text/[0.04]">
                    <Checkbox checked={groupState} onCheckedChange={() => onToggleGroup(groupIds, groupState !== true)} />
                    <span>{group.label}</span>
                  </label>
                ) : (
                  <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide opacity-50">{group.label}</p>
                ))}
              {group.items.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 px-1 py-1.5 text-sm hover:bg-text/[0.04]">
                  <Checkbox checked={activeIds.includes(c.id)} onCheckedChange={() => onToggle(c.id)} />
                  <span className="flex-1 truncate">{c.icon} {c.name}</span>
                </label>
              ))}
            </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
