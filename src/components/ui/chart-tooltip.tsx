/**
 * Shared Recharts tooltip styling. Every dashboard/debts chart used to inline its own
 * `contentStyle` with no explicit `color`, so the label/value text fell back to Recharts'
 * default (near-black) — unreadable against a dark-mode surface. Centralized here so every
 * chart gets a themed, readable tooltip instead of five copies of the same near-miss.
 */
export const chartTooltipStyle = {
  contentStyle: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-divider)",
    borderRadius: 0,
    fontSize: 12,
    color: "var(--color-text)",
  },
  labelStyle: { color: "var(--color-text)" },
  itemStyle: { color: "var(--color-text)" },
} as const;
