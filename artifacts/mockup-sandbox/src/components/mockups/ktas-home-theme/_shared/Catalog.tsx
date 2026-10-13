import { useMemo, useState } from 'react';
import { Link } from './stubs';
import { AnimatePresence } from 'framer-motion';
import { Search, ShieldCheck, FileX2, Ban } from 'lucide-react';
import { useTools, useMeta } from './stubs';
import { AdSlot, ErrorPanel, ToolCard } from './shared';

export default function Catalog({ home = false }: { home?: boolean }) {
  useMeta(
    home ? 'KTAS PDF Tools: 100 free PDF tools' : 'All 100 PDF tools',
    '100 free PDF tools from Kali Tech and Services. Merge, convert, edit and secure PDFs with real local results, without subscriptions or external document APIs.',
  );
  const { tools, isLoading, isError, refetch } = useTools();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');

  const cats = useMemo(() => ['All', ...Array.from(new Set((tools ?? []).map((t) => t.category)))], [tools]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tools ?? []).filter(
      (t) =>
        (cat === 'All' || t.category === cat) &&
        (!s || `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(s)),
    );
  }, [tools, q, cat]);

  return (
    <div>
      <header className="mb-10 max-w-4xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          {home ? 'Free. Ad-supported. No account.' : 'The full catalog'}
        </p>
        <h1 className="mt-3 text-5xl font-extrabold leading-[1.02] md:text-7xl">
          {home ? (
            <>
              Documents, transformed <span className="text-primary">correctly</span>.
            </>
          ) : (
            'Every tool, in one place'
          )}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {home
            ? 'No subscription. No fake success screens. You see the real size change, the real warnings and the real file you get back.'
            : 'Search by task or filter by category. Each tool lists its own limits before you upload anything.'}
        </p>
        {home && (
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Temporary files deleted after each request</li>
            <li className="flex items-center gap-2"><FileX2 className="h-4 w-4 text-primary" /> No document history kept</li>
            <li className="flex items-center gap-2"><Ban className="h-4 w-4 text-primary" /> No external AI services</li>
          </ul>
        )}
      </header>

      <div className="sticky top-[57px] z-30 -mx-4 border-y border-border bg-background/90 px-4 py-3 backdrop-blur md:mx-0 md:rounded-2xl md:border">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools: merge, compress, sign..."
            aria-label="Search tools"
            className="field pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
          {cats.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={cat === c}
              onClick={() => setCat(c)}
              data-testid={`chip-${c}`}
              className={`shrink-0 rounded-full border px-3.5 py-1 text-sm font-medium transition-colors ${
                cat === c ? 'border-foreground bg-foreground text-background' : 'border-input bg-card hover:bg-accent'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 font-mono text-xs text-muted-foreground" aria-live="polite" data-testid="text-count">
        {isLoading ? 'Loading catalog...' : tools ? `${list.length} of ${tools.length} tools` : ''}
      </p>

      <section className="mt-4">
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}
        {isError && <ErrorPanel message="The tool catalog could not be loaded from the server." onRetry={() => refetch()} />}
        {tools && list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-input p-12 text-center" data-testid="empty-results">
            <p className="font-display text-2xl font-bold">Nothing matches that</p>
            <p className="mt-1 text-muted-foreground">Try a shorter search or another category.</p>
            <button className="btn btn-ink mt-4" onClick={() => { setQ(''); setCat('All'); }}>Clear filters</button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AnimatePresence>
            {list.map((t, i) => (
              <ToolCard key={t.slug} tool={t} index={i} />
            ))}
          </AnimatePresence>
        </div>
      </section>

      <AdSlot name="catalog" className="mt-12" />

      {home && (
        <section className="mt-16 grid gap-6 md:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl bg-foreground p-8 text-background">
            <h2 className="text-3xl font-bold">Need a how-to first?</h2>
            <p className="mt-2 opacity-75">Short practical guides on compression, merging, locked files and signatures.</p>
            <Link href="/guides" className="btn mt-5 bg-primary text-primary-foreground">Read the guides</Link>
          </div>
          <div className="rounded-2xl border border-card-border bg-card p-8">
            <h2 className="text-3xl font-bold">Who runs this?</h2>
            <p className="mt-2 text-muted-foreground">KTAS PDF is built by Kali Tech and Services and paid for by advertising, never by your documents.</p>
            <Link href="/about" className="btn btn-ghost mt-5">About KTAS PDF</Link>
          </div>
        </section>
      )}
    </div>
  );
}
