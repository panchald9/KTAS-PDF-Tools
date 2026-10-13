import { type ReactNode, useEffect } from 'react';
import { Link, useLocation } from './stubs';
import { motion } from 'framer-motion';
import { Wordmark } from './shared';
import { COMPANY_SITE, setCookiePref, useCookiePref } from './stubs';
import { useState } from 'react';

const NAV = [
  { href: '/tools', label: 'Tools' },
  { href: '/guides', label: 'Guides' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

function CookieBanner({ forceOpen, onClose }: { forceOpen: boolean; onClose: () => void }) {
  const pref = useCookiePref();
  if (pref && !forceOpen) return null;
  const choose = (v: 'essential' | 'all') => {
    setCookiePref(v);
    onClose();
  };
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-card-border bg-card p-5 shadow-2xl"
      data-testid="banner-cookies"
    >
      <p className="font-display text-base font-bold">Your cookie choice</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Essential storage keeps this preference. Advertising cookies would only apply once ads are switched on. Nothing advertising-related runs today.{' '}
        <Link href="/cookie-policy" className="text-primary underline">Read the cookie policy</Link>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-ink" onClick={() => choose('essential')} data-testid="button-cookies-essential">
          Essential only
        </button>
        <button className="btn btn-ghost" onClick={() => choose('all')} data-testid="button-cookies-all">
          Allow advertising cookies
        </button>
      </div>
    </motion.div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [showPrefs, setShowPrefs] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [loc]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="/" data-testid="link-home" aria-label="KTAS PDF home">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            {NAV.map((n) => {
              const active = loc === n.href || (n.href !== '/' && loc.startsWith(n.href + '/'));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  data-testid={`link-nav-${n.label.toLowerCase()}`}
                  className={`relative rounded-lg px-2.5 py-1.5 transition-colors hover:bg-accent sm:px-3 ${
                    active ? 'text-primary' : ''
                  } ${n.label === 'Contact' ? 'hidden sm:block' : ''}`}
                >
                  {n.label}
                  {active && (
                    <motion.span layoutId="nav-underline" className="absolute inset-x-2.5 -bottom-[13px] h-0.5 bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <motion.main
        key={loc}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 md:px-6 md:py-14"
      >
        {children}
      </motion.main>

      <footer className="border-t border-border bg-foreground text-background">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-6">
          <div>
            <p className="font-display text-2xl font-extrabold">KTAS PDF</p>
            <p className="mt-2 max-w-sm text-sm opacity-70">
              Free document tools by{' '}
              <a href={COMPANY_SITE} target="_blank" rel="noreferrer" className="underline">
                Kali Tech and Services
              </a>
              . No accounts, no subscriptions. Supported by advertising.
            </p>
          </div>
          <ul className="space-y-2 text-sm opacity-80">
            <li><Link href="/tools">All tools</Link></li>
            <li><Link href="/guides">Guides</Link></li>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/contact">Contact</Link></li>
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
