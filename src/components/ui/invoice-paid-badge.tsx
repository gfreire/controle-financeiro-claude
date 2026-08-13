import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { subtractMoney } from "@/lib/utils/money";

// Shared by /cards and /accounts (AccountCard) so a given invoice's paid/partial status
// never renders differently between the two screens — same convention as their identical
// totalCommitted/creditLimit usage block.
export function InvoicePaidBadge({ invoiceAmount, paidAmount }: { invoiceAmount: number; paidAmount: number }) {
  if (invoiceAmount <= 0 || paidAmount <= 0) return null;
  const remaining = subtractMoney(invoiceAmount, paidAmount);

  if (remaining <= 0) {
    return (
      <Badge variant="success">
        <Check className="size-3" strokeWidth={2} /> Paga
      </Badge>
    );
  }

  return (
    <Badge variant="warning">
      {formatCurrency(paidAmount)} pago · faltam {formatCurrency(remaining)}
    </Badge>
  );
}
