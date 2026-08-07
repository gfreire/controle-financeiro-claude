export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function toPercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return clamp(Math.round((part / total) * 1000) / 10, 0, 100);
}

export function formatPercentage(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
