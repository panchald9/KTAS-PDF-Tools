import * as XLSX from "xlsx";
import AdmZip from "adm-zip";
import type { DocumentFileInput } from "../../shared/types";
import type { EngineResult } from "./pdf-engine";

export async function inspectWorkbook(file: DocumentFileInput, requestedSheet?: string) {
  const buffer = Buffer.from(file.dataBase64, "base64");
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: true });
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) throw new Error("The workbook contains no sheets.");

  const previewSheetName = requestedSheet && sheetNames.includes(requestedSheet)
    ? requestedSheet
    : sheetNames[0];

  const sheets = sheetNames.slice(0, 100).map((name) => {
    const ws = workbook.Sheets[name];
    const range = ws && ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    return {
      name,
      rows: range.e.r - range.s.r + 1,
      columns: range.e.c - range.s.c + 1,
      state: "visible" as const,
    };
  });

  const ws = workbook.Sheets[previewSheetName];
  const sampleRows: Array<Array<{
    coordinate: string;
    kind: "value" | "formula";
    value: string | null;
    formula: string | null;
    cachedValue: string | null;
    truncated: boolean;
  }>> = [];

  const rowLimit = 10;
  const colLimit = 12;

  if (ws && ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const maxR = Math.min(range.e.r, range.s.r + rowLimit - 1);
    const maxC = Math.min(range.e.c, range.s.c + colLimit - 1);

    for (let r = range.s.r; r <= maxR; r++) {
      const rowCells = [];
      for (let c = range.s.c; c <= maxC; c++) {
        const coord = XLSX.utils.encode_cell({ r, c });
        const cell = ws[coord];
        if (!cell) {
          rowCells.push({
            coordinate: coord,
            kind: "value" as const,
            value: null,
            formula: null,
            cachedValue: null,
            truncated: false,
          });
        } else {
          const isFormula = Boolean(cell.f);
          const valStr = cell.v !== undefined && cell.v !== null ? String(cell.v) : null;
          rowCells.push({
            coordinate: coord,
            kind: isFormula ? ("formula" as const) : ("value" as const),
            value: isFormula ? null : valStr,
            formula: cell.f || null,
            cachedValue: isFormula ? valStr : null,
            truncated: false,
          });
        }
      }
      sampleRows.push(rowCells);
    }
  }

  return {
    sheets,
    previewSheet: previewSheetName,
    sampleRows,
    rowLimit,
    columnLimit: colLimit,
    cellCharacterLimit: 500,
    truncated: false,
    warnings: [],
  };
}

export async function processExcelTool(
  slug: string,
  files: DocumentFileInput[],
  options: Record<string, string>
): Promise<EngineResult> {
  const originalBytes = files.reduce((acc, f) => acc + Buffer.from(f.dataBase64, "base64").length, 0);
  const firstBuffer = Buffer.from(files[0].dataBase64, "base64");
  const warnings: string[] = [];
  let message = "Your workbook has been processed.";
  let outData: Buffer;
  let outExtension = ".xlsx";
  let outMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (slug === "csv-to-excel") {
    const csvContent = firstBuffer.toString("utf8");
    const wb = XLSX.read(csvContent, { type: "string" });
    const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    outData = Buffer.from(outBuf);
  } else if (slug === "merge-excel") {
    if (files.length < 2) throw new Error("Upload at least two workbooks to merge.");
    const mergedWb = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const buf = Buffer.from(files[fIdx].dataBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      for (const sheetName of wb.SheetNames) {
        let uniqueName = sheetName;
        let counter = 2;
        while (usedNames.has(uniqueName)) {
          uniqueName = `${sheetName}_${counter++}`.slice(0, 31);
        }
        usedNames.add(uniqueName);
        XLSX.utils.book_append_sheet(mergedWb, wb.Sheets[sheetName], uniqueName);
      }
    }
    const outBuf = XLSX.write(mergedWb, { type: "buffer", bookType: "xlsx" });
    outData = Buffer.from(outBuf);
  } else {
    const wb = XLSX.read(firstBuffer, { type: "buffer" });
    const sheetNames = wb.SheetNames;
    const targetSheetName = options.sheet && sheetNames.includes(options.sheet) ? options.sheet : sheetNames[0];

    if (slug === "excel-to-csv") {
      const ws = wb.Sheets[targetSheetName];
      const csvStr = XLSX.utils.sheet_to_csv(ws, { FS: options.delimiter === "semicolon" ? ";" : options.delimiter === "tab" ? "\t" : "," });
      outData = Buffer.from(csvStr, "utf8");
      outExtension = ".csv";
      outMime = "text/csv";
    } else if (slug === "split-excel") {
      const zip = new AdmZip();
      for (const name of sheetNames) {
        const singleWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(singleWb, wb.Sheets[name], name);
        const singleBuf = XLSX.write(singleWb, { type: "buffer", bookType: "xlsx" });
        zip.addFile(`${name}.xlsx`, Buffer.from(singleBuf));
      }
      outData = zip.toBuffer();
      outExtension = ".zip";
      outMime = "application/zip";
      message = "Worksheets extracted into individual workbooks.";
    } else if (slug === "excel-to-json") {
      const ws = wb.Sheets[targetSheetName];
      const jsonData = XLSX.utils.sheet_to_json(ws);
      outData = Buffer.from(JSON.stringify(jsonData, null, 2), "utf8");
      outExtension = ".json";
      outMime = "application/json";
    } else if (slug === "excel-statistics") {
      const stats = {
        sheetCount: sheetNames.length,
        sheets: sheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
          return {
            name,
            rows: range ? range.e.r - range.s.r + 1 : 0,
            columns: range ? range.e.c - range.s.c + 1 : 0,
          };
        }),
      };
      outData = Buffer.from(JSON.stringify(stats, null, 2), "utf8");
      outExtension = ".json";
      outMime = "application/json";
    } else if (slug === "remove-excel-duplicates") {
      const ws = wb.Sheets[targetSheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const seen = new Set<string>();
      const hasHeader = options.header !== "no";
      const headerRow = hasHeader && rows.length ? rows[0] : null;
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const filteredRows: any[][] = [];

      for (const row of dataRows) {
        const key = JSON.stringify(row);
        if (!seen.has(key)) {
          seen.add(key);
          filteredRows.push(row);
        }
      }

      const newRows = headerRow ? [headerRow, ...filteredRows] : filteredRows;
      const newWs = XLSX.utils.aoa_to_sheet(newRows);
      wb.Sheets[targetSheetName] = newWs;
      const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      outData = Buffer.from(outBuf);
      message = `Removed ${dataRows.length - filteredRows.length} duplicate rows.`;
    } else if (slug === "remove-excel-empty-rows") {
      const ws = wb.Sheets[targetSheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const filtered = rows.filter((r) => r.some((c) => c !== undefined && c !== null && String(c).trim() !== ""));
      const newWs = XLSX.utils.aoa_to_sheet(filtered);
      wb.Sheets[targetSheetName] = newWs;
      const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      outData = Buffer.from(outBuf);
      message = `Removed ${rows.length - filtered.length} empty rows.`;
    } else if (slug === "trim-excel-text") {
      const ws = wb.Sheets[targetSheetName];
      if (ws["!ref"]) {
        const range = XLSX.utils.decode_range(ws["!ref"]);
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const coord = XLSX.utils.encode_cell({ r, c });
            const cell = ws[coord];
            if (cell && typeof cell.v === "string") {
              cell.v = cell.v.trim();
              if (cell.w) cell.w = cell.w.trim();
            }
          }
        }
      }
      const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      outData = Buffer.from(outBuf);
      message = "Trimmed cell strings.";
    } else {
      const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      outData = Buffer.from(outBuf);
    }
  }

  const baseName = files[0].name.replace(/\.[^/.]+$/, "");
  const outputFileName = `${baseName}-processed${outExtension}`;

  return {
    files: [
      {
        name: outputFileName,
        mimeType: outMime,
        dataBase64: outData.toString("base64"),
        bytes: outData.length,
      },
    ],
    message,
    warnings,
    originalBytes,
    outputBytes: outData.length,
    pageCount: 1,
    text: "",
  };
}
