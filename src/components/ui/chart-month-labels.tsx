"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePlotArea, useXAxisScale } from "recharts";
import { formatCurrency } from "@/lib/utils/currency";

/** "set/2026" (formatMonthLabel) → "set/26" — shared tick/label compaction for monthly-evolution-style charts. */
export function compactMonth(label: string) {
  return label.replace(/\/(\d{2})(\d{2})$/, "/$2");
}

/** Full value without the "R$ " prefix, so it fits the small per-month label block; "—" for zero/negative. */
export function bareValue(v: number) {
  if (v <= 0) return "—";
  return formatCurrency(v).replace(/^R\$\s*/, "");
}

export type MonthLabelLine = { key: string; value: number; color: string };

/**
 * Value block drawn ABOVE the plot area (inside the chart's top margin), one stacked group of
 * lines per month, centered on that month's band — never overlaps a neighboring month because
 * each group lives in its own column. `fontSize` comes pre-computed from the available width
 * (see `useResponsiveLabelFont`).
 */
export function MonthLabelsOverlay<T>({
  data,
  monthKey,
  lines,
  fontSize,
}: {
  data: T[];
  monthKey: (d: T) => string;
  lines: (d: T) => MonthLabelLine[];
  fontSize: number;
}) {
  const xScale = useXAxisScale();
  const plot = usePlotArea();
  if (!xScale || !plot) return null;
  const lineGap = fontSize + 3;

  return (
    <g>
      {data.map((d) => {
        const month = monthKey(d);
        const cx = xScale(month, { position: "middle" });
        if (cx == null) return null;
        const ls = lines(d);
        const firstLineY = plot.y - (ls.length - 1) * lineGap - 11;
        return (
          <text key={month} x={cx} textAnchor="middle" fontSize={fontSize} fontWeight={600}>
            {ls.map((l, i) => (
              <tspan key={l.key} x={cx} y={i === 0 ? firstLineY : undefined} dy={i === 0 ? undefined : lineGap} fill={l.color}>
                {bareValue(l.value)}
              </tspan>
            ))}
          </text>
        );
      })}
    </g>
  );
}

/**
 * Font for the per-month label block, derived from the container width: shrinks on mobile
 * (floor ~7.5px), grows on desktop where there's room (ceiling 13px), via a `ResizeObserver` on
 * `wrapRef`'s element — so the widest formatted value always fits its month's column.
 */
export function useResponsiveLabelFont<T>(
  data: T[],
  values: (d: T) => number[],
  /** When the chart scrolls horizontally, its real width can exceed the container's visible width. */
  minChartWidth = 0
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState(9);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const plotWidth = Math.max(el.clientWidth, minChartWidth) - 52 /* eixo Y */ - 8 /* margem direita */;
      if (plotWidth <= 0 || data.length === 0) return;
      const bandWidth = plotWidth / data.length;
      const longest = Math.max(6, ...data.flatMap((d) => values(d).map((v) => bareValue(v).length)));
      const fitted = (bandWidth * 0.92) / (longest * 0.58);
      setFont(Math.max(7.5, Math.min(13, fitted)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // `values` reads fixed fields off `d`; re-measuring only on `data` changes (not every render,
    // since `values` is typically a fresh inline arrow) is intentional here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, minChartWidth]);

  return { wrapRef, font };
}

/**
 * Horizontal scroll for charts with many bars (reports): each bar gets at least `minBandWidth` px,
 * so past a point the chart is wider than the screen and scrolls instead of squeezing every bar
 * into an unreadable sliver. Starts scrolled to the end (the most recent bars). Without
 * `minBandWidth` it's a no-op and the chart just fits its container (the dashboard's behavior).
 */
export function useChartScroll(count: number, minBandWidth?: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const minWidth = minBandWidth ? count * minBandWidth + 60 : 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && minWidth) el.scrollLeft = el.scrollWidth;
  }, [count, minWidth]);
  return { scrollRef, minWidth, scrollClassName: minBandWidth ? "overflow-x-auto overscroll-x-contain" : undefined };
}
