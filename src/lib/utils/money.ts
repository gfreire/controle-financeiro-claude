/**
 * Money arithmetic for numeric(14,2) values. Every operation routes through
 * integer cents internally so repeated add/subtract never drifts from
 * floating-point error.
 */

const CENTS_FACTOR = 100;

function toCents(value: number): number {
  return Math.round(value * CENTS_FACTOR);
}

function fromCents(cents: number): number {
  return Math.round(cents) / CENTS_FACTOR;
}

export function addMoney(a: number, b: number): number {
  return fromCents(toCents(a) + toCents(b));
}

export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

export function sumMoney(values: number[]): number {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0));
}

export function roundMoney(value: number): number {
  return fromCents(toCents(value));
}

/**
 * Splits `total` into `count` installments. Division remainder (from
 * integer-cent division) always goes to the first installment, so the sum
 * of the returned array exactly equals `total` — never distributed evenly
 * and never dropped/added elsewhere. E.g. 100 / 3 => [33.34, 33.33, 33.33].
 */
export function splitInstallments(total: number, count: number): number[] {
  if (count <= 0) {
    throw new Error("installment count must be positive");
  }
  const totalCents = toCents(total);
  const baseCents = Math.floor(totalCents / count);
  const remainderCents = totalCents - baseCents * count;

  return Array.from({ length: count }, (_, index) =>
    fromCents(index === 0 ? baseCents + remainderCents : baseCents)
  );
}

/**
 * Gross/percentage/net split for reservoir accrual entries.
 * amount (net) = grossAmount * (percentage / 100).
 * Recalculates whichever of `percentage`/`amount` was NOT just edited,
 * given `grossAmount` is present. `grossAmount` itself is never derived.
 */
export function calculateGrossNetSplit(
  values: { grossAmount?: number; percentage?: number; netAmount?: number },
  lastEdited: "percentage" | "netAmount"
): { grossAmount?: number; percentage?: number; netAmount?: number } {
  const { grossAmount } = values;
  if (grossAmount === undefined || grossAmount === null) {
    return values;
  }

  if (lastEdited === "percentage") {
    if (values.percentage === undefined || values.percentage === null) {
      return values;
    }
    const netAmount = roundMoney(grossAmount * (values.percentage / 100));
    return { ...values, netAmount };
  }

  if (values.netAmount === undefined || values.netAmount === null || grossAmount === 0) {
    return values;
  }
  const percentage = Math.round((values.netAmount / grossAmount) * 10000) / 100;
  return { ...values, percentage };
}
