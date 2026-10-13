import './_group.css';
import './_new-theme.css';
import { useEffect, useMemo, useState } from 'react';
import { PDF_TOOLS, type PdfTool, COMPANY_SITE } from './_shared/stubs';
import { ToolIcon } from './_shared/shared';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, FileText, Menu, Search,
  Shield, X,
} from 'lucide-react';

const CATEGORIES = ['All tools', ...Array.from(new Set(PDF_TOOLS.map((tool) => tool.category)))];
const QUICK_START_SLUGS = [
  'merge-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-jpg',
  'jpg-to-pdf', 'pdf-to-word', 'sign-pdf', 'edit-pdf',
];
const QUICK_START_SET = new Set(QUICK_START_SLUGS);
const QUICK_START_TOOLS = QUICK_START_SLUGS
  .map((slug) => PDF_TOOLS.find((tool) => tool.slug === slug))
  .filter((tool): tool is PdfTool => !!tool);
const ICON_TONES: Record<string, string> = {
  Organize: 'tone-organize',
  'Convert to PDF': 'tone-convert',
  'Convert from PDF': 'tone-export',
  Optimize: 'tone-optimize',
  Edit: 'tone-edit',
  Security: 'tone-security',
  Intelligence: 'tone-intelligence',
};

export function NewTheme() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All tools');
  const [selected, setSelected] = useState<PdfTool | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selected]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return PDF_TOOLS.filter((tool) =>
      (category === 'All tools' || tool.category === category) &&
      (!query || `${tool.name} ${tool.description} ${tool.category}`.toLowerCase().includes(query)),
    );
  }, [search, category]);
  const hasActiveFilters = !!search.trim() || category !== 'All tools';
  const commonTools = hasActiveFilters ? [] : QUICK_START_TOOLS;
  const directoryTools = filtered.filter((tool) => !QUICK_START_SET.has(tool.slug) || hasActiveFilters);
  const renderToolCards = (tools: PdfTool[]) => tools.map((tool, index) => (
    <button
      key={tool.slug}
      className="tool-tile"
      style={{ animationDelay: `${Math.min(index, 9) * 35}ms` }}
      onClick={() => setSelected(tool)}
      data-testid={`card-tool-${tool.slug}`}
    >
      <span className="tool-tile-top">
        <span className={`tile-icon ${ICON_TONES[tool.category] ?? 'tone-default'}`}><ToolIcon name={tool.icon} /></span>
        <span className="tile-arrow"><ArrowUpRight size={16} /></span>
      </span>
      <span className="tile-title">{tool.name}</span>
      <span className="tile-description">{tool.description}</span>
      <span className="tile-bottom">
        <span>{tool.category}</span>
        <span className="tile-number">{String(PDF_TOOLS.indexOf(tool) + 1).padStart(2, '0')}</span>
      </span>
    </button>
  ));

  const jumpToTools = () => {
    document.getElementById('tool-finder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById('tool-search')?.focus(), 350);
    setMenuOpen(false);
  };

  return (
    <div className="ktas-new">
      <div className="ktas-topline">
        <span className="topline-mark" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
        <span>100 PDF tools. Free to use. No account required.</span>
        <span className="topline-sep">/</span>
        <span>Supported by advertising</span>
      </div>

      <header className="ktas-nav">
        <a href="#home" className="ktas-brand" aria-label="KTAS PDF home">
          <span className="brand-icon"><FileText size={19} strokeWidth={2.1} /></span>
          <span>KTAS <b>PDF</b><small>by Kali Tech and Services</small></span>
        </a>
        <button className="mobile-menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          <button className="nav-link nav-link-active" onClick={jumpToTools}>Tools</button>
          <a className="nav-link" href="#guides" onClick={() => setMenuOpen(false)}>Guides</a>
          <a className="nav-link" href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <a className="nav-link nav-contact" href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>
        </nav>
        <button className="nav-action" onClick={jumpToTools}>Find a tool <ArrowRight size={15} /></button>
      </header>

      <main id="home">
        <section className="hero-shell" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-rule" /> 100 useful PDF tools, one clear place</div>
            <h1 id="hero-title">What do you need to do with your PDF?</h1>
            <p className="hero-lead">Find the right tool for the job. Merge, split, compress, convert and more—all free, with no account required.</p>
            <div className="hero-buttons">
              <span className="hero-hint">Search below or start with a common task.</span>
              <a href="#how-it-works" className="button-text">How it works <ArrowDown size={15} /></a>
            </div>
          </div>
          <div className="finder-controls hero-finder-controls">
            <label className="search-box">
              <Search size={20} aria-hidden="true" />
              <input id="tool-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try “merge”, “compress” or “sign”" aria-label="Search PDF tools" />
              {search && <button className="clear-search" onClick={() => setSearch('')} aria-label="Clear search"><X size={16} /></button>}
              <kbd>/</kbd>
            </label>
            <div className="category-list" role="tablist" aria-label="Filter tools by category">
              {CATEGORIES.map((item) => (
                <button key={item} role="tab" aria-selected={category === item} className={`category-chip ${category === item ? 'selected' : ''}`} onClick={() => setCategory(item)}>
                  {item === 'All tools' ? <>All tools <span>{PDF_TOOLS.length}</span></> : item}
                </button>
              ))}
            </div>
          </div>
          <div className="hero-points">
            <span><Check size={14} /> Always free</span>
            <span><Check size={14} /> No account</span>
            <span><Check size={14} /> PDF only</span>
          </div>
        </section>

        <section className="finder-section" id="tool-finder" aria-labelledby="finder-heading">
          <div className="finder-heading-row">
            <div>
              <p className="section-kicker">{hasActiveFilters ? 'MATCHING PDF TOOLS' : 'QUICK START'}</p>
              <h2 id="finder-heading">{hasActiveFilters ? 'Your search results.' : 'Start with a common task.'}</h2>
            </div>
            <p className="finder-intro">{hasActiveFilters ? 'Keep browsing or clear your filters to see the full library.' : 'The everyday essentials, right up front. Browse all 100 tools below.'}</p>
          </div>
          <div className="results-line" aria-live="polite">
            <span>{search || category !== 'All tools' ? <><b>{filtered.length}</b> matching tools</> : <><b>100</b> tools, ready when you are</>}</span>
            {(search || category !== 'All tools') && <button onClick={() => { setSearch(''); setCategory('All tools'); }}>Clear filters <X size={13} /></button>}
          </div>

          {filtered.length > 0 ? (
            <>
              {commonTools.length > 0 && <div className="tool-grid">{renderToolCards(commonTools)}</div>}
              {directoryTools.length > 0 && (
                <section className="directory-section" aria-label={hasActiveFilters ? 'Filtered PDF tools' : 'Full PDF toolkit'}>
                  <div className="directory-heading">
                    <h3>{hasActiveFilters ? 'More matching tools' : 'Browse all 100 PDF tools'}</h3>
                    {!hasActiveFilters && <p>Find the exact tool for the task ahead.</p>}
                  </div>
                  <div className="tool-grid">{renderToolCards(directoryTools)}</div>
                </section>
              )}
            </>
          ) : (
            <div className="empty-results">
              <span className="empty-icon"><Search size={21} /></span>
              <h3>No tools found for that search.</h3>
              <p>Try a different phrase or clear your filters to see the full library.</p>
              <button className="button-primary" onClick={() => { setSearch(''); setCategory('All tools'); }}>Show all tools <ArrowRight size={16} /></button>
            </div>
          )}
          <aside className="ad-placeholder">
            <span className="ad-tag">AD SPACE</span>
            <span><b>Reserved for advertising</b><small>Inactive placeholder · no ads or third-party scripts are loaded here.</small></span>
            <span className="ad-pixel" aria-hidden="true" />
          </aside>
        </section>

        <section className="process-section" id="how-it-works">
          <div className="process-aside">
            <p className="section-kicker">STRAIGHTFORWARD BY DESIGN</p>
            <h2>From task<br />to <em>done.</em></h2>
            <p>Useful PDF work should be clear. Pick a tool, review what it does, and decide what to do with the result.</p>
            <button className="button-outline" onClick={jumpToTools}>Browse the library <ArrowRight size={16} /></button>
          </div>
          <div className="process-steps">
            <article className="process-step">
              <span className="step-index">01</span><div><h3>Find your tool</h3><p>Search by what you need to do, or narrow the list by category.</p></div><Search size={20} />
            </article>
            <article className="process-step">
              <span className="step-index">02</span><div><h3>Choose your PDF</h3><p>Tools process documents on KTAS servers, not in your browser.</p></div><FileText size={20} />
            </article>
            <article className="process-step">
              <span className="step-index">03</span><div><h3>Check the result</h3><p>Review the output and its limits before you use it. Your source stays yours.</p></div><Check size={20} />
            </article>
          </div>
        </section>

        <section className="trust-strip" id="about">
          <div className="trust-icon"><Shield size={22} /></div>
          <div className="trust-copy"><p className="section-kicker">A NOTE ON YOUR DOCUMENTS</p><h2>Practical privacy.<br />No grand claims.</h2></div>
          <p>PDF processing happens on KTAS servers. Documents aren't sent to external document or AI APIs, and document history isn't kept. Free tools are supported by advertising—not paid accounts or subscriptions.</p>
          <a className="trust-link" href={`${COMPANY_SITE}`} target="_blank" rel="noreferrer">Meet Kali Tech and Services <ArrowUpRight size={15} /></a>
        </section>

        <section className="info-panels">
          <article className="info-panel guides-panel" id="guides">
            <div className="panel-mark">FIELD NOTES / 01</div>
            <h2>Know before<br />you click.</h2>
            <p>Short, practical guides to common PDF jobs—from combining files to understanding digital signatures.</p>
            <a href="#tool-finder" onClick={jumpToTools}>Explore tools and tips <ArrowRight size={16} /></a>
            <div className="panel-lines" aria-hidden="true"><i /><i /><i /></div>
          </article>
          <article className="info-panel about-panel" id="contact">
            <div className="panel-mark">BUILT BY KTAS</div>
            <h2>Free tools.<br />Clear purpose.</h2>
            <p>KTAS PDF Tools is a collection of 100 free utilities from Kali Tech and Services. No paid accounts. No subscriptions.</p>
            <a href={COMPANY_SITE} target="_blank" rel="noreferrer">About Kali Tech and Services <ArrowUpRight size={16} /></a>
            <div className="about-seal" aria-hidden="true">KT<br /><small>PDF</small></div>
          </article>
        </section>
      </main>

      <footer className="ktas-footer">
        <a href="#home" className="footer-brand"><span className="brand-icon"><FileText size={18} /></span> KTAS <b>PDF</b></a>
        <span>Free PDF utilities by Kali Tech and Services</span>
        <a href="#home" className="back-top">Back to top <ChevronDown size={14} /></a>
      </footer>

      {selected && (
        <div className="tool-dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }} onKeyDown={(event) => { if (event.key === 'Escape') setSelected(null); }}>
          <section className="tool-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" aria-label="Close tool preview" onClick={() => setSelected(null)}><X size={19} /></button>
            <div className="dialog-eyebrow"><span className="tile-icon"><ToolIcon name={selected.icon} /></span><span>{selected.category} / PDF TOOL</span></div>
            <h2 id="dialog-title">{selected.name}</h2>
            <p className="dialog-description">{selected.description}</p>
            <div className="preview-label"><span className="preview-dot" /> PREVIEW ONLY</div>
            <p className="dialog-preview-copy">This homepage concept demonstrates tool discovery only. Choosing a tool here does not open the live utility or process a document.</p>
            <div className="dialog-facts"><span><Shield size={15} /> Server-side processing</span><span><Check size={15} /> PDF files</span></div>
            {selected.limitations && <p className="dialog-limits"><b>Keep in mind</b>{selected.limitations}</p>}
            <button className="button-primary dialog-done" onClick={() => setSelected(null)}>Back to tools <ArrowRight size={16} /></button>
          </section>
        </div>
      )}
    </div>
  );
}