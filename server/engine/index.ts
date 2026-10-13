import { inspectPdf, processPdfTool, type EngineResult } from "./pdf-engine";
import { inspectWorkbook, processExcelTool } from "./excel-engine";
import { processWordTool } from "./word-engine";
import type { DocumentFileInput } from "../../shared/types";
import { excelTools } from "../../shared/catalogs/excel-tool-catalog";
import { wordTools } from "../../shared/catalogs/word-tool-catalog";

const excelSlugs = new Set(excelTools.map((t) => t.slug));
const wordSlugs = new Set(wordTools.map((t) => t.slug));

export class ProcessingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export { inspectPdf, inspectWorkbook };

export async function runWorker(
  slug: string,
  files: DocumentFileInput[],
  options: Record<string, string>,
  _accept?: string
): Promise<EngineResult | unknown> {
  try {
    if (slug === "inspect") {
      return await inspectPdf(files[0], options.password || "");
    }
    if (slug === "inspect-workbook") {
      return await inspectWorkbook(files[0], options.sheet || "");
    }
    if (excelSlugs.has(slug)) {
      return await processExcelTool(slug, files, options);
    }
    if (wordSlugs.has(slug)) {
      return await processWordTool(slug, files, options);
    }
    return await processPdfTool(slug, files, options);
  } catch (error: any) {
    const message = error?.message || "An unexpected processing error occurred.";
    throw new ProcessingError(message, 400);
  }
}
