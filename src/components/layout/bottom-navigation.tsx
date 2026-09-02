"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav-items";
import { MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function BottomNavigation() {
  const pathname = usePathname();
  const items = [...PRIMARY_NAV];
  const [moreOpen, setMoreOpen] = useState(false);

  // Client-side navigation doesn't unmount the popover, so close it whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-divider bg-bg standalone:pb-2 md:hidden">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-accent" : "text-text/60")}
          >
            <Icon className="size-5" strokeWidth={1.5} />
            {item.label}
          </Link>
        );
      })}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-text/60">
          <MoreHorizontal className="size-5" strokeWidth={1.5} />
          Mais
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="mb-2 flex w-44 flex-col gap-0.5">
          {SECONDARY_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-2.5 px-2 py-2 text-sm hover:bg-text/[0.06]"
              >
                <Icon className="size-4" strokeWidth={1.5} />
                {item.label}
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>
    </nav>
  );
}
