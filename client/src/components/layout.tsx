import { type ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, useReducedMotion } from 'framer-motion';
import { Wordmark } from '@/components/shared';
import { COMPANY_SITE, setCookiePref, useCookiePref } from '@/lib/util';
import { useState } from 'react';
import { ArrowRight, Check, Menu, X } from 'lucide-react';

const NAV = [
  { href: '/tools', label: 'All tools' },
  { href: '/pdf', label: 'PDF' },
  { href: '/word', label: 'Word' },
  { href: '/excel', label: 'Excel' },
  { href: '/image', label: 'Image' },
  { href: '/text', label: 'Text' },
  { href: '/guides', label: 'Guides' },
  { href: '/about', label: 'About' },
];

function CookieBanner({ forceOpen, onClose }: { forceOpen: boolean; onClose: () => void }) {
  const pref = useCookiePref();
  const reduceMotion = useReducedMotion();
  if (pref && !forceOpen) return null;
  const choose = (v: 'essential' | 'all') => {
    setCookiePref(v);
    onClose();
  };
  return (
    <motion.div
      initial={reduceMotion ? false : { y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-card-border bg-card p-5 shadow-2xl"
      data-testid="banner-cookies"
    >
      <p className="font-display text-base font-bold">Your cookie choice</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Essential storage saves your preference. With your permission, we record page visits, IP address, approximate country, device and OS for 30 days, and load enabled advertisements. File and text contents are never included.{' '}
        <Link href="/cookie-policy" className="text-primary underline">Read the cookie policy</Link>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-ink" onClick={() => choose('essential')} data-testid="button-cookies-essential">
          Essential only
        </button>
        <button className="btn btn-ghost" onClick={() => choose('all')} data-testid="button-cookies-all">
          Allow ads and analytics
        </button>
      </div>
    </motion.div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [showPrefs, setShowPrefs] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [loc]);

  return (
    <div className="ktas-new flex min-h-[100dvh] flex-col">
      <div className="ktas-topline site-topline">
        <span className="topline-mark" aria-hidden="true"><Check size={13} /></span>
        <span>Free everyday tools. No account required.</span>
        <span className="topline-sep">/</span><span>Supported by advertising</span>
      </div>
      <header className="w-full">
        <div className="ktas-nav">
          <Link href="/" data-testid="link-home" aria-label="KTAS Tools home">
            <Wordmark />
          </Link>
          <button className="mobile-menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-mobile-menu">
            {menuOpen ? <X /> : <Menu />}
          </button>
          <nav id="main-navigation" className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
            {NAV.map((n) => {
              const active = loc === n.href || (n.href !== '/tools' && loc.startsWith(n.href + '/'));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  data-testid={`link-nav-${n.label.toLowerCase()}`}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`nav-link ${active ? 'nav-link-active' : ''}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/tools" className="nav-action">Find a tool <ArrowRight size={15} /></Link>
        </div>
      </header>

      <motion.main
        key={loc}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
        className={`site-main ${loc === '/' || loc === '/tools' ? '' : 'content-page'}`}
      >
        {children}
      </motion.main>

      <footer className="site-footer border-t border-border">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
          <div>
            <p className="font-display text-2xl font-extrabold">KTAS Tools</p>
            <p className="mt-2 max-w-sm text-sm opacity-70">
              Free PDF, Word, Excel, image and text tools by{' '}
              <a href={COMPANY_SITE} target="_blank" rel="noreferrer" className="underline">
                Kali Tech and Services
              </a>
              . No accounts, no subscriptions. PDF, Word and Excel files are processed temporarily on KTAS servers; image and text tasks stay in your browser.
            </p>
          </div>
          <ul className="space-y-2 text-sm opacity-80">
            <li><Link href="/tools">All tools</Link></li>
            <li><Link href="/pdf">PDF tools</Link></li>
            <li><Link href="/word">Word tools</Link></li>
            <li><Link href="/excel">Excel tools</Link></li>
            <li><Link href="/image">Image tools</Link></li>
            <li><Link href="/text">Text tools</Link></li>
            <li><Link href="/guides">Guides</Link></li>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/contact">Contact</Link></li>
            <li><Link href="/admin">Owner admin panel</Link></li>
          </ul>
          <ul className="space-y-2 text-sm opacity-80">
            <li><Link href="/privacy">Privacy</Link></li>
            <li><Link href="/terms">Terms</Link></li>
            <li><Link href="/cookie-policy">Cookie policy</Link></li>
            <li>
              <button onClick={() => setShowPrefs(true)} className="underline" data-testid="button-cookie-prefs">
                Cookie preferences
              </button>
            </li>
          </ul>
        </div>
      </footer>
      <CookieBanner forceOpen={showPrefs} onClose={() => setShowPrefs(false)} />
    </div>
  );
}
