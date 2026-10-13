import { type ReactNode } from 'react';
import { Link } from 'wouter';
import { icons, FileText, ArrowUpRight, Megaphone } from 'lucide-react';
import type { PdfTool } from '@workspace/api-client-react';
import { toolHref, toolSection } from '@/lib/tools';

export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const pascal = name
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  const Cmp = (icons as Record<string, typeof FileText>)[pascal] ?? FileText;
  return <Cmp className={className} aria-hidden />;
}

export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`ktas-brand ${size === 'lg' ? 'text-3xl' : ''}`} data-testid="wordmark">
      <span className="brand-icon"><FileText size={19} strokeWidth={2.1} /></span>
      <span>KTAS <b>Tools</b><small>by Kali Tech and Services</small></span>
    </span>
  );
}

export { ManagedAd as AdSlot } from './managed-ad';

export function ToolCard({ tool, index }: { tool: PdfTool; index: number }) {
  const tones: Record<string, string> = {
    Organize: 'tone-organize', 'Convert to PDF': 'tone-convert',
    'Convert from PDF': 'tone-export', Optimize: 'tone-optimize',
    Edit: 'tone-edit', Security: 'tone-security', Intelligence: 'tone-intelligence',
  };
  return (
      <Link
        href={toolHref(tool)}
        data-testid={`card-tool-${tool.slug}`}
        className="tool-tile"
        style={{ animationDelay: `${Math.min(index, 9) * 35}ms` }}
      >
        <span className="tool-tile-top">
          <span className={`tile-icon ${tones[tool.category] ?? ''}`} style={{ backgroundColor: toolSection(tool) === 'image' ? '#bd5947' : toolSection(tool) === 'text' ? '#53788b' : undefined }}><ToolIcon name={tool.icon} /></span>
          <span className="tile-arrow"><ArrowUpRight size={16} /></span>
        </span>
        <span className="tile-title">{tool.name}</span>
        <span className="tile-description">{tool.description}</span>
        <span className="tile-bottom">
          {tool.category}<span className="tile-number">{toolSection(tool)}</span>
        </span>
      </Link>
  );
}

export function PageHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="mb-10 max-w-3xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] md:text-6xl">{title}</h1>
      {lead && <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{lead}</p>}
    </header>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="reading-panel max-w-3xl space-y-4 text-[15px] leading-relaxed [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
      {children}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6" data-testid="panel-error">
      <p className="font-display text-lg font-bold text-destructive">That did not work</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-ink mt-4" data-testid="button-retry">
          Try again
        </button>
      )}
    </div>
  );
}
