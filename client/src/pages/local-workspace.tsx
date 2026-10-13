import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Check, Clipboard, Download, FileImage, LoaderCircle, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import type { PdfTool, ToolOption } from '@workspace/api-client-react';
import { processImage } from '@/lib/image-engine';
import { runTextTool } from '@/lib/text-engine';
import { useMeta } from '@/lib/util';
import { AdSlot, ErrorPanel, ToolIcon } from '@/components/shared';
import { useTools } from '@/lib/tools';
import NotFound from '@/pages/not-found';

export function LocalToolPage({ slug, section }: { slug: string; section: 'image' | 'text' }) {
  const { tools, isLoading, isError, refetch } = useTools();
  const tool = tools?.find((entry) => entry.slug === slug && entry.section === section);
  if (isLoading) return <div className="workspace"><div className="h-12 w-56 animate-pulse rounded bg-muted" /><div className="mt-6 h-72 animate-pulse rounded-xl bg-muted" /></div>;
  if (isError) return <div className="workspace"><ErrorPanel message="The tool directory could not be loaded." onRetry={() => refetch()} /></div>;
  if (!tool) return <NotFound />;
  return <LocalWorkspace tool={tool} />;
}

function LocalWorkspace({ tool }: { tool: PdfTool }) {
  return tool.section === 'image' ? <ImageWorkspace key={tool.slug} tool={tool} /> : <TextWorkspace key={tool.slug} tool={tool} />;
}

function ImageWorkspace({ tool }: { tool: PdfTool }) {
  const [file, setFile] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(tool.options.map((o) => [o.key, o.defaultValue ?? ''])));
  const [result, setResult] = useState<{ blob: Blob; width: number; height: number; originalBytes: number; outputBytes: number; extension: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestEpoch = useRef(0);
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  const resultUrl = useMemo(() => result ? URL.createObjectURL(result.blob) : '', [result]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);
  useEffect(() => () => { requestEpoch.current += 1; }, []);
  useMeta(`${tool.name} — browser image tool`, `${tool.description} Runs locally in your browser; image contents are not uploaded.`);
  const setOption = (key: string, value: string) => {
    requestEpoch.current += 1;
    setBusy(false);
    setValues((v) => ({ ...v, [key]: value }));
    setResult(null);
    setError('');
  };
  const chooseFile = (next?: File) => {
    requestEpoch.current += 1;
    setBusy(false);
    setResult(null); setError('');
    if (!next) { setFile(null); return; }
    const supported = /\.(jpe?g|png|webp|bmp)$/i.test(next.name) || ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(next.type);
    if (!supported) { setFile(null); setError('Choose a JPEG, PNG, WebP or BMP image.'); return; }
    if (next.size > 30 * 1024 * 1024) { setFile(null); setError('Images must be 30 MB or smaller.'); return; }
    setFile(next);
  };
  const run = async () => {
    if (!file) return;
    const epoch = ++requestEpoch.current;
    setBusy(true); setError(''); setResult(null);
    try {
      const processed = await processImage(file, tool.slug, values);
      if (requestEpoch.current === epoch) setResult(processed);
    } catch (e) {
      if (requestEpoch.current === epoch) setError(e instanceof Error ? e.message : 'The image could not be processed.');
    } finally {
      if (requestEpoch.current === epoch) setBusy(false);
    }
  };
  return <main className="workspace">
    <Link href="/image" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Image tools</Link>
    <header className="my-7 flex gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#bd5947] text-white"><ToolIcon name={tool.icon} className="h-7 w-7" /></span>
      <div><p className="section-kicker">IMAGE WORKSPACE · RUNS IN YOUR BROWSER</p><h1 className="mt-1 text-4xl font-extrabold" data-testid="text-tool-name">{tool.name}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{tool.description}</p></div>
    </header>
    <AdSlot name="image-tool" className="mb-7" />
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <section className="workspace-card">
          <h2 className="text-xl font-bold">1. Choose an image</h2>
          <p className="mt-1 text-sm text-muted-foreground">JPEG, PNG, WebP or BMP · up to 30 MB and 40 megapixels. Processed on this device.</p>
          <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,image/jpeg,image/png,image/webp,image/bmp" hidden onChange={(e) => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
          {!file ? <button type="button" className="mt-4 flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#b9d0c3] bg-[#f5faf5] text-center hover:border-primary" onClick={() => inputRef.current?.click()}>
            <Upload className="text-primary" size={25} /><strong>Choose an image</strong><span className="text-xs text-muted-foreground">Your file stays in this browser</span>
          </button> : <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
            <img src={previewUrl} alt={`Preview of ${file.name}`} className="h-24 w-24 rounded-md object-contain bg-muted" />
            <div className="min-w-0 flex-1"><b className="block truncate">{file.name}</b><span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span></div>
            <button className="workspace-btn secondary" type="button" onClick={() => inputRef.current?.click()}><FileImage size={16} /> Replace</button>
            <button className="workspace-btn secondary" type="button" aria-label="Remove image" onClick={() => chooseFile(undefined)}><Trash2 size={16} /></button>
          </div>}
        </section>
        {tool.options.length > 0 && <section className="workspace-card"><h2 className="text-xl font-bold">2. Adjust settings</h2><p className="mt-1 text-sm text-muted-foreground">Quality controls JPEG/WebP encoding. PNG is lossless; the quality setting has no effect on PNG output.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">{tool.options.map((option) => <OptionField key={option.key} option={option} value={values[option.key] ?? ''} onChange={(v) => setOption(option.key, v)} />)}</div>
        </section>}
        <section className="workspace-card"><h2 className="text-xl font-bold">{tool.options.length ? '3.' : '2.'} Process</h2>
          <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="workspace-btn" disabled={!file || busy} onClick={() => void run()}>{busy ? <><LoaderCircle size={17} className="animate-spin" /> Working…</> : <><Check size={17} /> Process image</>}</button><button type="button" className="workspace-btn secondary" disabled={!file && !result && Object.entries(values).every(([key, value]) => value === (tool.options.find((o) => o.key === key)?.defaultValue ?? ''))} onClick={() => { requestEpoch.current += 1; setBusy(false); chooseFile(undefined); setValues(Object.fromEntries(tool.options.map((o) => [o.key, o.defaultValue ?? '']))); setError(''); setResult(null); }}>Reset</button></div>
          {busy && <p className="mt-3 text-sm text-muted-foreground" role="status">Working locally in your browser. Larger images may take a moment.</p>}
        </section>
        {error && <ErrorPanel message={error} onRetry={() => void run()} />}
        {result && <section className="workspace-card" aria-live="polite" data-testid="panel-result"><h2 className="text-xl font-bold">Your image is ready</h2><div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div><dl className="grid grid-cols-2 gap-3 text-sm"><Metric label="Dimensions" value={`${result.width} × ${result.height}`} /><Metric label="Original size" value={formatBytes(result.originalBytes)} /><Metric label="Output size" value={formatBytes(result.outputBytes)} /><Metric label="Format" value={result.extension.toUpperCase()} /></dl>
            <a className="workspace-btn mt-5" href={resultUrl} download={outputName(file?.name ?? 'image', result.extension)}><Download size={17} /> Download image</a></div>
          <img src={resultUrl} alt="Processed image preview" className="workspace-preview w-full" />
        </div></section>}
      </div>
      <aside className="space-y-4"><div className="workspace-card"><ShieldCheck size={21} className="text-primary" /><h2 className="mt-2 font-bold">Your image stays here.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Processing happens in your browser. The image is not sent to KTAS servers or an external image API.</p></div><div className="workspace-card"><h2 className="font-bold">Tool notes</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tool.limitations}</p>{tool.help.length > 0 && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{tool.help.map((tip, i) => <li key={i}>{tip}</li>)}</ul>}</div></aside>
    </div>
  </main>;
}

function TextWorkspace({ tool }: { tool: PdfTool }) {
  const [input, setInput] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(tool.options.map((o) => [o.key, o.defaultValue ?? ''])));
  const [result, setResult] = useState<ReturnType<typeof runTextTool> | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLTextAreaElement>(null);
  const downloadUrl = useMemo(() => result ? URL.createObjectURL(new Blob([result.text], { type: result.mime })) : '', [result]);
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  useMeta(`${tool.name} — browser text tool`, `${tool.description} Runs locally in your browser; text is not uploaded.`);
  const reset = () => { setInput(''); setResult(null); setError(''); setValues(Object.fromEntries(tool.options.map((o) => [o.key, o.defaultValue ?? '']))); setCopied(false); };
  const run = () => {
    setBusy(true); setError(''); setResult(null); setCopied(false);
    try { setResult(runTextTool(tool.slug, input, values)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The text could not be processed.'); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Clipboard access was blocked. Select the result and copy it manually.'); }
  };
  return <main className="workspace">
    <Link href="/text" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Text tools</Link>
    <header className="my-7 flex gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#53788b] text-white"><ToolIcon name={tool.icon} className="h-7 w-7" /></span><div><p className="section-kicker">TEXT WORKSPACE · RUNS IN YOUR BROWSER</p><h1 className="mt-1 text-4xl font-extrabold" data-testid="text-tool-name">{tool.name}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{tool.description}</p></div></header>
    <AdSlot name="text-tool" className="mb-7" />
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <section className="workspace-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">1. Enter your text</h2><p className="mt-1 text-sm text-muted-foreground">Your text stays in this browser and is not uploaded.</p></div><button type="button" className="workspace-btn secondary !py-2" onClick={reset}><RotateCcw size={15} /> Clear / reset</button></div>
          <textarea className="mt-4 min-h-64 w-full resize-y rounded-lg border border-[#b9d0c3] bg-white p-4 font-mono text-sm leading-relaxed text-[#153b3b]" value={input} onChange={(e) => { setInput(e.target.value); setResult(null); setError(''); }} placeholder="Paste or type text here…" aria-label="Text to process" data-testid="input-text" />
          <p className="mt-2 text-xs text-muted-foreground">{Array.from(input).length.toLocaleString()} characters · {input.trim() ? input.trim().split(/\s+/).length.toLocaleString() : 0} words · {input ? input.split(/\r\n|\r|\n/).length : 0} lines</p>
        </section>
        {tool.options.length > 0 && <section className="workspace-card"><h2 className="text-xl font-bold">2. Settings</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{tool.options.map((option) => <OptionField key={option.key} option={option} value={values[option.key] ?? ''} onChange={(value) => { setValues((v) => ({ ...v, [option.key]: value })); setResult(null); setError(''); }} />)}</div></section>}
        <section className="workspace-card"><h2 className="text-xl font-bold">{tool.options.length ? '3.' : '2.'} Run tool</h2><button type="button" className="workspace-btn mt-4" disabled={!input.length || busy} onClick={run}>{busy ? <><LoaderCircle className="animate-spin" size={17} /> Working…</> : <><Check size={17} /> Run {tool.name}</>}</button></section>
        {error && <ErrorPanel message={error} />}
        {result && <section className="workspace-card" aria-live="polite" data-testid="panel-result"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="section-kicker">RESULT</p><h2 className="text-xl font-bold">Your text is ready</h2></div><div className="flex gap-2"><button type="button" className="workspace-btn secondary !py-2" onClick={() => void copy()}><Clipboard size={15} /> {copied ? 'Copied' : 'Copy'}</button><a className="workspace-btn !py-2" href={downloadUrl} download={result.fileName}><Download size={15} /> Download</a></div></div>
          <textarea ref={resultRef} readOnly className="mt-4 min-h-64 w-full rounded-lg border border-[#b9d0c3] bg-[#f5faf5] p-4 font-mono text-sm leading-relaxed text-[#153b3b]" value={result.text} aria-label="Processed text result" data-testid="text-result" />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>{result.stats.characters.toLocaleString()} characters</span><span>{result.stats.words.toLocaleString()} words</span><span>{result.stats.lines.toLocaleString()} lines</span><span>{formatBytes(result.stats.bytes)}</span></div>
        </section>}
      </div>
      <aside className="space-y-4"><div className="workspace-card"><ShieldCheck size={21} className="text-primary" /><h2 className="mt-2 font-bold">Text stays in this browser.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">This tool runs locally. KTAS does not receive your text or send it to third-party services.</p></div><div className="workspace-card"><h2 className="font-bold">Tool notes</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tool.limitations}</p>{tool.help.length > 0 && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{tool.help.map((tip, i) => <li key={i}>{tip}</li>)}</ul>}</div></aside>
    </div>
  </main>;
}

function OptionField({ option, value, onChange }: { option: ToolOption; value: string; onChange: (value: string) => void }) {
  const id = `option-${option.key}`;
  return <label className="workspace-field" htmlFor={id}><span>{option.label}</span>{option.description && <small className="font-normal text-muted-foreground">{option.description}</small>}
    {option.type === 'select' ? <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{option.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
      : option.type === 'textarea' ? <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      : <input id={id} type={option.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />}</label>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-[#eaf3eb] p-3"><dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function formatBytes(n: number) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`; }
function outputName(name: string, extension: string) { return `${name.replace(/\.[^.]+$/, '')}-ktas.${extension.replace(/^\./, '')}`; }