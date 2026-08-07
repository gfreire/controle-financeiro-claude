"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { ALL_NAV } from "./nav-items";
import { Wallet2 } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-6 border-r border-divider p-4 md:flex">
      <div className="flex items-center gap-2 px-1">
        <Wallet2 className="size-5 text-accent" strokeWidth={1.5} />
        <span className="font-heading text-lg font-semibold">Finanças</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {ALL_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 text-sm transition-colors",
                active ? "bg-accent text-bg" : "text-text hover:bg-text/[0.06]"
              )}
            >
              <Icon className="size-4" strokeWidth={1.5} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
