"use server";

import { revalidatePath } from "next/cache";
import * as reportsService from "@/services/reports.service";
import { reportSchema, type ReportInput } from "@/lib/validations/reports";

export async function createReportAction(input: ReportInput): Promise<string> {
  const parsed = reportSchema.parse(input);
  const id = await reportsService.createReport(parsed);
  revalidatePath("/reports");
  return id;
}

export async function updateReportAction(id: string, input: ReportInput) {
  const parsed = reportSchema.parse(input);
  await reportsService.updateReport(id, parsed);
  revalidatePath("/reports");
  revalidatePath(`/reports/${id}`);
}

export async function deleteReportAction(id: string) {
  await reportsService.deleteReport(id);
  revalidatePath("/reports");
}
