---
name: Spreadsheet integrity and safety
description: Formula handling and safe refusal policy for local Excel operations.
---
Preserve formula expressions, never evaluate them, and distinguish them from stored cached results. Saving through openpyxl clears formula caches; exports must disclose missing or potentially stale caches.

**Why:** The Excel expansion explicitly requires formula integrity, no macro execution, and protection from formula injection in untrusted plain text.

**How to apply:** Import CSV fields as literal text and protect formula-like strings in CSV exports. Prefer a clear unsupported-workbook error over silently breaking dependencies or dropping advanced structures. Row deletion must not proceed when formula dependencies cannot be updated reliably; workbook splitting must not silently strand cross-sheet references. Never claim temporary server processing happens in the browser.

Bound merged-range expansion before calling a workbook loader, not only the stored-cell count or the loaded sheet dimensions.

**Why:** openpyxl materializes every merged-cell position while loading. A tiny compressed package can therefore force huge allocations before post-load dimension checks run.

**How to apply:** Preflight finite merged-range coordinates and their cumulative area, including overlapping ranges, against the cell budget. Regression tests must prove hostile ranges never reach the loader.

Follow package relationships when determining which parts a loader consumes, or strictly reject targets outside validated canonical locations.

**Why:** XLSX worksheets and even the workbook can live in nonstandard ZIP locations through manifest and relationship targets. Scanning only conventional folders leaves otherwise valid relocated parts outside safety checks.

**How to apply:** Ensure every worksheet the loader can reach was budgeted before loading, including aggregate costs across input workbooks. Test relocated sheets and workbook manifest redirection, not only standard openpyxl-generated files.