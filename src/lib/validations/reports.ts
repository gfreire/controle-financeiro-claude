import { z } from "zod";

export const REPORT_PERIOD_PRESETS = [
  "month",
  "lastMonth",
  "last3",
  "last6",
  "last12",
  "year",
  "lastYear",
  "all",
  "custom",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/** A saved report (migration 0042) — only the filter definition, never a figure. */
export const reportSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome ao relatório").max(80),
    periodPreset: z.enum(REPORT_PERIOD_PRESETS),
    periodStart: isoDate.optional().nullable(),
    periodEnd: isoDate.optional().nullable(),
    cardBasis: z.enum(["competence", "purchase"]),
    includeProjections: z.boolean(),
    categoryIds: z.array(z.string().uuid()),
    subcategoryIds: z.array(z.string().uuid()),
    accountIds: z.array(z.string().uuid()),
    descriptionSearch: z.string().trim().max(100).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.periodPreset !== "custom") return;
    if (!data.periodStart) ctx.addIssue({ code: "custom", path: ["periodStart"], message: "Informe a data inicial" });
    if (!data.periodEnd) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "Informe a data final" });
    if (data.periodStart && data.periodEnd && data.periodEnd < data.periodStart) {
      ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "A data final não pode ser antes da inicial" });
    }
  });
export type ReportInput = z.infer<typeof reportSchema>;
