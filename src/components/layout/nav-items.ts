import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, ArrowLeftRight, Wallet, CreditCard, Droplets, HandCoins, PiggyBank, Settings } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Bottom nav (mobile): Dashboard, Transactions, Accounts, Cards, More. Sidebar (desktop) adds Reservoirs, Debts, Budgets, Settings. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Lançamentos", icon: ArrowLeftRight },
  { href: "/accounts", label: "Contas", icon: Wallet },
  { href: "/cards", label: "Cartões", icon: CreditCard },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/reservoirs", label: "Reservatórios", icon: Droplets },
  { href: "/debts", label: "Dívidas", icon: HandCoins },
  { href: "/budgets", label: "Orçamentos", icon: PiggyBank },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];
