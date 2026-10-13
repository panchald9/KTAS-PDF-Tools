import { useEffect, useRef, useState } from 'react';
import { inspectWorkbook, type WorkbookInspection, type WorkbookPreviewCell } from '@workspace/api-client-react';
import { errorMessage } from '@/lib/util';

interface Props {
  file: { name: string; dataBase64: string };
  sheet?: string;
  onSheetChange: (name: string) => void;
}

function Cell({ cell }: { cell: WorkbookPreviewCell }) {
  return (
    <td className="min-w-36 max-w-64 border px-3 py-2 align-top">
      {cell.kind === 'formula' ? (
        <>
          <span className="block text-xs font-semibold text-primary">Formula text (not executed)</span>
          <span className="block whitespace-pre-wrap break-all font-mono">{cell.formula ?? 'Unavailable'}</span>
          <span className="mt-1 block text-xs font-semibold">Cached value (may be stale)</span>
          <span className="block whitespace-pre-wrap break-all">{cell.cachedValue ?? 'Unavailable (no stored cache)'}</span>
        </>
      ) : <span className="whitespace-pre-wrap break-all">{cell.value ?? '—'}</span>}
      {cell.truncated && <span className="block text-xs text-muted-foreground">Shortened for preview</span>}
    </td>
  );
}

export function WorkbookPreview({ file, sheet, onSheetChange }: Props) {
  // Deliberately not a query/mutation cache: document content lives only in this mounted workspace.
  const [data, setData] = useState<WorkbookInspection | null>(null);
  const [previewSheet, setPreviewSheet] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const load = async (name = previewSheet) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const next = await inspectWorkbook(
        { file, ...(name ? { sheet: name } : {}) },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setData(next);
      setPreviewSheet(next.previewSheet);
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const clear = () => {
    request.current?.abort();
    setData(null);
    setPreviewSheet('');
    setError('');
    setLoading(false);
    onSheetChange('');
  };

  return (
    <section className="min-w-0 rounded-2xl border border-card-border bg-card p-5" aria-labelledby="h-workbook">
      <h2 id="h-workbook" className="text-xl font-bold">Workbook preview &amp; worksheets</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Preview uploads {file.name} to private temporary server storage, deleted after each request.
        No document history is saved. This sample stays only in this workspace until cleared or you leave.
        Formulas and macros are never executed.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" disabled={loading} onClick={() => void load()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          data-testid="button-preview-workbook">
          {loading ? 'Reading workbook…' : data ? 'Refresh preview' : 'Upload & preview workbook'}
        </button>
        {(data || loading || error) && <button type="button" onClick={clear} className="text-sm underline">Clear preview &amp; sheet selection</button>}
      </div>
      {!data && sheet !== undefined && <p className="mt-3 text-sm text-muted-foreground">
        All worksheets will be processed by default. Preview the workbook to choose a specific worksheet without typing its name.
      </p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error} Use the preview button to retry.</p>}
      {data && (
        <div className="mt-4 min-w-0 space-y-4">
          {sheet !== undefined && (
            <label className="block text-sm font-semibold">
              Worksheets to process
              <select value={sheet} onChange={(e) => onSheetChange(e.target.value)}
                className="mt-1 block w-full rounded-lg border bg-background p-2" data-testid="select-process-sheet">
                <option value="">All worksheets</option>
                {data.sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.rows} rows × {s.columns} columns{s.state !== 'visible' ? `, ${s.state}` : ''})</option>)}
              </select>
            </label>
          )}
          {sheet === undefined && <p className="text-sm text-muted-foreground">This tool processes all worksheets. The picker below changes only the preview.</p>}
          <label className="block text-sm font-semibold">
            Worksheet to preview
            <select value={previewSheet} disabled={loading} onChange={(e) => { setPreviewSheet(e.target.value); void load(e.target.value); }}
              className="mt-1 block w-full rounded-lg border bg-background p-2" data-testid="select-preview-sheet">
              {data.sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.rows} rows × {s.columns} columns{s.state !== 'visible' ? `, ${s.state}` : ''})</option>)}
            </select>
          </label>
          {!loading && !error && (
            <>
              <p className="text-sm">
                Sample of <b>{data.previewSheet}</b>: first {data.rowLimit} rows (row 1 is the header candidate),
                up to {data.columnLimit} columns, {data.cellCharacterLimit} characters per value.
                {data.truncated && ' More content exists beyond this preview.'}
              </p>
              <div className="max-h-96 max-w-full overflow-auto rounded-lg border" tabIndex={0} aria-label="Scrollable worksheet sample">
                <table className="w-full text-left text-sm" data-testid="table-workbook-preview">
                  <caption className="sr-only">First rows of {data.previewSheet}, including the header candidate</caption>
                  <thead><tr><th className="border px-3 py-2">Row</th>{data.sampleRows[0]?.map((c) => <th key={c.coordinate} className="border px-3 py-2">{c.coordinate.replace(/\d+$/, '')}</th>)}</tr></thead>
                  <tbody>{data.sampleRows.map((row, i) => <tr key={i} className={i === 0 ? 'bg-primary/5' : ''}>
                    <th scope="row" className="border px-3 py-2">{i + 1}{i === 0 && <span className="block text-xs">Header candidate</span>}</th>
                    {row.map((c) => <Cell key={c.coordinate} cell={c} />)}
                  </tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          <ul className="space-y-1 text-xs text-muted-foreground">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </section>
  );
}