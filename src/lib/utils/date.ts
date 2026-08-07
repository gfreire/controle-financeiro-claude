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
 * Central rule (see AI_CONTEXT.md "Credit Card Purchases"): analytics use
 * installment competence, never purchase_date. Competence month is decided
 * purely by closing_day (purchase day > closing_day pushes it to next
 * month's invoice); due_day only supplies the day-of-month, clamped to the
 * competence month's length. Each subsequent installment adds one month.
 */
export function calculateInstallmentCompetences(
  purchaseDate: string,
  closingDay: number,
  dueDay: number,
  installmentsCount: number
): string[] {
  const purchase = toUtcDate(purchaseDate);
  const pushedToNextMonth = purchase.getUTCDate() > closingDay ? 1 : 0;
  const anchor = new Date(Date.UTC(purchase.getUTCFullYear(), purchase.getUTCMonth() + pushedToNextMonth, 1));
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
