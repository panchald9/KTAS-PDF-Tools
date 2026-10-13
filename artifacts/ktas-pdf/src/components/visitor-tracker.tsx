import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useGetPublicConfig, trackPageView, getGetPublicConfigQueryKey } from '@workspace/api-client-react';
import { useCookiePref } from '@/lib/util';

const key = 'ktas-consented-visitor';
export function VisitorTracker() {
  const [path] = useLocation();
  const pref = useCookiePref();
  const { data } = useGetPublicConfig({ query: { queryKey: getGetPublicConfigQueryKey(), refetchInterval: 60_000 } });
  const sent = useRef('');
  useEffect(() => {
    const browser = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (pref !== 'all') {
      sent.current = '';
      try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
      return;
    }
    if (!data?.settings.analyticsEnabled || navigator.doNotTrack === '1' || browser.globalPrivacyControl ||
        /^\/(admin|sign-in|sign-up)(\/|$)/.test(path) || sent.current === path) return;
    let visitorId = crypto.randomUUID();
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved?.expires > Date.now() && typeof saved.id === 'string') visitorId = saved.id;
      else localStorage.setItem(key, JSON.stringify({ id: visitorId, expires: Date.now() + 30 * 86400_000 }));
    } catch { /* A temporary anonymous ID still allows a consented page view. */ }
    sent.current = path;
    const timer = window.setTimeout(() => {
      void trackPageView({
        id: crypto.randomUUID(), visitorId, path: path.split(/[?#]/)[0] || '/',
        referrer: document.referrer, consent: true,
      }).catch(() => { /* Analytics must never interrupt document processing. */ });
    }, 400);
    return () => { window.clearTimeout(timer); sent.current = ''; };
  }, [path, pref, data?.settings.analyticsEnabled]);
  return null;
}