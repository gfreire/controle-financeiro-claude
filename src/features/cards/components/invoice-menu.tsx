"use client";

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Receipt, ChevronDown } from "lucide-react";
import { PaymentFormDialog } from "./payment-form-dialog";
import { InterestDialog } from "@/features/accounts/components/interest-dialog";
import type { AccountDTO } from "@/types/dto";

/**
 * The card's "Fatura ▾" menu — "Pagar fatura" + "Lançar juros". Client-only because each
 * `DropdownMenuItem` trigger carries an `onSelect` handler, which a Server Component can't
 * pass across the boundary (see the runtime error this was extracted to fix).
 */
export function InvoiceMenu({
  card,
  payerAccounts,
  statementBalance,
}: {
  card: AccountDTO;
  payerAccounts: AccountDTO[];
  statementBalance: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary"><Receipt className="size-3.5" strokeWidth={1.5} /> Fatura <ChevronDown className="size-3.5" strokeWidth={1.5} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <PaymentFormDialog
          card={card}
          payerAccounts={payerAccounts}
          statementBalance={statementBalance}
          trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Pagar fatura</DropdownMenuItem>}
        />
        <InterestDialog account={card} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Lançar juros</DropdownMenuItem>} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
