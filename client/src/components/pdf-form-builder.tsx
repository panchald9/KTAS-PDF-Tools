import { useEffect, useRef, useState } from 'react';
import type { DocumentInspection } from '@workspace/api-client-react';
import { Plus, Trash2, Copy } from 'lucide-react';

type FieldType = 'text' | 'checkbox' | 'dropdown';
interface Row {
  key: number;
  name: string;
  type: FieldType;
  page: string;
  x: string;
  y: string;
  width: string;
  height: string;
  value: string;
  required: boolean;
  choices: string;
}

const NUM_KEYS = ['page', 'x', 'y', 'width', 'height'] as const;
let seq = 0;

function blank(over: Partial<Row> = {}): Row {
  return { key: ++seq, name: '', type: 'text', page: '1', x: '50', y: '150', width: '220', height: '28', value: '', required: false, choices: '', ...over };
}

function parse(value: string): { rows: Row[]; error?: string } {
  if (!value.trim()) return { rows: [] };
  try {
    const p = JSON.parse(value);
    if (!Array.isArray(p)) return { rows: [], error: 'The field list must be a JSON array.' };
    return {
      rows: p.map((f) => {
        const o = f && typeof f === 'object' ? f : {};
        return blank({
          name: String(o.name ?? ''),
          type: ['text', 'checkbox', 'dropdown'].includes(o.type) ? o.type : 'text',
          page: String(o.page ?? '1'),
          x: String(o.x ?? '0'),
          y: String(o.y ?? '0'),
          width: String(o.width ?? '100'),
          height: String(o.height ?? '24'),
          value: String(o.value ?? ''),
          required: !!o.required,
          choices: Array.isArray(o.choices) ? o.choices.join('\n') : '',
        });
      }),
    };
  } catch {
    return { rows: [], error: 'The current value is not valid JSON, so it could not be loaded into the editor.' };
  }
}

function serialize(rows: Row[]): string {
  return JSON.stringify(
    rows.map((r) => {
      const o: Record<string, unknown> = { name: r.name, type: r.type };
      for (const k of NUM_KEYS) {
        const t = r[k].trim();
        o[k] = t !== '' && Number.isFinite(Number(t)) ? Number(t) : r[k];
      }
      o.value = r.value;
      if (r.required) o.required = true;
      if (r.type === 'dropdown') o.choices = r.choices.split('\n').map((c) => c.trim()).filter(Boolean);
      return o;
    }),
  );
}

function problems(r: Row, all: Row[], insp?: DocumentInspection): string[] {
  const out: string[] = [];
  if (!r.name.trim()) out.push('Name is required.');
  else if (all.some((o) => o !== r && o.name.trim() === r.name.trim())) out.push('Another field uses this name.');
  for (const k of NUM_KEYS) {
    const n = Number(r[k]);
    if (r[k].trim() === '' || !Number.isFinite(n)) out.push(`${k} must be a number.`);
    else if ((k === 'width' || k === 'height') && n < 5) out.push(`${k} must be at least 5 points.`);
    else if (k === 'page' && (!Number.isInteger(n) || n < 1)) out.push('page must be a whole number from 1.');
    else if ((k === 'x' || k === 'y') && n < 0) out.push(`${k} cannot be negative.`);
  }
  const pg = insp?.pages.find((p) => p.number === Number(r.page));
  if (insp && Number.isInteger(Number(r.page)) && Number(r.page) >= 1) {
    if (Number(r.page) > insp.pageCount) out.push(`This PDF has ${insp.pageCount} pages.`);
    else if (pg && (Number(r.x) + Number(r.width) > pg.width + 0.01 || Number(r.y) + Number(r.height) > pg.height + 0.01))
      out.push(`Field extends past the page (${Math.round(pg.width)} x ${Math.round(pg.height)} pt).`);
  }
  if (r.type === 'dropdown') {
    const ch = r.choices.split('\n').map((c) => c.trim()).filter(Boolean);
    if (!ch.length) out.push('Add at least one choice.');
    else if (r.value && !ch.includes(r.value)) out.push('Initial value is not one of the choices.');
  }
  return out;
}

const LABEL = 'block font-mono text-[10px] uppercase tracking-wider text-muted-foreground';

export function PdfFormBuilder({ value, onChange, inspection }: { value: string; onChange: (value: string) => void; inspection?: DocumentInspection }) {
  const initial = useRef(parse(value));
  const [rows, setRows] = useState<Row[]>(initial.current.rows);
  const [loadError, setLoadError] = useState(initial.current.error);
  const last = useRef(value);

  // Resync only when the parent value changes from outside.
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    const p = parse(value);
    setRows(p.rows);
    setLoadError(p.error);
  }, [value]);

  const commit = (next: Row[]) => {
    setRows(next);
    setLoadError(undefined);
    const s = serialize(next);
    last.current = s;
    onChange(s);
  };
  const patch = (key: number, p: Partial<Row>) => commit(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const add = () => {
    const prev = rows[rows.length - 1];
    const pg = inspection?.pages[0];
    let n = rows.length + 1;
    while (rows.some((r) => r.name === `field_${n}`)) n++;
    commit([
      ...rows,
      blank({
        name: `field_${n}`,
        page: prev?.page ?? '1',
        y: prev && Number.isFinite(Number(prev.y)) ? String(Math.min(Number(prev.y) + 40, pg ? Math.max(0, pg.height - 28) : 9999)) : '150',
      }),
    ]);
  };

  const pageInfo = inspection?.pages[0];

  return (
    <div className="space-y-3 rounded-xl border border-border p-3 sm:p-4" data-testid="editor-pdf-form-builder">
      <p className="text-xs text-muted-foreground">
        Positions are in PDF points (72 per inch) measured from the top-left corner of the page; pages start at 1.
        {pageInfo && ` Page 1 of this file is ${Math.round(pageInfo.width)} x ${Math.round(pageInfo.height)} pt.`}
      </p>
      {loadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs" role="alert" data-testid="text-form-builder-load-error">
          {loadError} Adding or editing a field replaces it.
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{value}</pre>
        </div>
      )}
      {rows.length === 0 && !loadError && (
        <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">No fields yet. Add one to place it on the page.</p>
      )}
      <ul className="space-y-3">
        {rows.map((r, i) => {
          const errs = problems(r, rows, inspection);
          const id = `fb-${r.key}`;
          const pg = inspection?.pages.find((p) => p.number === Number(r.page));
          return (
            <li key={r.key} className={`rounded-xl border bg-card p-3 ${errs.length ? 'border-destructive/50' : 'border-border'}`} data-testid={`field-row-${i}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-primary">Field {i + 1}</span>
                <div className="flex gap-1">
                  <button type="button" aria-label={`Duplicate field ${i + 1}`} className="rounded p-2 hover:bg-accent" data-testid={`button-duplicate-field-${i}`}
                    onClick={() => commit([...rows.slice(0, i + 1), { ...r, key: ++seq, name: `${r.name}_copy` }, ...rows.slice(i + 1)])}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={`Remove field ${i + 1}`} className="rounded p-2 text-destructive hover:bg-destructive/10" data-testid={`button-remove-field-${i}`}
                    onClick={() => commit(rows.filter((x) => x.key !== r.key))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_160px]">
                <div>
                  <label htmlFor={`${id}-name`} className={LABEL}>Name</label>
                  <input id={`${id}-name`} className="field mt-1" value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} data-testid={`input-field-name-${i}`} />
                </div>
                <div>
                  <label htmlFor={`${id}-type`} className={LABEL}>Type</label>
                  <select id={`${id}-type`} className="field mt-1" value={r.type} onChange={(e) => patch(r.key, { type: e.target.value as FieldType, value: '' })} data-testid={`select-field-type-${i}`}>
                    <option value="text">Text</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="dropdown">Dropdown</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {NUM_KEYS.map((k) => (
                  <div key={k}>
                    <label htmlFor={`${id}-${k}`} className={LABEL}>{k === 'x' ? 'X (left)' : k === 'y' ? 'Y (top)' : k}</label>
                    <input id={`${id}-${k}`} type="text" inputMode="decimal" className="field mt-1" value={r[k]}
                      aria-invalid={Number.isFinite(Number(r[k])) && r[k].trim() !== '' ? undefined : true}
                      onChange={(e) => patch(r.key, { [k]: e.target.value })} data-testid={`input-field-${k}-${i}`} />
                  </div>
                ))}
              </div>
              {r.type === 'dropdown' && (
                <div className="mt-3">
                  <label htmlFor={`${id}-choices`} className={LABEL}>Choices (one per line)</label>
                  <textarea id={`${id}-choices`} rows={3} className="field mt-1" value={r.choices} onChange={(e) => patch(r.key, { choices: e.target.value })} data-testid={`input-field-choices-${i}`} />
                </div>
              )}
              <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label htmlFor={`${id}-value`} className={LABEL}>Initial value{r.type === 'checkbox' ? ' (checked)' : ''}</label>
                  {r.type === 'checkbox' ? (
                    <select id={`${id}-value`} className="field mt-1" value={r.value} onChange={(e) => patch(r.key, { value: e.target.value })} data-testid={`input-field-value-${i}`}>
                      <option value="">Unchecked</option>
                      <option value="true">Checked</option>
                    </select>
                  ) : r.type === 'dropdown' ? (
                    <select id={`${id}-value`} className="field mt-1" value={r.value} onChange={(e) => patch(r.key, { value: e.target.value })} data-testid={`input-field-value-${i}`}>
                      <option value="">None selected</option>
                      {r.value && !r.choices.split('\n').map((c) => c.trim()).includes(r.value) && <option value={r.value}>{r.value}</option>}
                      {r.choices.split('\n').map((c) => c.trim()).filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input id={`${id}-value`} className="field mt-1" value={r.value} onChange={(e) => patch(r.key, { value: e.target.value })} data-testid={`input-field-value-${i}`} />
                  )}
                </div>
                <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={r.required} onChange={(e) => patch(r.key, { required: e.target.checked })} data-testid={`input-field-required-${i}`} />
                  Required
                </label>
              </div>
              {pg && <p className="mt-2 font-mono text-[11px] text-muted-foreground">Page {pg.number} is {Math.round(pg.width)} x {Math.round(pg.height)} pt</p>}
              {errs.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-destructive" role="alert" data-testid={`text-field-errors-${i}`}>
                  {errs.map((e, j) => <li key={j}>{e}</li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn-ghost w-full sm:w-auto" onClick={add} data-testid="button-add-field">
        <Plus className="h-4 w-4" /> Add field
      </button>
    </div>
  );
}
