import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, ArrowLeftRight, Wallet, CreditCard, Vault, HandCoins, FileWarning, CalendarClock, PiggyBank, Settings } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Bottom nav (mobile): Dashboard, Transactions, Accounts, Cards, More. Sidebar (desktop) adds Receita Programada, Debts, Budgets, Settings. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Movimentações", icon: ArrowLeftRight },
  { href: "/accounts", label: "Contas", icon: Wallet },
  { href: "/cards", label: "Cartões", icon: CreditCard },
];

// "Receita Programada" is the display name for the `reservoirs` feature (route/table/DTO names
// unchanged by design, see AI_CONTEXT.md "Reservoir"). Renamed 2026-08-07: "Reservatórios" with a
// water-droplet icon didn't read as what the feature actually is — expected/pending income you
// track before it's real money. `Vault` (cofre) matches the feature's own internal nickname
// ("Cofre" in AI_CONTEXT.md) without duplicating PiggyBank (Orçamentos) or HandCoins (Dívidas).
// "Dívidas" was one screen holding all three `debts.kind` values. Split into three dedicated
// screens 2026-08-29 (at the user's request — "só separar forms e menus para ser mais intuitivo"):
// PERSONAL stays on /debts (renamed "Dívidas Pessoais"), OVERDUE_BILL → /overdue-bills, and
// INSTALLMENT_PLAN → /installment-plans. Every domain rule is unchanged — this is presentation
// only (see AI_CONTEXT.md "Dívidas — subtipos" → "Telas separadas").
export const SECONDARY_NAV: NavItem[] = [
  { href: "/reservoirs", label: "Receita Programada", icon: Vault },
  { href: "/debts", label: "Dívidas Pessoais", icon: HandCoins },
  { href: "/overdue-bills", label: "Contas em Atraso", icon: FileWarning },
  { href: "/installment-plans", label: "Parcelamento Programado", icon: CalendarClock },
  { href: "/budgets", label: "Orçamentos", icon: PiggyBank },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];
