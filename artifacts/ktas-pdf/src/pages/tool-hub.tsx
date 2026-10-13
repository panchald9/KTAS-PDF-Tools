import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, FileText, FileType, Image, Table2, Search, ShieldCheck, Type, X } from 'lucide-react';
import type { PdfTool } from '@workspace/api-client-react';
import { ToolCard, AdSlot, ErrorPanel } from '@/components/shared';
import { useTools, toolSection, type ToolSection } from '@/lib/tools';
import { COMPANY_SITE, useMeta } from '@/lib/util';

type Scope = 'all' | ToolSection;
const names: Record<Scope, string> = { all: 'KTAS Tools', pdf: 'PDF tools', image: 'Image tools', text: 'Text tools', word: 'Word tools', excel: 'Excel tools' };

export default function ToolHub({ scope = 'all', home = false }: { scope?: Scope; home?: boolean }) {
  const { tools, isLoading, isError, refetch } = useTools();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  useEffect(() => setCategory('All categories'), [scope]);
  const visible = useMemo(() => (tools ?? []).filter((t) => scope === 'all' || toolSection(t) === scope), [tools, scope]);
  const categories = useMemo(() => ['All categories', ...Array.from(new Set(visible.map((t) => t.category)))], [visible]);
  const searching = !!query.trim();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = searching && scope !== 'all' ? tools ?? [] : visible;
    return source.filter((t) => {
      const matches = !q || `${t.name} ${t.description} ${t.category} ${t.slug}`.toLowerCase().includes(q);
      return matches && (searching || category === 'All categories' || t.category === category);
    });
  }, [tools, visible, query, category, scope, searching]);
  const popular = filtered.filter((t) => t.popular);
  const groups = useMemo(() => {
    const source = filtered;
    const map = new Map<string, PdfTool[]>();
    source.forEach((tool) => map.set(tool.category, [...(map.get(tool.category) ?? []), tool]));
    return [...map.entries()];
  }, [filtered, searching]);
  const descriptions: Record<Scope, string> = {
    all: 'Free practical tools for PDF, Word, Excel, image and text tasks. PDF, Word and Excel files are processed temporarily on KTAS servers; image and text tools run in your browser. No subscriptions.',
    pdf: 'Free PDF tools to combine, convert, edit and organize documents. Files are processed temporarily on KTAS servers. No subscriptions.',
    excel: 'Free Excel tools to merge, split, clean, inspect and convert XLSX and CSV files. Files are processed temporarily on KTAS servers, not in your browser or by external APIs. No subscriptions.',
    word: 'Free Word DOCX tools to merge, convert, edit and inspect documents. Files are processed temporarily on KTAS servers, then removed. No subscriptions.',
    image: 'Free image tools to resize, crop, convert and adjust pictures directly in your browser. No subscriptions.',
    text: 'Free text tools to count, format, compare and transform plain text directly in your browser. No subscriptions.',
  };
  useMeta(home ? 'KTAS Tools — free tools for everyday tasks' : `${names[scope]} — free online tools`, descriptions[home ? 'all' : scope]);
  const clear = () => { setQuery(''); setCategory('All categories'); };
  return <div className="hub-page">
    {home && <section className="hub-hero">
      <div className="hub-wrap" style={{ paddingTop: 54, paddingBottom: 34 }}>
        <p className="eyebrow"><span className="eyebrow-rule" /> EVERYDAY TASKS, MADE SIMPLER</p>
        <h1 style={{ maxWidth: 900, margin: '18px 0 14px', font: '800 clamp(48px,7vw,86px)/.98 var(--kt-display)', letterSpacing: '-.055em' }}>A small job shouldn’t need a subscription.</h1>
        <p className="hero-lead" style={{ margin: '0 0 28px', maxWidth: 660 }}>Free, practical tools for documents, images and words. Find the thing you need, get it done, keep moving.</p>
        <SearchBar query={query} setQuery={setQuery} placeholder="What are you trying to do?  Try “resize”, “count words”…" />
        <div className="hero-points" style={{ justifyContent: 'flex-start', marginTop: 21 }}>
          <span><Check size={14} /> Free, no subscription</span><span><ShieldCheck size={14} /> Clear about where files go</span><span><Check size={14} /> No account required</span>
        </div>
      </div>
    </section>}
    {!home && <div className="hub-wrap" style={{ paddingTop: 42 }}>
      <p className="section-kicker">THE KTAS TOOLKIT</p>
      <h1 style={{ font: '800 clamp(42px,6vw,68px)/1 var(--kt-display)', letterSpacing: '-.05em', margin: '10px 0' }}>{scope === 'all' ? 'Find your tool.' : `${names[scope]}.`}</h1>
       <p className="hero-lead" style={{ margin: '0 0 24px', textAlign: 'left' }}>{scope === 'all' ? 'Search every tool, or browse by what you’re working on.' : scope === 'pdf' ? 'Everyday PDF jobs with clear limits and real results.' : scope === 'excel' ? 'Practical workbook tasks, with clear limits and temporary server processing.' : scope === 'word' ? 'Practical DOCX tasks, with clear limits and temporary server processing.' : scope === 'image' ? 'Resize, convert and adjust images right in your browser.' : 'Quick text utilities that work locally in your browser.'}</p>
      <SearchBar query={query} setQuery={setQuery} placeholder="Search tools by task, name or category" />
    </div>}
    <div className="hub-wrap" id="hub-directory" style={{ paddingTop: 24, paddingBottom: 42 }}>
      {!home && <div className="hub-tabs" aria-label="Browse tool sections">
         {(['all', 'pdf', 'word', 'excel', 'image', 'text'] as Scope[]).map((item) => <Link key={item} className={`hub-tab ${scope === item ? 'active' : ''}`} href={item === 'all' ? '/tools' : `/${item}`}>{item === 'all' ? 'All tools' : `${item[0].toUpperCase()}${item.slice(1)}`}</Link>)}
      </div>}
      <div className="hub-tabs" role="tablist" aria-label="Filter by category">
        {categories.map((name) => <button key={name} role="tab" aria-selected={category === name} className={`hub-tab ${category === name ? 'active' : ''}`} onClick={() => setCategory(name)}>{name}{name === 'All categories' && <span> · {visible.length}</span>}</button>)}
      </div>
       {home && <div className="hub-section-head"><div><p className="section-kicker">FIVE WAYS TO GET IT DONE</p><h2>Choose your workspace.</h2></div><p>PDF, Word and Excel files are processed temporarily on KTAS servers. Image and text work happens locally in your browser.</p></div>}
      {home && <div className="hub-tabs" style={{ marginBottom: 28 }}>
        {([
          { href: '/pdf', label: 'PDF', icon: FileText, count: visible.filter((t) => toolSection(t) === 'pdf').length, text: 'Combine, convert, tidy and protect documents.' },
          { href: '/word', label: 'Word', icon: FileType, count: visible.filter((t) => toolSection(t) === 'word').length, text: 'Work with DOCX files, with clear limits and no subscription.' },
          { href: '/excel', label: 'Excel', icon: Table2, count: visible.filter((t) => toolSection(t) === 'excel').length, text: 'Merge, split, clean and convert XLSX and CSV files.' },
          { href: '/image', label: 'Image', icon: Image, count: visible.filter((t) => toolSection(t) === 'image').length, text: 'Make everyday image edits without an upload.' },
          { href: '/text', label: 'Text', icon: Type, count: visible.filter((t) => toolSection(t) === 'text').length, text: 'Clean, compare and reshape plain text.' },
        ]).map(({ href, label, icon: Icon, count, text }) => <Link href={href} key={href} className="workspace-card" style={{ flex: '1 1 220px', display: 'grid', gap: 8, color: 'inherit' }}>
          <span style={{ width: 43, height: 43, display: 'grid', placeItems: 'center', borderRadius: 9, background: label === 'PDF' || label === 'Word' || label === 'Excel' ? '#087d78' : label === 'Image' ? '#bd5947' : '#53788b', color: 'white' }}><Icon size={22} /></span>
          <strong style={{ font: '700 22px var(--kt-display)' }}>{label} <small style={{ font: '500 12px var(--kt-mono)', color: '#58726c' }}>{count || '—'} tools</small></strong><span style={{ color: '#58726c', fontSize: 13 }}>{text}</span><span style={{ fontWeight: 700, color: '#087d78', fontSize: 13 }}>Open {label.toLowerCase()} tools <ArrowRight size={14} style={{ verticalAlign: 'middle' }} /></span>
        </Link>)}
      </div>}
      {scope === 'excel' && !home && <section className="trust-strip" style={{ margin: '26px 0 36px' }}>
        <div className="trust-icon"><ShieldCheck size={22} /></div>
        <div className="trust-copy"><p className="section-kicker">EXCEL WORKBOOKS</p><h2>XLSX and CSV, handled with care.</h2></div>
        <p>Uploads are processed temporarily on KTAS servers, not in your browser or by external APIs. Formulas are never executed. Need a PDF? Use the existing <Link href="/pdf/excel-to-pdf" className="trust-link">Excel to PDF</Link> tool.</p>
      </section>}
      {scope === 'word' && !home && <section className="trust-strip" style={{ margin: '26px 0 36px' }}>
        <div className="trust-icon"><ShieldCheck size={22} /></div>
        <div className="trust-copy"><p className="section-kicker">WORD DOCUMENTS</p><h2>DOCX in. Practical output out.</h2></div>
        <p>Uploads are processed temporarily on KTAS servers, not in your browser. Files are removed after processing. For PDF conversions, use the existing <Link href="/pdf/word-to-pdf" className="trust-link">Word to PDF</Link> and <Link href="/pdf/pdf-to-word" className="trust-link">PDF to Word</Link> tools.</p>
      </section>}
      {!home && <div className="hub-section-head"><div><p className="section-kicker">{searching ? 'SEARCH RESULTS' : 'TOOL DIRECTORY'}</p><h2>{searching ? 'Here’s what matches.' : 'Browse by category.'}</h2></div><p>{searching ? 'Search includes all tools, even when a section is selected.' : 'The catalog reflects the current tool directory.'}</p></div>}
      {home && <div className="hub-section-head"><div><p className="section-kicker">POPULAR STARTING POINTS</p><h2>Common jobs, one click away.</h2></div><Link href="/tools" className="button-text">Browse every tool <ArrowRight size={15} /></Link></div>}
      <p className="results-line" aria-live="polite">{isLoading ? 'Loading tool directory…' : isError ? 'Directory unavailable' : `${filtered.length} ${filtered.length === 1 ? 'tool' : 'tools'} ${searching ? 'match your search' : 'available'}`}{(query || category !== 'All categories') && <button onClick={clear}>Clear filters <X size={13} /></button>}</p>
       <AdSlot name={scope === 'all' ? home ? 'hub-top' : 'hub-directory' : scope === 'excel' ? 'excel-catalog' : scope === 'word' ? 'word-catalog' : scope === 'image' ? 'image-catalog' : scope === 'text' ? 'text-catalog' : 'catalog-top'} className="my-7" />
      {isLoading ? <div className="tool-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />)}</div>
        : isError ? <ErrorPanel message="The tool directory could not be loaded from the server." onRetry={() => refetch()} />
        : !filtered.length ? <div className="empty-results"><span className="empty-icon"><Search size={21} /></span><h3>No tools match that search.</h3><p>Try another phrase or reset the filters.</p><button className="button-primary" onClick={clear}>Show all tools <ArrowRight size={16} /></button></div>
         : <>{!searching && category === 'All categories' && popular.length > 0 && <><div className="tool-grid" aria-label="Popular tools">{popular.map((t, i) => <ToolCard key={t.slug} tool={t} index={i} />)}</div><AdSlot name={scope === 'pdf' ? 'catalog-quick-start' : scope === 'excel' ? 'excel-catalog' : scope === 'word' ? 'word-catalog' : scope === 'image' ? 'image-catalog' : scope === 'text' ? 'text-catalog' : home ? 'hub-directory' : 'hub-directory'} className="my-8" /></>}
           {groups.map(([group, entries], i) => <Fragment key={group}><section className="category-section">
            <div className="category-heading"><h3>{group}</h3><span>{entries.length} tools</span></div>
            <div className="tool-grid">{entries.map((t, index) => <ToolCard key={t.slug} tool={t} index={index} />)}</div>
           </section>{i > 0 && i % 3 === 2 && <AdSlot name={scope === 'pdf' && i < 6 ? `catalog-directory-${Math.floor((i + 1) / 3)}` : scope === 'excel' ? 'excel-catalog' : scope === 'word' ? 'word-catalog' : scope === 'image' ? 'image-catalog' : scope === 'text' ? 'text-catalog' : 'catalog'} className="my-8" />}</Fragment>)}
          {scope === 'pdf' && !searching && category === 'All categories' && <AdSlot name="catalog-directory-3" className="my-8" />}
        </>}
      {!home && <AdSlot name="catalog" className="mt-8" />}
      {home && <section className="trust-strip" style={{ marginTop: 74 }}>
        <div className="trust-icon"><ShieldCheck size={22} /></div><div className="trust-copy"><p className="section-kicker">A PRACTICAL PRIVACY NOTE</p><h2>Know where work happens.</h2></div>
         <p>PDF, Word and Excel files are sent securely to KTAS servers for processing, then temporary files are removed. Image and text tools run in this browser; their content is not uploaded to a document service. We don’t send work to third-party AI services.</p>
        <a className="trust-link" href={COMPANY_SITE} target="_blank" rel="noreferrer">About Kali Tech <ArrowRight size={15} /></a>
      </section>}
    </div>
  </div>;
}

function SearchBar({ query, setQuery, placeholder }: { query: string; setQuery: (value: string) => void; placeholder: string }) {
  return <label className="hub-search"><Search size={20} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label="Search tools" data-testid="input-tool-search" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</label>;
}