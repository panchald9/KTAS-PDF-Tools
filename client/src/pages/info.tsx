import { Link } from 'wouter';
import { ArrowUpRight, Clock } from 'lucide-react';
import { GUIDES } from '@/lib/guides';
import { COMPANY_CONTACT, COMPANY_SITE, setCookiePref, useCookiePref, useMeta } from '@/lib/util';
import { AdSlot, PageHeading, Prose, ToolCard } from '@/components/shared';
import NotFound from '@/pages/not-found';
import { useGetSiteConfig } from '@workspace/api-client-react';
import { useTools } from '@/lib/tools';

export function GuidesIndex() {
  useMeta('Guides', 'Original, practical guides for compressing, merging, signing and converting PDF documents.');
  return (
    <div>
      <PageHeading eyebrow="Guides" title="Practical, not padded" lead="Short original guides written around what the tools really do, including where they fall short." />
      <AdSlot name="guides-top" className="mb-10" />
      <div className="grid gap-4 md:grid-cols-2">
        {GUIDES.map((g, i) => (
          <Link
            key={g.slug}
            href={`/guides/${g.slug}`}
            data-testid={`card-guide-${g.slug}`}
            className={`group rounded-2xl border border-card-border bg-card p-6 paper-shadow transition-all hover:-translate-y-1 hover:border-primary/60 ${i === 0 ? 'md:col-span-2' : ''}`}
          >
            <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"><Clock className="h-3 w-3" /> {g.minutes} min read</span>
            <span className="mt-2 block font-display text-2xl font-bold">{g.title}</span>
            <span className="mt-2 block text-muted-foreground">{g.summary}</span>
            <ArrowUpRight className="mt-4 h-5 w-5 text-primary transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
      <AdSlot name="guides-index" className="mt-10" />
    </div>
  );
}

export function GuidePage({ slug }: { slug: string }) {
  const g = GUIDES.find((x) => x.slug === slug);
  const { tools } = useTools();
  useMeta(g?.title ?? 'Guide not found', g?.summary ?? 'Guide not found.');
  if (!g) return <NotFound />;
  const keyword = slug.includes('shrink') ? 'compress' : slug.includes('merge') ? 'merge' : slug.includes('locked') ? 'unlock' : slug.includes('signature') ? 'sign' : slug.includes('converting') ? 'convert' : 'extract';
  const related = (tools ?? []).filter((tool) => (tool.section ?? 'pdf') === 'pdf' && `${tool.name} ${tool.description} ${tool.slug}`.toLowerCase().includes(keyword)).slice(0, 3);
  return (
    <article>
      <Link href="/guides" className="text-sm text-muted-foreground hover:text-foreground">All guides</Link>
      <div className="mt-4">
        <PageHeading eyebrow={`${g.minutes} min read`} title={g.title} lead={g.summary} />
      </div>
      <AdSlot name="guide-top" className="mb-10 max-w-3xl" />
      <Prose>
        {g.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
      </Prose>
      {related.length > 0 && <section className="mt-12"><p className="section-kicker">RELATED PDF TOOLS</p><h2 className="mb-5 mt-2 text-2xl font-bold">Put this into practice.</h2><div className="tool-grid">{related.map((tool, index) => <ToolCard key={tool.slug} tool={tool} index={index} />)}</div></section>}
      <AdSlot name="guide-article" className="mt-12 max-w-2xl" />
      <Link href="/tools" className="btn btn-primary mt-8">Browse the tools</Link>
    </article>
  );
}

export function About() {
  useMeta('About KTAS Tools', 'Free PDF, Word, Excel, image and text tools from Kali Tech and Services, supported by advertising rather than subscriptions.');
  const { data: cfg } = useGetSiteConfig();
  const { tools } = useTools();
  const counts = { pdf: tools?.filter((tool) => !tool.section || tool.section === 'pdf').length, word: tools?.filter((tool) => tool.section === 'word').length, excel: tools?.filter((tool) => tool.section === 'excel').length, image: tools?.filter((tool) => tool.section === 'image').length, text: tools?.filter((tool) => tool.section === 'text').length };
  return (
    <div>
      <PageHeading eyebrow="About" title="Honest tools, paid for by ads" lead="KTAS Tools is a free everyday toolkit from Kali Tech and Services (KTAS)." />
      <Prose>
        <p>Many task sites hide the price behind a result. They show a success screen, then ask for a subscription to download. KTAS Tools keeps everyday PDF, Word, image and writing tasks free, with clear limits and direct access to the result.</p>
        <h2>How it is funded</h2>
        <p>The site is supported by advertising, with clear consent controls and labelled placements. There are no subscriptions or paid plans. The owner-only admin area is protected separately.</p>
        <h2>How your files are handled</h2>
        <p>PDFs, Word documents and Excel workbooks are sent over HTTPS and processed temporarily on KTAS servers (Excel is not processed in your browser or by external APIs); temporary files are removed after processing and document history is not stored. Image and text tasks run locally in your browser and their contents are not uploaded. We do not send work to third-party AI services.</p>
        <p>Directory tools: {counts.pdf ?? '—'} PDF, {counts.word ?? '—'} Word, {counts.excel ?? '—'} Excel, {counts.image ?? '—'} image and {counts.text ?? '—'} text. Counts reflect the current public API catalog.</p>
        {cfg && <p>PDF limits: {cfg.maxFiles} files per request, up to {cfg.maxPages} pages, and {Math.round(cfg.maxFileBytes / 1048576)} MB per file.</p>}
        <h2>What we do not promise</h2>
        <p>Converting a PDF can shift layout, and scanned pages may not yield text. Each tool lists its own limitations before you use it.</p>
        <p>Company website: <a href={COMPANY_SITE} target="_blank" rel="noreferrer">Kali Tech and Services</a>.</p>
      </Prose>
    </div>
  );
}

export function Contact() {
  useMeta('Contact', 'Reach Kali Tech and Services through the official company website.');
  return (
    <div>
      <PageHeading eyebrow="Contact" title="Talk to the people behind it" lead="Support and business enquiries go through the official Kali Tech and Services website." />
      <div className="max-w-xl rounded-2xl border border-card-border bg-card p-8 paper-shadow">
        <p className="text-muted-foreground">We do not run a form on this page, so nothing you type here is collected. Use the official contact channels instead.</p>
        <a href={COMPANY_CONTACT} target="_blank" rel="noreferrer" className="btn btn-primary mt-5" data-testid="link-company-contact">
          Open the official contact page <ArrowUpRight className="h-4 w-4" />
        </a>
        <p className="mt-4 text-xs text-muted-foreground">Please do not send documents or passwords in a message.</p>
      </div>
    </div>
  );
}

export function Privacy() {
  useMeta('Privacy', 'How KTAS Tools handles temporarily server-processed PDF, Word and Excel files, browser-local images and text, analytics and advertisements.');
  const { data: cfg } = useGetSiteConfig();
  return (
    <div>
      <PageHeading eyebrow="Legal" title="Privacy" lead="Plain statements about what happens to your documents." />
      <Prose>
        <h2>Your documents</h2>
        <ul>
          <li>PDF, Word and Excel files are uploaded over HTTPS to KTAS servers (never to external APIs) for processing in private temporary locations. Temporary files are removed after processing.</li>
          <li>Image and text tools run in your browser. Their content is not sent to KTAS servers or third-party processing services.</li>
          <li>KTAS does not store PDF, Word or Excel document history. Owner administration uses secure authentication.</li>
          <li>No files or extracted text are sent to external AI or document services.</li>
        </ul>
        {cfg?.retention && <p>Server retention note: {cfg.retention}</p>}
        <h2>Passwords</h2>
        <p>If a tool requests a document password, it is sent with that operation only.</p>
        <h2>Browser storage</h2>
        <p>We save your cookie preference in your browser's local storage. See the <Link href="/cookie-policy">cookie policy</Link>.</p>
        <h2>Advertising</h2>
        <p>Advertisements load only after you allow ads and analytics and the owner enables a placement. Third-party ad providers may use cookies according to their own policies. Sponsored images and links are also withheld until consent.</p>
        <h2>Visitor analytics</h2>
        <p>After you choose “Allow ads and analytics”, we record page visits, a pseudonymous browser identifier, IP address, approximate country, device type, browser, operating system, referral website hostname, and visit time. Country is estimated using a local IP database; VPNs and shared networks can make it inaccurate. We do not identify you by name or collect PDF or Word contents, file names, page queries, or document results in analytics.</p>
        <p>Only the verified website owner can access visitor reports. Records are automatically deleted after 30 days and may be cleared sooner by the owner. Counts represent consented browsers, not verified people. We honor browser Do Not Track and Global Privacy Control signals.</p>
        <p>You can stop future tracking through <Link href="/cookie-policy">cookie preferences</Link>. Choosing Essential only removes the analytics identifier from this browser. Contact us through the official company website for privacy requests.</p>
        <h2>Contact</h2>
        <p>Questions go through the <Link href="/contact">contact page</Link>.</p>
      </Prose>
    </div>
  );
}

export function Terms() {
  useMeta('Terms of use', 'Terms for using KTAS Tools.');
  return (
    <div>
      <PageHeading eyebrow="Legal" title="Terms of use" />
      <Prose>
        <p>KTAS Tools is provided free and as is. Use it only with files and text you have the right to process.</p>
        <h2>Output</h2>
        <p>Results can differ from the source, especially after format conversion. You are responsible for checking output before relying on it. We do not guarantee fidelity, availability or fitness for a particular purpose.</p>
        <h2>Acceptable use</h2>
        <p>Do not use the service to unlock files you are not authorised to open, to break the law, or to overload the service. Limits on size, files and pages apply.</p>
        <h2>Signatures</h2>
        <p>Signing tools add a basic visual e-signature. They do not create certificate-based digital signatures.</p>
        <h2>Changes</h2>
        <p>These terms may change as the service develops.</p>
      </Prose>
    </div>
  );
}

export function CookiePolicy() {
  useMeta('Cookie policy', 'Cookie and advertising information for KTAS Tools, with a preference control.');
  const pref = useCookiePref();
  return (
    <div>
      <PageHeading eyebrow="Legal" title="Cookie policy" />
      <Prose>
        <h2>What is stored today</h2>
        <p>Your cookie preference is stored locally. If you allow ads and analytics, we also store a random analytics identifier for up to 30 days and record consented page visits. Essential only prevents visitor analytics and advertising requests. Secure administration uses authentication cookies.</p>
        <h2>Advertising</h2>
        <p>The site is funded by advertising. When enabled and permitted below, advertising partners may set cookies to serve and measure ads. Analytics records IP address, approximate country, device, browser, OS and visit time, retained for 30 days; document, image and text contents are not tracked. A regional consent-management platform may also be required before third-party ads go live. Nothing here claims approval by any ad network.</p>
      </Prose>
      <div className="mt-8 max-w-xl rounded-2xl border border-card-border bg-card p-6">
        <p className="font-display text-lg font-bold">Your preference</p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="text-cookie-pref">
          {pref === 'all' ? 'Ads and visitor analytics allowed.' : pref === 'essential' ? 'Essential only. Ads and visitor analytics are off.' : 'No choice made yet. Ads and visitor analytics are off.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-ink" onClick={() => setCookiePref('essential')} data-testid="button-pref-essential">Essential only</button>
          <button className="btn btn-ghost" onClick={() => setCookiePref('all')} data-testid="button-pref-all">Allow ads and analytics</button>
          <button className="btn btn-ghost" onClick={() => setCookiePref(null)} data-testid="button-pref-reset">Reset</button>
        </div>
      </div>
    </div>
  );
}
