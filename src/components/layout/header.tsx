import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

export function Header({ userEmail }: { userEmail: string | null }) {
  return (
    <header className="flex items-center justify-between border-b border-divider px-4 py-3 md:px-6">
      <div className="font-heading text-base font-semibold md:hidden">Finanças</div>
      <div className="hidden text-sm opacity-70 md:block">{userEmail}</div>
      <form action={signOut}>
        <button type="submit" className="flex items-center gap-1.5 text-xs text-text/60 hover:text-accent">
          <LogOut className="size-3.5" strokeWidth={1.5} />
          Sair
        </button>
      </form>
    </header>
  );
}
