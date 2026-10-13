import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  useGetSiteConfig,
  useInspectDocument,
  useProcessDocument,
  type DocumentInspection,
  type DocumentProcessingResult,
  type PdfTool,
  type ToolOption,
} from '@workspace/api-client-react';
import { ArrowDown, ArrowUp, Copy, Download, FileText, Loader2, Lock, UploadCloud, X, AlertTriangle, ChevronLeft, Eye } from 'lucide-react';
import { useTools } from '@/lib/tools';
import {
  base64ToBlobUrl,
  errorMessage,
  formatBytes,
  matchesAccept,
  readFileBase64,
  useMeta,
} from '@/lib/util';
import { AdSlot, ErrorPanel, ToolIcon } from '@/components/shared';
import { PdfFormBuilder } from '@/components/pdf-form-builder';
import { WorkbookPreview } from '@/components/workbook-preview';
import { Button } from '@/components/ui/button';
import { PdfPageThumbnail, PdfPreviewModal } from '@/components/pdf-realtime-preview';
import NotFound from '@/pages/not-found';
import { toolHref, toolSection, type ToolSection } from '@/lib/tools';

interface Up {
  id: string;
  name: string;
  size: number;
  dataBase64: string;
  kind: 'doc' | 'sig';
}
interface Insp {
  status: 'loading' | 'ok' | 'error';
  data?: DocumentInspection;
  error?: string;
  password: string;
}

function getPreviewSrc(preview: string | undefined): string {
  if (!preview) return '';
  if (preview.startsWith('data:')) return preview;
  // If base64-encoded SVG (starts with 'PHN2' for '<sv' or 'PD94' for '<?xm') or starts with '<'
  if (preview.startsWith('PHN2') || preview.startsWith('PD94') || preview.trim().startsWith('<')) {
    return `data:image/svg+xml;base64,${preview}`;
  }
  // JPEG
  if (preview.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${preview}`;
  }
  // WebP
  if (preview.startsWith('UklGR')) {
    return `data:image/webp;base64,${preview}`;
  }
  return `data:image/png;base64,${preview}`;
}

export default function ToolPage({ slug, section = 'pdf', legacy = false }: { slug: string; section?: ToolSection; legacy?: boolean }) {
  const [, setLocation] = useLocation();
  const { tools, isLoading, isError, refetch } = useTools();
  const tool = tools?.find((t) => t.slug === slug);
  const sectionName = section === 'excel' ? 'Excel' : section === 'word' ? 'Word' : section === 'image' ? 'Image' : section === 'text' ? 'Text' : 'PDF';
  useMeta(
    tool ? `${tool.name}: free online ${sectionName} tool` : `${sectionName} tool`,
    tool ? tool.description : `Free ${sectionName} tool from KTAS Tools.`,
  );
  useEffect(() => {
    if (legacy && tool) setLocation(toolHref(tool), { replace: true });
  }, [legacy, tool, setLocation]);
  if (isLoading)
    return <div className="h-96 animate-pulse rounded-2xl bg-muted" data-testid="loading-tool" />;
  if (isError) return <ErrorPanel message="The tool catalog could not be loaded." onRetry={() => refetch()} />;
  if (!tool) return <NotFound />;
  if (legacy) return null;
  if (toolSection(tool) !== section) return <NotFound />;
  return <Workflow key={tool.slug} tool={tool} section={section} />;
}

function Workflow({ tool, section }: { tool: PdfTool; section: ToolSection }) {
  const { data: cfg } = useGetSiteConfig();
  const inspect = useInspectDocument();
  const process = useProcessDocument();

  const [files, setFiles] = useState<Up[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [insp, setInsp] = useState<Record<string, Insp>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tool.options.map((o) => [o.key, o.defaultValue ?? ''])),
  );
  const [result, setResult] = useState<DocumentProcessingResult | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewModalPage, setPreviewModalPage] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Blob URLs for returned files, revoked on change/unmount.
  useEffect(() => {
    if (!result) return;
    const made: string[] = [];
    try {
      for (const f of result.files) made.push(base64ToBlobUrl(f.dataBase64, f.mimeType));
    } catch {
      /* handled by empty urls */
    }
    setUrls(made);
    return () => {
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [result]);

  const runInspect = useCallback(
    async (id: string, name: string, b64: string, password: string) => {
      setInsp((m) => ({ ...m, [id]: { status: 'loading', password } }));
      try {
        const data = await inspect.mutateAsync({
          data: { file: { name, dataBase64: b64 }, ...(password ? { password } : {}) },
        });
        setInsp((m) => ({ ...m, [id]: { status: 'ok', data, password } }));
      } catch (e) {
        setInsp((m) => ({ ...m, [id]: { status: 'error', error: errorMessage(e), password } }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const addFiles = async (list: File[], kind: 'doc' | 'sig') => {
    if (!cfg) return;
    const errs: string[] = [];
    const accepted: File[] = [];
    let current = kind === 'doc' && !tool.multiple ? files.filter((f) => f.kind === 'sig') : files;
    let total = current.reduce((s, f) => s + f.size, 0);
    let count = current.length;
    for (const f of list) {
      if (kind === 'doc' && !matchesAccept(f, tool.accept)) errs.push(`${f.name}: this tool accepts ${tool.accept || 'specific file types'}.`);
      else if (kind === 'sig' && !/\.png$/i.test(f.name) && f.type !== 'image/png') errs.push(`${f.name}: signature image must be a PNG.`);
      else if (f.size > cfg.maxFileBytes) errs.push(`${f.name} is ${formatBytes(f.size)}; the limit per file is ${formatBytes(cfg.maxFileBytes)}.`);
      else if (f.size === 0) errs.push(`${f.name} is empty.`);
      else if (count + 1 > cfg.maxFiles) errs.push(`${f.name} skipped: at most ${cfg.maxFiles} files.`);
      else if (total + f.size > cfg.maxTotalBytes) errs.push(`${f.name} skipped: total would exceed ${formatBytes(cfg.maxTotalBytes)}.`);
      else {
        accepted.push(f);
        count++;
        total += f.size;
      }
      if (kind === 'doc' && !tool.multiple && accepted.length === 1) break;
    }
    setProblems(errs);
    if (!accepted.length) return;
    const read: Up[] = [];
    for (const f of accepted) {
      try {
        read.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: f.name,
          size: f.size,
          dataBase64: await readFileBase64(f),
          kind,
        });
      } catch {
        errs.push(`${f.name} could not be read by your browser.`);
        setProblems([...errs]);
      }
    }
    if (kind === 'sig') {
      current = current.filter((f) => f.kind !== 'sig');
      setValues((v) => ({ ...v, ...Object.fromEntries(tool.options.filter((o) => o.type === 'signature').map((o) => [o.key, ''])) }));
    }
    setFiles([...current, ...read]);
    if (section === 'excel' && !tool.multiple) setValues((v) => ({ ...v, sheet: '', ...(tool.slug === 'remove-excel-duplicates' ? { columns: '' } : {}) }));
    setResult(null);
    process.reset();
    for (const r of read) {
      if (r.kind === 'doc' && /\.pdf$/i.test(r.name)) await runInspect(r.id, r.name, r.dataBase64, '');
    }
    const firstDoc = read.find((r) => r.kind === 'doc');
    if (firstDoc && (!tool.multiple || !activeId)) setActiveId(firstDoc.id);
  };

  const remove = (id: string) => {
    setFiles((f) => f.filter((x) => x.id !== id));
    setInsp((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
    if (activeId === id) setActiveId(null);
    setResult(null);
    if (section === 'excel') setValues((v) => ({ ...v, sheet: '', ...(tool.slug === 'remove-excel-duplicates' ? { columns: '' } : {}) }));
  };
  const move = (i: number, d: number) =>
    setFiles((f) => {
      const n = [...f];
      const j = i + d;
      if (j < 0 || j >= n.length) return f;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const docFiles = files.filter((f) => f.kind === 'doc');
  const active = files.find((f) => f.id === activeId) ?? docFiles.find((f) => insp[f.id]?.status === 'ok') ?? docFiles[0];
  const activeInsp = active ? insp[active.id] : undefined;
  const inspData = activeInsp?.status === 'ok' ? activeInsp.data : undefined;
  const pagesOpt = tool.options.find((o) => (o.type === 'text' || o.type === 'textarea') && /page|range|order|select/i.test(o.key));

  const setVal = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));
  const addPageToOption = (n: number) => {
    if (!pagesOpt) return;
    const cur = (values[pagesOpt.key] ?? '').trim();
    setVal(pagesOpt.key, cur ? `${cur},${n}` : String(n));
  };

  const needsPassword = (i?: Insp) => !!i && (i.status === 'error' || (i.status === 'ok' && i.data?.encrypted && !i.data.pages.length));

  const submit = () => {
    setResult(null);
    const sourcePassword = docFiles.length ? insp[docFiles[0].id]?.password : "";
    process.mutate(
      {
        slug: tool.slug,
        data: {
          files: [...docFiles, ...files.filter(f => f.kind === 'sig')].map((f) => ({ name: f.name, dataBase64: f.dataBase64 })),
          options: sourcePassword && tool.slug !== "protect-pdf" && !values.password
            ? { ...values, password: sourcePassword } : values,
        },
      },
      { onSuccess: (r) => setResult(r) },
    );
  };

  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const localTool = tool.slug === 'translate-pdf';
  const canRun = !!cfg && docFiles.length > 0 && !process.isPending && (cfg.aiEnabled || !localTool);

  const faq = useMemo(() => buildFaq(tool, cfg?.retention, section), [tool, cfg?.retention, section]);

  return (
    <div>
      <Link href={`/${section}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back">
        <ChevronLeft className="h-4 w-4" /> {sectionName(section)} tools
      </Link>
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ToolIcon name={tool.icon} className="h-8 w-8" />
        </span>
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{tool.category}</p>
          <h1 className="mt-1 text-4xl font-extrabold md:text-5xl" data-testid="text-tool-name">{tool.name}</h1>
          <p className="mt-3 text-lg text-muted-foreground">{tool.description}</p>
        </div>
      </header>

      <AdSlot name={section === 'excel' ? 'excel-tool' : section === 'word' ? 'word-tool' : 'tool-top'} className="mb-10" />

      {section === 'excel' && (
        <div className="mb-7 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <span className="font-semibold">Excel files are processed temporarily on KTAS servers.</span>
          <span className="text-muted-foreground">Not in your browser, and never sent to external APIs. Formulas and macros are never executed.</span>
        </div>
      )}
      {section === 'word' && (
        <div className="mb-7 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <span className="font-semibold">Word files are processed temporarily on KTAS servers.</span>
          <span className="text-muted-foreground">No browser-local processing or rendered document preview.</span>
        </div>
      )}

      {localTool && cfg && !cfg.aiEnabled && (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
          This tool is currently unavailable on the server. Your files were not sent anywhere.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Upload */}
          <section aria-labelledby="h-upload" className="rounded-2xl border border-card-border bg-card p-5 paper-shadow">
            <h2 id="h-upload" className="text-xl font-bold">1. Add {tool.multiple ? 'files' : 'a file'}</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(Array.from(e.dataTransfer.files), 'doc'); }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
              data-testid="dropzone"
              className={`mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${
                drag ? 'scale-[1.01] border-primary bg-primary/5' : 'border-input hover:border-primary/60'
              }`}
            >
              <UploadCloud className="h-9 w-9 text-primary" />
              <p className="font-display text-lg font-bold">Drop {tool.multiple ? 'files' : 'a file'} here or browse</p>
              <p className="text-xs text-muted-foreground">
                Accepts {tool.accept || 'listed types'}
                {cfg && ` | up to ${formatBytes(cfg.maxFileBytes)} each, ${formatBytes(cfg.maxTotalBytes)} total${tool.multiple ? `, ${cfg.maxFiles} files` : ''}`}
              </p>
              <input
                ref={inputRef}
                type="file"
                hidden
                accept={tool.accept}
                multiple={tool.multiple}
                data-testid="input-file"
                onChange={(e) => { void addFiles(Array.from(e.target.files ?? []), 'doc'); e.target.value = ''; }}
              />
            </div>
            {problems.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-destructive" role="alert" data-testid="list-problems">
                {problems.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            )}

            {files.length > 0 && (
              <ul className="mt-4 divide-y divide-border rounded-xl border border-border" data-testid="list-files">
                {files.map((f, i) => {
                  const s = insp[f.id];
                  return (
                    <li key={f.id} className="p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <button className="min-w-0 flex-1 text-left" onClick={() => f.kind === 'doc' && setActiveId(f.id)}>
                          <span className={`block truncate text-sm font-semibold ${active?.id === f.id ? 'text-primary' : ''}`}>{f.name}</span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {formatBytes(f.size)}
                            {f.kind === 'sig' && ' | signature image'}
                            {s?.status === 'loading' && ' | reading pages...'}
                            {s?.status === 'ok' && s.data && ` | ${s.data.pageCount} pages`}
                          </span>
                        </button>
                        <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30" data-testid={`button-up-${i}`}><ArrowUp className="h-4 w-4" /></button>
                        <button aria-label="Move down" disabled={i === files.length - 1} onClick={() => move(i, 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30" data-testid={`button-down-${i}`}><ArrowDown className="h-4 w-4" /></button>
                        <button aria-label={`Remove ${f.name}`} onClick={() => remove(f.id)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" data-testid={`button-remove-${i}`}><X className="h-4 w-4" /></button>
                      </div>
                      {needsPassword(s) && (
                        <form
                          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const pw = (new FormData(e.currentTarget).get('pw') as string) ?? '';
                            void runInspect(f.id, f.name, f.dataBase64, pw);
                          }}
                        >
                          <Lock className="h-4 w-4 text-primary" />
                          <span className="basis-full text-xs sm:basis-auto">
                            {s?.error ?? 'This PDF is password-protected.'}
                          </span>
                          <input name="pw" type="password" placeholder="PDF password" className="field max-w-[220px]" defaultValue={s?.password} data-testid={`input-pdf-password-${i}`} />
                          <button type="submit" className="btn btn-ink !py-2" data-testid={`button-unlock-${i}`}>Retry preview</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {files.length > 0 && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {files.length} file{files.length > 1 ? 's' : ''}, {formatBytes(totalBytes)}. Order here is the order sent.
              </p>
            )}
          </section>

          {/* Preview */}
          {inspData && inspData.pages.length > 0 && (
            <section className="rounded-2xl border border-card-border bg-card p-5" aria-labelledby="h-prev">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="h-prev" className="text-xl font-bold">Page preview</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {active?.name}: {inspData.pageCount} pages total
                    {pagesOpt && ` Click a page to add it to "${pagesOpt.label}".`}
                  </p>
                </div>
                {active && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewModalPage(1)}
                    className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                  >
                    <Eye className="h-4 w-4" />
                    <span>View full PDF</span>
                  </Button>
                )}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {inspData.pages.map((p) => (
                  <button
                    key={p.number}
                    onClick={() => addPageToOption(p.number)}
                    disabled={!pagesOpt}
                    className="group text-left"
                    data-testid={`page-thumb-${p.number}`}
                  >
                    <PdfPageThumbnail
                      fileId={active?.id ?? ''}
                      dataBase64={active?.dataBase64}
                      pageNumber={p.number}
                      width={p.width}
                      height={p.height}
                      rotation={p.rotation}
                      fallbackBase64={p.previewBase64}
                      password={active ? insp[active.id]?.password : ''}
                      onOpenPreview={(pageNum) => setPreviewModalPage(pageNum)}
                    />
                    <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                      p.{p.number} | {Math.round(p.width)} x {Math.round(p.height)} pt{p.rotation ? ` | rot ${p.rotation}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {previewModalPage !== null && active && (
            <PdfPreviewModal
              isOpen={previewModalPage !== null}
              onClose={() => setPreviewModalPage(null)}
              fileName={active.name}
              fileId={active.id}
              dataBase64={active.dataBase64}
              totalPages={inspData?.pageCount ?? 1}
              initialPage={previewModalPage}
              password={insp[active.id]?.password}
            />
          )}

          {/* Options */}
          {section === 'excel' && active && /\.xlsx$/i.test(active.name) && (
            <WorkbookPreview
              key={active.id}
              file={active}
              sheet={tool.options.some((o) => o.key === 'sheet') ? values.sheet ?? '' : undefined}
              onSheetChange={(name) => { setVal('sheet', name); setResult(null); process.reset(); }}
            />
          )}
          {tool.options.some((o) => !(section === 'excel' && o.key === 'sheet')) && (
            <section className="rounded-2xl border border-card-border bg-card p-5" aria-labelledby="h-opt">
              <h2 id="h-opt" className="text-xl font-bold">2. Settings</h2>
              {tool.slug === 'remove-excel-duplicates' && (
                <p className="mt-2 text-sm text-muted-foreground">
                  To deduplicate customer IDs in column A, enter 1 below. Leave it blank to compare every cell.
                  Matching uses exact values and cell types, including empty values. Keeping the last occurrence
                  does not sort by date. A retained header is never included in matching.
                </p>
              )}
              <div className="mt-4 space-y-5">
                {tool.options.filter((o) => !(section === 'excel' && o.key === 'sheet')).map((o) => (
                  <OptionControl
                    key={o.key}
                    opt={o}
                    value={values[o.key] ?? ''}
                    onChange={(v) => setVal(o.key, v)}
                    inspection={inspData}
                    onSignatureFile={(f) => void addFiles([f], 'sig')}
                    hasSigFile={files.some((f) => f.kind === 'sig')}
                    onClearSigFile={() => setFiles((fs) => fs.filter((f) => f.kind !== 'sig'))}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-card-border bg-card p-5">
            <h2 className="text-xl font-bold">{tool.options.length ? '3.' : '2.'} Run</h2>
            {localTool && (
              <p className="mt-2 text-sm text-muted-foreground">
                This tool runs on our server with local models. Nothing is sent to an external AI service.
              </p>
            )}
            <button onClick={submit} disabled={!canRun} className="btn btn-primary mt-4 w-full sm:w-auto" data-testid="button-process">
              {process.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Working on it</> : `Run ${tool.name}`}
            </button>
            {process.isPending && (
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                Uploading and processing. Large files take longer, and this tool cannot report exact progress.
              </p>
            )}
            {!files.length && <p className="mt-3 text-sm text-muted-foreground">Add a file to enable this button.</p>}
            {process.isError && <div className="mt-4"><ErrorPanel message={errorMessage(process.error)} onRetry={submit} /></div>}
          </section>

          {result && (
            <section className="rounded-2xl border-2 border-primary bg-card p-5 paper-shadow" aria-labelledby="h-res" data-testid="panel-result">
              <h2 id="h-res" className="text-xl font-bold">Result</h2>
              <p className="mt-2" data-testid="text-result-message">{result.message}</p>
              {result.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-lg bg-accent p-3 text-sm" data-testid="list-warnings">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{w}</li>
                  ))}
                </ul>
              )}
              <SizeReport original={result.originalBytes} output={result.outputBytes} pages={result.pageCount} />
              {result.text && (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <p className="font-display font-bold">Text result</p>
                    <button
                      className="btn btn-ghost !py-1.5"
                      onClick={() => { void navigator.clipboard.writeText(result.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                      data-testid="button-copy-text"
                    >
                      <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed" data-testid="text-result">{result.text}</pre>
                </div>
              )}
              {result.files.length > 0 && (
                <ul className="mt-4 space-y-2" data-testid="list-downloads">
                  {result.files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{f.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{formatBytes(f.bytes)} | {f.mimeType}</span>
                      </span>
                      {urls[i] ? (
                        <a href={urls[i]} download={f.name} className="btn btn-primary !py-2" data-testid={`link-download-${i}`}>
                          <Download className="h-4 w-4" /> Download
                        </a>
                      ) : (
                        <span className="text-xs text-destructive">Could not prepare download</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!result.files.length && !result.text && (
                <p className="mt-3 text-sm text-muted-foreground">The server returned no files and no text.</p>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl bg-foreground p-5 text-background">
            <h2 className="font-display text-lg font-bold">Know the limits</h2>
            <p className="mt-2 text-sm leading-relaxed opacity-80" data-testid="text-limitations">{tool.limitations}</p>
          </div>
          <AdSlot name="tool-sidebar" format="rectangle" />
        </aside>
      </div>

      <section className="mt-14 max-w-3xl" aria-labelledby="h-faq">
        <h2 id="h-faq" className="text-3xl font-bold">Help and questions</h2>
        <div className="mt-4 divide-y divide-border rounded-2xl border border-card-border bg-card">
          {faq.map((f, i) => (
            <details key={i} className="group p-5" data-testid={`faq-${i}`}>
              <summary className="cursor-pointer list-none font-display font-bold marker:hidden">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Related links">
        <Link href={`/${section}`} className="font-semibold text-primary underline">More {sectionName(section)} tools</Link>
        {section === 'excel' && <>
          <span className="text-muted-foreground">Convert instead:</span>
          <Link href="/pdf/excel-to-pdf" className="font-semibold text-primary underline">Excel to PDF</Link>
        </>}
        {section === 'word' && <>
          <span className="text-muted-foreground">Convert instead:</span>
          <Link href="/pdf/word-to-pdf" className="font-semibold text-primary underline">Word to PDF</Link>
          <Link href="/pdf/pdf-to-word" className="font-semibold text-primary underline">PDF to Word</Link>
        </>}
      </section>
      <AdSlot name="tool-bottom" className="mt-12" />
    </div>
  );
}

function SizeReport({ original, output, pages }: { original: number; output: number; pages: number }) {
  if (!original && !output) return pages ? <p className="mt-3 text-sm">Pages: {pages}</p> : null;
  const diff = original - output;
  const pct = original ? Math.abs(diff / original) * 100 : 0;
  const label = diff > 0 ? `Saved ${formatBytes(diff)} (${pct.toFixed(1)}%)` : diff === 0 ? 'No size change' : `Larger by ${formatBytes(-diff)} (${pct.toFixed(1)}%)`;
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="report-size">
      <Stat k="Original" v={formatBytes(original)} />
      <Stat k="Output" v={formatBytes(output)} />
      <Stat k="Difference" v={label} />
      <Stat k="Pages" v={pages ? String(pages) : 'n/a'} />
    </dl>
  );
}
function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-sm font-bold">{v}</dd>
    </div>
  );
}

function OptionControl({
  opt, value, onChange, inspection, onSignatureFile, hasSigFile, onClearSigFile,
}: {
  opt: ToolOption;
  value: string;
  onChange: (v: string) => void;
  inspection?: DocumentInspection;
  onSignatureFile: (f: File) => void;
  hasSigFile: boolean;
  onClearSigFile: () => void;
}) {
  const id = `opt-${opt.key}`;
  const sigRef = useRef<HTMLInputElement>(null);
  const fields = inspection?.formFields ?? [];
  const map = useMemo<Record<string, string>>(() => {
    try {
      const p = JSON.parse(value || '{}');
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }, [value]);

  let control;
  if (opt.key === 'fieldSpecs') {
    return (
      <div>
        <span className="block text-sm font-semibold">{opt.label}</span>
        {opt.description && <p className="mb-1.5 text-xs text-muted-foreground">{opt.description}</p>}
        <PdfFormBuilder value={value} onChange={onChange} inspection={inspection} />
      </div>
    );
  }
  switch (opt.type) {
    case 'select':
      control = (
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`input-${opt.key}`}>
          {opt.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      );
      break;
    case 'textarea':
      control = <textarea id={id} rows={4} className="field font-mono" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`input-${opt.key}`} />;
      break;
    case 'number':
      control = <input id={id} type="number" className="field" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`input-${opt.key}`} />;
      break;
    case 'password':
      control = <input id={id} type="password" autoComplete="off" className="field" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`input-${opt.key}`} />;
      break;
    case 'signature':
      control = (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div>
            <label htmlFor={id} className="text-xs font-semibold">Type a signature</label>
            <input
              id={id}
              className="field mt-1 text-2xl italic"
              style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}
              value={value}
              disabled={hasSigFile}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Your name"
              data-testid={`input-${opt.key}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">Basic e-signature: your typed name is drawn on the page. It is not a certificate-based digital signature.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <span className="text-xs font-semibold">or upload a PNG image</span>
            <input ref={sigRef} type="file" accept="image/png" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { onSignatureFile(f); } e.target.value = ''; }} data-testid="input-signature-png" />
            <button type="button" className="btn btn-ghost !py-1.5" onClick={() => sigRef.current?.click()}>Choose PNG</button>
            {hasSigFile && <button type="button" className="text-xs text-destructive underline" onClick={onClearSigFile}>Remove uploaded image</button>}
          </div>
        </div>
      );
      break;
    case 'formFields':
      control = fields.length ? (
        <div className="space-y-3 rounded-xl border border-border p-4" data-testid="editor-form-fields">
          {fields.map((f) => (
            <div key={`${f.page}-${f.name}`}>
              <label className="block text-xs font-semibold">
                {f.name} <span className="font-mono font-normal text-muted-foreground">({f.type}, page {f.page})</span>
              </label>
              <input
                className="field mt-1"
                value={map[f.name] ?? f.value}
                onChange={(e) => onChange(JSON.stringify({ ...map, [f.name]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-input p-4 text-sm text-muted-foreground">
          No fillable form fields were found. Add a PDF that contains form fields; they appear here once it is read.
        </p>
      );
      break;
    default:
      control = <input id={id} type="text" className="field" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`input-${opt.key}`} />;
  }
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">{opt.label}</label>
      {opt.description && <p className="mb-1.5 text-xs text-muted-foreground">{opt.description}</p>}
      {control}
    </div>
  );
}

function sectionName(section: ToolSection) {
  return section === 'excel' ? 'Excel' : section === 'word' ? 'Word' : section === 'image' ? 'Image' : section === 'text' ? 'Text' : 'PDF';
}

function buildFaq(tool: PdfTool, retention?: string, section: ToolSection = 'pdf') {
  const out: { q: string; a: string }[] = tool.help.map((h, i) => ({
    q: i === 0 ? `How do I use ${tool.name}?` : `Tip ${i + 1}`,
    a: h,
  }));
  out.push({ q: `What are the limits of ${tool.name}?`, a: tool.limitations });
  if (tool.options.length)
    out.push({
      q: 'What do the settings do?',
      a: tool.options.map((o) => `${o.label}: ${o.description || 'see the field above'}`).join(' '),
    });
  if (tool.options.some((o) => /page|range|order/i.test(o.key)))
    out.push({
      q: 'How do I write page numbers?',
      a: 'Use comma-separated 1-based pages and ranges, for example 1,3,5-8. Previews show only the first pages of long files, but numbers apply to the whole document.',
    });
  out.push({
    q: 'Are my files kept?',
    a: section === 'excel'
      ? `Your Excel upload goes over HTTPS to our server and is processed in a private temporary location, not in your browser and not by external APIs. Temporary files are removed after processing; no document history is stored.${retention ? ` Retention note from the server: ${retention}` : ''}`
      : section === 'word'
      ? `Your Word upload goes over HTTPS to our server and is processed in a private temporary location. Temporary files are removed after processing; no document history is stored.${retention ? ` Retention note from the server: ${retention}` : ''}`
      : `Your upload goes over HTTPS to our server and is processed in a private temporary location that is deleted after the request. No document history is stored.${retention ? ` Retention note from the server: ${retention}` : ''}`,
  });
  out.push({
    q: 'Can I trust the output?',
    a: 'Check the result before relying on it. We show the real sizes and any warnings, and we do not promise perfect fidelity for every file.',
  });
  return out;
}
