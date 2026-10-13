import { useEffect, useRef, useState } from 'react';
import { useGetPublicConfig, getGetPublicConfigQueryKey } from '@workspace/api-client-react';
import { useCookiePref, readCookiePref } from '@/lib/util';
import { Megaphone } from 'lucide-react';

let adLoader: { publisher: string; promise: Promise<void> } | undefined;
function loadAdSense(publisher: string) {
  if (adLoader?.publisher === publisher) return adLoader.promise;
  const promise = new Promise<void>((resolve, reject) => {
    document.getElementById('ktas-adsense-loader')?.remove();
    const script = document.createElement('script');
    script.id = 'ktas-adsense-loader';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisher}`;
    script.onload = () => resolve();
    script.onerror = () => { adLoader = undefined; reject(new Error('Advertisement could not be loaded.')); };
    document.head.appendChild(script);
  });
  adLoader = { publisher, promise };
  return promise;
}

export function ManagedAd({ name, className = '', format = 'banner' }: {
  name: string; className?: string; format?: 'banner' | 'rectangle';
}) {
  const { data, isError } = useGetPublicConfig({ query: { queryKey: getGetPublicConfigQueryKey(), refetchInterval: 60_000 } });
  const pref = useCookiePref();
  const slot = data?.slots.find((entry) => entry.name === name);
  const publisher = data?.settings.adsPublisherId ?? '';
  const active = pref === 'all' && !!data?.settings.adsEnabled && !!slot?.enabled;
  const adRef = useRef<HTMLModElement>(null);
  const [loadError, setLoadError] = useState(false);
  const isAdSense = active && slot?.type === 'adsense' && /^ca-pub-[0-9]{16}$/.test(publisher);
  useEffect(() => {
    setLoadError(false);
    if (!isAdSense || !slot?.adUnit) return;
    let cancelled = false;
    loadAdSense(publisher).then(() => {
      if (cancelled || readCookiePref() !== 'all' || !adRef.current || adRef.current.hasAttribute('data-adsbygoogle-status')) return;
      const win = window as Window & { adsbygoogle?: Record<string, unknown>[] };
      (win.adsbygoogle = win.adsbygoogle || []).push({});
    }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [isAdSense, publisher, slot?.adUnit]);
  return (
    <aside aria-label="Advertisement" data-testid={`ad-slot-${name}`} data-ad-format={format} className={`ad-slot ad-slot-${format} ${className}`}>
      <p className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        <Megaphone className="h-3 w-3" /> {active && slot?.type === 'sponsor' ? 'Sponsored advertisement' : 'Advertisements'}
      </p>
      {active && slot?.type === 'sponsor' ? (
        <a href={slot.link} target="_blank" rel="sponsored noopener noreferrer" className="mt-3 block max-w-2xl text-left">
          {slot.imageUrl && <img src={slot.imageUrl} alt={slot.title} loading="lazy" className="mb-3 max-h-44 w-full rounded object-contain" />}
          <strong className="text-lg text-foreground">{slot.title}</strong>
          {slot.text && <p className="mt-1 text-sm text-muted-foreground">{slot.text}</p>}
        </a>
      ) : isAdSense && !loadError ? (
        <ins key={`${publisher}-${slot?.adUnit}`} ref={adRef} className="adsbygoogle" style={{ display: 'block', width: '100%', minHeight: format === 'rectangle' ? 250 : 90 }}
          data-ad-client={publisher} data-ad-slot={slot?.adUnit} data-ad-format="auto" data-full-width-responsive="true" />
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {isError ? 'Advertisement settings are temporarily unavailable.' : loadError ? 'Advertisement could not be loaded.' :
            active && slot?.type === 'adsense' ? 'A valid publisher ID is required before this advertisement can load.' :
              data?.settings.adsEnabled && slot?.enabled && pref !== 'all' ? 'Advertising is off for your current cookie preference.' :
                'Reserved advertising space. No ad is active in this placement.'}
        </p>
      )}
    </aside>
  );
}