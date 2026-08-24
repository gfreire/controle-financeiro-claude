/**
 * Calendar-date helpers. Every date in this module is a plain "YYYY-MM-DD"
 * string handled in UTC internally so day-of-month math never shifts a day
 * because of the local timezone offset.
 */

const MONTH_LABELS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTH_LABELS_SHORT_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function toUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export function addMonthsToIsoDate(isoDate: string, months: number): string {
  const date = toUtcDate(isoDate);
  const day = date.getUTCDate();
  const targetMonthIndex = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, normalizedMonthIndex));
  return toIsoDate(new Date(Date.UTC(targetYear, normalizedMonthIndex, clampedDay)));
}

export function startOfMonth(isoDate: string): string {
  const date = toUtcDate(isoDate);
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

export function endOfMonth(isoDate: string): string {
  const date = toUtcDate(isoDate);
  const last = daysInMonth(date.getUTCFullYear(), date.getUTCMonth());
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), last)));
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // "YYYY-MM"
}

export function formatDate(isoDate: string): string {
  const date = toUtcDate(isoDate);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

export function formatMonthLabel(monthKeyOrDate: string, short = false): string {
  const [year, month] = monthKeyOrDate.slice(0, 7).split("-").map(Number);
  const labels = short ? MONTH_LABELS_SHORT_PT : MONTH_LABELS_PT;
  return `${labels[month - 1]}/${year}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/**
 * Days from `todayIsoDate` until `dueDay` (1-28) falls in the SAME calendar month as today —
 * negative when it already passed this month (overdue), 0 today, positive when still ahead.
 * Used to flag fixed expenses due soon/overdue on the dashboard, independent of the month a
 * filter might be viewing (this is always anchored to today, same convention as
 * CardSummaryDTO.usedThroughCurrentMonth/openInvoiceMonth).
 */
export function daysUntilDueThisMonth(dueDay: number, todayIsoDate: string): number {
  const today = toUtcDate(todayIsoDate);
  const due = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), dueDay));
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Central rule (see AI_CONTEXT.md "Credit Card Purchases"): analytics use
 * installment competence, never purchase_date. Two steps decide the
 * competence month, both driven by how closing_day and due_day relate to
 * each other — not just closing_day alone (fixed 2026-08-23, see AI_CONTEXT.md
 * "Competência quando due_day <= closing_day"):
 *
 * 1. Which billing cycle the purchase falls into: a purchase after
 *    closing_day rolls into the cycle that closes the FOLLOWING month
 *    (`pushedToNextMonth`).
 * 2. Which calendar month that cycle's invoice is actually due in: when
 *    due_day > closing_day, the due date falls in the same month the cycle
 *    closes (e.g. closes the 5th, due the 15th — a short, same-month gap).
 *    When due_day <= closing_day, the due date can only be chronologically
 *    after closing by falling in the NEXT month (e.g. closes the 28th, due
 *    the 10th — necessarily the 10th of the following month, not the same
 *    month's 10th, which would be BEFORE the close). `dueMonthOffset`
 *    captures this second shift, which the closing-day-only version of this
 *    function used to miss entirely.
 */
export function calculateInstallmentCompetences(
  purchaseDate: string,
  closingDay: number,
  dueDay: number,
  installmentsCount: number
): string[] {
  const purchase = toUtcDate(purchaseDate);
  const pushedToNextMonth = purchase.getUTCDate() > closingDay ? 1 : 0;
  const dueMonthOffset = dueDay <= closingDay ? 1 : 0;
  const anchor = new Date(Date.UTC(purchase.getUTCFullYear(), purchase.getUTCMonth() + pushedToNextMonth + dueMonthOffset, 1));
  return generateMonthlyCompetences(anchor, dueDay, installmentsCount);
}

/**
 * Same generation as `calculateInstallmentCompetences`, but anchored directly on a user-picked
 * "YYYY-MM" first-installment month instead of deriving it from purchase_date/closing_day — lets
 * the purchase form default to the current month and be overridden when the automatic guess is
 * wrong (e.g. the user isn't sure of the exact closing date).
 */
export function calculateInstallmentCompetencesFromAnchorMonth(
  anchorMonth: string,
  dueDay: number,
  installmentsCount: number
): string[] {
  const [year, month] = anchorMonth.slice(0, 7).split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, 1));
  return generateMonthlyCompetences(anchor, dueDay, installmentsCount);
}

function generateMonthlyCompetences(anchor: Date, dueDay: number, installmentsCount: number): string[] {
  return Array.from({ length: installmentsCount }, (_, index) => {
    const targetMonthIndex = anchor.getUTCMonth() + index;
    const targetYear = anchor.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const day = Math.min(dueDay, daysInMonth(targetYear, normalizedMonthIndex));
    return toIsoDate(new Date(Date.UTC(targetYear, normalizedMonthIndex, day)));
  });
}

export type DashboardPeriodPreset = "month" | "last3" | "last6" | "last12" | "year" | "custom";

export function resolvePeriodPreset(
  preset: DashboardPeriodPreset,
  referenceIso: string = todayIso()
): { periodStart: string; periodEnd: string } {
  const monthStart = startOfMonth(referenceIso);
  switch (preset) {
    case "month":
      return { periodStart: monthStart, periodEnd: endOfMonth(referenceIso) };
    case "last3":
      return { periodStart: startOfMonth(addMonthsToIsoDate(monthStart, -2)), periodEnd: endOfMonth(referenceIso) };
    case "last6":
      return { periodStart: startOfMonth(addMonthsToIsoDate(monthStart, -5)), periodEnd: endOfMonth(referenceIso) };
    case "last12":
      return { periodStart: startOfMonth(addMonthsToIsoDate(monthStart, -11)), periodEnd: endOfMonth(referenceIso) };
    case "year": {
      const year = Number(referenceIso.slice(0, 4));
      return { periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` };
    }
    default:
      return { periodStart: monthStart, periodEnd: endOfMonth(referenceIso) };
  }
}
