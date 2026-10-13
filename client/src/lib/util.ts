import { useEffect, useState } from 'react';

export const COMPANY_SITE = 'https://kalitechandservices.com';
export const COMPANY_CONTACT = 'https://kalitechandservices.com/index.php/contact-us/';

export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function readFileBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(f);
  });
}

export function base64ToBlobUrl(b64: string, mime: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
}

export function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith('.')) return name.endsWith(t);
    if (t.endsWith('/*')) return type.startsWith(t.slice(0, -1));
    return type === t;
  });
}

export function errorMessage(err: unknown): string {
  const e = err as { data?: { error?: string; message?: string } | string; message?: string } | null;
  if (!e) return 'Something went wrong.';
  if (e.data && typeof e.data === 'object') {
    if (e.data.error) return e.data.error;
    if (e.data.message) return e.data.message;
  }
  if (typeof e.data === 'string' && e.data) return e.data;
  return e.message || 'Something went wrong.';
}

export function useMeta(title: string, description: string) {
  useEffect(() => {
    const full = title.includes('KTAS') ? title : `${title} | KTAS Tools`;
    document.title = full;
    const set = (attr: 'name' | 'property', key: string, val: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', val);
    };
    set('name', 'description', description);
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    const path = window.location.pathname.slice(basePath.length) || '/';
    const unindexable = /^\/(admin|sign-in|sign-up)(\/|$)/.test(path) || /not found/i.test(title);
    set('name', 'robots', unindexable ? 'noindex, nofollow' : 'index, follow');
    set('property', 'og:title', full);
    set('property', 'og:description', description);
    set('property', 'og:type', 'website');
    set('property', 'og:site_name', 'KTAS Tools');
    set('name', 'twitter:card', 'summary');
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `https://ktastools.com${path}`;
    set('property', 'og:url', canonical.href);
    let structured = document.getElementById('seo-structured');
    if (unindexable) structured?.remove();
    else {
      if (!structured) {
        structured = document.createElement('script');
        structured.id = 'seo-structured';
        structured.setAttribute('type', 'application/ld+json');
        document.head.appendChild(structured);
      }
      structured.textContent = JSON.stringify(/^\/(pdf|word|excel|image|text)\/[^/]+$/.test(path) ? {
        '@context': 'https://schema.org', '@type': 'WebApplication',
        name: title.replace(/\s*—.*$/, ''), description, url: canonical.href,
        applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web browser',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      } : {
        '@context': 'https://schema.org', '@type': 'WebSite', name: 'KTAS Tools', url: 'https://ktastools.com', description,
      });
    }
  }, [title, description]);
}

export type CookiePref = 'essential' | 'all' | null;
// Ask again when purposes change: prior advertising-only permission isn't analytics consent.
const KEY = 'ktas-cookie-pref-v2';
const EVT = 'ktas-cookie-change';

export function readCookiePref(): CookiePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'essential' || v === 'all' ? v : null;
  } catch {
    return null;
  }
}

export function setCookiePref(v: CookiePref) {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVT));
}

export function useCookiePref(): CookiePref {
  const [pref, setPref] = useState<CookiePref>(readCookiePref);
  useEffect(() => {
    const h = () => setPref(readCookiePref());
    window.addEventListener(EVT, h);
    window.addEventListener('storage', h);
    return () => {
      window.removeEventListener(EVT, h);
      window.removeEventListener('storage', h);
    };
  }, []);
  return pref;
}
