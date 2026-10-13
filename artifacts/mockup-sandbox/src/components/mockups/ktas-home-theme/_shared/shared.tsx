import { type ReactNode } from 'react';
import { Link } from './stubs';
import { motion } from 'framer-motion';
import { icons, FileText, ArrowUpRight, Megaphone } from 'lucide-react';
import type { PdfTool } from './stubs';

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
    <span className="inline-flex items-center gap-2" data-testid="wordmark">
      <span
        className={`relative inline-flex items-center justify-center bg-primary text-primary-foreground font-display font-extrabold ${
          size === 'lg' ? 'h-12 w-10 text-xl' : 'h-8 w-7 text-sm'
        } rounded-[3px]`}
        style={{ clipPath: 'polygon(0 0, 70% 0, 100% 24%, 100% 100%, 0 100%)' }}
      >
        K
      </span>
      <span className={`font-display font-extrabold tracking-tight ${size === 'lg' ? 'text-3xl' : 'text-xl'}`}>
        KTAS<span className="text-primary"> PDF</span>
      </span>
    </span>
  );
}

export function AdSlot({ name, className = '' }: { name: string; className?: string }) {
  return (
    <aside
      aria-label="Advertisement"
      data-testid={`ad-slot-${name}`}
      className={`rounded-xl border border-dashed border-input bg-muted/50 px-4 py-6 text-center ${className}`}
    >
      <p className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        <Megaphone className="h-3 w-3" /> Advertisement
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Reserved space. Ads are not configured yet, and nothing here loads third-party scripts.
      </p>
    </aside>
  );
}

export function ToolCard({ tool, index }: { tool: PdfTool; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.03, duration: 0.35 }}
      layout
    >
      <Link
        href={`/${tool.slug}`}
        data-testid={`card-tool-${tool.slug}`}
        className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-card-border bg-card p-5 paper-shadow transition-all duration-300 hover:-translate-y-1 hover:border-primary/60"
      >
        <span
          aria-hidden
          className="absolute right-0 top-0 h-6 w-6 bg-background transition-all duration-300 group-hover:h-9 group-hover:w-9"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)', boxShadow: 'none' }}
        />
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-foreground transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
          <ToolIcon name={tool.icon} className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-bold leading-tight">{tool.name}</span>
        <span className="text-sm leading-relaxed text-muted-foreground">{tool.description}</span>
        <span className="mt-auto flex items-center justify-between pt-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          {tool.category}
          <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
        </span>
      </Link>
    </motion.div>
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
    <div className="max-w-2xl space-y-4 text-[15px] leading-relaxed [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
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
