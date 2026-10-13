import { UserButton } from '@clerk/react';
import {
  getGetAdminAdvertisingQueryKey,
  getGetAdminAnalyticsQueryKey,
  getGetAdminToolsQueryKey,
  getGetAdminVisitorsQueryKey,
  getGetPublicConfigQueryKey,
  getListToolsQueryKey,
  useClearAdminAnalytics,
  useDeleteAdminAd,
  useGetAdminAdvertising,
  useGetAdminAnalytics,
  useGetAdminTools,
  useGetAdminVisitors,
  useResetAdminTool,
  useSaveAdminAd,
  useSaveAdminSettings,
  useSaveAdminTool,
} from '@workspace/api-client-react';
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  Eye,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Megaphone,
  Pencil,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { errorMessage } from '../lib/util';
import '../styles/admin.css';

type Section = 'overview' | 'visitors' | 'tools' | 'advertising' | 'settings';
type Notice = { kind: 'success' | 'error'; text: string } | null;

const sections: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'visitors', label: 'Visitor records', icon: Eye },
  { id: 'tools', label: 'Tool directory', icon: Wrench },
  { id: 'advertising', label: 'Advertising', icon: Megaphone },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

const formatNumber = (n?: number) => new Intl.NumberFormat('en-IN').format(n ?? 0);
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
const validSections: Section[] = ['overview', 'visitors', 'tools', 'advertising', 'settings'];
const publisherPattern = /^ca-pub-[0-9]{16}$/;
const unitPattern = /^[0-9]{10}$/;

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>(() => {
    const value = window.location.hash.replace(/^#\/?/, '');
    return validSections.includes(value as Section) ? value as Section : 'overview';
  });
  const [days, setDays] = useState<7 | 30>(7);
  const [visitorPage, setVisitorPage] = useState(1);
  const [toolSearch, setToolSearch] = useState('');
  const [toolFilter, setToolFilter] = useState<'all' | 'pdf' | 'image' | 'text' | 'word' | 'excel'>('all');
  const [toolVisibility, setToolVisibility] = useState<'all' | 'enabled' | 'hidden'>('all');
  const [toolPopularity, setToolPopularity] = useState<'all' | 'popular'>('all');
  const [toolEdit, setToolEdit] = useState<string | null>(null);
  const [adEdit, setAdEdit] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [settings, setSettings] = useState({
    adsEnabled: false,
    adsPublisherId: '',
    analyticsEnabled: false,
  });
  const [toolDraft, setToolDraft] = useState({
    name: '',
    description: '',
    enabled: true,
    popular: false,
  });
  const [adDraft, setAdDraft] = useState({
    enabled: false,
    type: 'sponsor' as 'sponsor' | 'adsense',
    title: '',
    text: '',
    link: '',
    imageUrl: '',
    adUnit: '',
  });
  const [slotName, setSlotName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const actionLock = useRef(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [savedSettings, setSavedSettings] = useState(settings);
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const [pendingSection, setPendingSection] = useState<Section | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const modalRef = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const sectionRef = useRef(section);
  const settingsDirtyRef = useRef(settingsDirty);
  sectionRef.current = section;
  settingsDirtyRef.current = settingsDirty;

  const analytics = useGetAdminAnalytics({ days }, { query: { queryKey: getGetAdminAnalyticsQueryKey({ days }), staleTime: 30_000, refetchInterval: 120_000 } });
  const visitors = useGetAdminVisitors({ days, page: visitorPage }, { query: { queryKey: getGetAdminVisitorsQueryKey({ days, page: visitorPage }), staleTime: 30_000, refetchInterval: 120_000 } });
  const tools = useGetAdminTools({ query: { queryKey: getGetAdminToolsQueryKey(), staleTime: 30_000, refetchInterval: 120_000 } });
  const advertising = useGetAdminAdvertising({ query: { queryKey: getGetAdminAdvertisingQueryKey(), staleTime: 30_000, refetchInterval: 120_000 } });
  const saveTool = useSaveAdminTool();
  const resetTool = useResetAdminTool();
  const saveSettings = useSaveAdminSettings();
  const saveAd = useSaveAdminAd();
  const deleteAd = useDeleteAdminAd();
  const clearAnalytics = useClearAdminAnalytics();

  useEffect(() => {
    if (advertising.data?.settings && !settingsDirty) {
      setSettings(advertising.data.settings);
      setSavedSettings(advertising.data.settings);
    }
  }, [advertising.data?.settings, settingsDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!settingsDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [settingsDirty]);
  useEffect(() => {
    const next = window.location.hash.replace(/^#\/?/, '');
    if (validSections.includes(next as Section)) setSection(next as Section);
  }, []);
  useEffect(() => {
    const sync = () => {
      const next = window.location.hash.replace(/^#\/?/, '');
      if (sectionRef.current === 'settings' && settingsDirtyRef.current && validSections.includes(next as Section) && next !== 'settings') {
        setPendingSection(next as Section);
        setLeaveConfirm(true);
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/settings`);
        return;
      }
      if (validSections.includes(next as Section)) setSection(next as Section);
      else setSection('overview');
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    const dialogOpen = !!toolEdit || !!adEdit || leaveConfirm;
    if (!dialogOpen) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const frame = window.requestAnimationFrame(() => modalRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !actionBusy) {
        setToolEdit(null); setAdEdit(null); setLeaveConfirm(false);
      }
      if (event.key === 'Tab' && modalRef.current) {
        const items = [...modalRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey); previousFocus.current?.focus(); };
  }, [toolEdit, adEdit, leaveConfirm, actionBusy]);

  const refreshAdmin = async () => {
    setRefreshing(true);
    try {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: getGetAdminAdvertisingQueryKey() }),
      queryClient.refetchQueries({ queryKey: getGetAdminAnalyticsQueryKey() }),
      queryClient.refetchQueries({ queryKey: getGetAdminVisitorsQueryKey() }),
      queryClient.refetchQueries({ queryKey: getGetAdminToolsQueryKey() }),
    ]);
    setLastUpdated(new Date());
    } finally { setRefreshing(false); }
  };
  const refreshPublic = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetPublicConfigQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListToolsQueryKey() }),
    ]);
  };
  const announce = (kind: 'success' | 'error', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 5000);
  };
  const runAction = async (
    operation: () => Promise<unknown>,
    successText: string,
    publicChange = false,
  ) => {
    if (actionLock.current) return false;
    actionLock.current = true;
    setActionBusy(true);
    try {
      await operation();
      await refreshAdmin();
      if (publicChange) await refreshPublic();
      announce('success', successText);
      return true;
    } catch (error) {
      await refreshAdmin();
      if (publicChange) await refreshPublic();
      announce('error', errorMessage(error));
      return false;
    } finally {
      actionLock.current = false;
      setActionBusy(false);
    }
  };

  const visibleTools = useMemo(
    () =>
      (tools.data ?? []).filter((tool) =>
        (toolFilter === 'all' || (tool.section ?? 'pdf') === toolFilter) &&
        (toolVisibility === 'all' || (toolVisibility === 'enabled' ? tool.enabled : !tool.enabled)) &&
        (toolPopularity === 'all' || tool.popular) &&
        `${tool.name} ${tool.description} ${tool.category} ${tool.slug}`
          .toLowerCase().includes(toolSearch.toLowerCase()),
      ),
    [tools.data, toolSearch, toolFilter, toolVisibility, toolPopularity],
  );
  const currentTool = tools.data?.find((tool) => tool.slug === toolEdit);
  const totalPages = visitors.data
    ? Math.max(1, Math.ceil(visitors.data.total / visitors.data.pageSize))
    : 1;
  useEffect(() => {
    if (visitors.data && visitorPage > totalPages) setVisitorPage(totalPages);
  }, [visitors.data, visitorPage, totalPages]);
  const navigate = (next: Section) => {
    if (actionLock.current) return;
    if (section === 'settings' && settingsDirty && next !== 'settings') {
      setPendingSection(next); setLeaveConfirm(true); return;
    }
    window.location.hash = `/${next}`;
  };
  const discardSettings = () => {
    setSettings(savedSettings);
  };

  const editTool = (slug: string) => {
    const tool = tools.data?.find((item) => item.slug === slug);
    if (!tool) return;
    setToolDraft({
      name: tool.name,
      description: tool.description,
      enabled: tool.enabled,
      popular: tool.popular,
    });
    setToolEdit(slug);
  };
  const editAd = (name: string) => {
    const slot = advertising.data?.slots.find((item) => item.name === name);
    if (!slot) return;
    setSlotName(slot.name);
    setAdDraft({
      enabled: slot.enabled,
      type: slot.type,
      title: slot.title,
      text: slot.text,
      link: slot.link,
      imageUrl: slot.imageUrl,
      adUnit: slot.adUnit,
    });
    setAdEdit(name);
    setNewSlot(false);
  };
  const startNewSlot = () => {
    setSlotName('');
    setAdDraft({
      enabled: false,
      type: 'sponsor',
      title: '',
      text: '',
      link: '',
      imageUrl: '',
      adUnit: '',
    });
    setNewSlot(true);
    setAdEdit('__new__');
  };
  const saveSlot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = slotName.trim();
    if (!name) {
      announce('error', 'Enter a placement key to save this configuration.');
      return;
    }
    if (adDraft.enabled && adDraft.type === 'adsense') {
      const publisher = advertising.data?.settings.adsPublisherId ?? '';
      if (!publisherPattern.test(publisher)) {
        announce('error', 'Save a valid AdSense publisher ID in Global settings before enabling this placement.');
        return;
      }
      if (!unitPattern.test(adDraft.adUnit)) {
        announce('error', 'Enter a valid 10-digit AdSense unit ID before enabling this placement.');
        return;
      }
    }
    const saved = await runAction(() => saveAd.mutateAsync({ name, data: adDraft }), 'Placement configuration saved.', true);
    if (saved) {
      setAdEdit(null);
      setNewSlot(false);
    }
  };

  return (
    <div className="admin-shell">
      <aside className="admin-rail">
        <a className="admin-brand" href={import.meta.env.BASE_URL} aria-label="KTAS Tools home">
          <span className="admin-brand-mark">K</span>
          <span>KTAS <b>TOOLS</b><small>OWNER CONSOLE</small></span>
        </a>
        <div className="admin-rail-label">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Admin sections">
          {sections.map(({ id, label, icon: Icon }, index) => (
            <button
              type="button"
              data-testid={`nav-${id}`}
              disabled={actionBusy}
              className={`admin-nav-item ${section === id ? 'is-active' : ''}`}
              onClick={() => navigate(id)}
              key={id}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {section === id && <span className="nav-index">0{index + 1}</span>}
            </button>
          ))}
        </nav>
          <div className="admin-rail-bottom">
          <div className="privacy-card">
            <ShieldCheck size={17} />
            <b>Private workspace</b>
            <span>Owner access only</span>
          </div>
          <a className="admin-back-link" href={import.meta.env.BASE_URL}>
            <ArrowLeft size={15} /> Back to website
          </a>
          <div className="admin-rail-foot">KTAS TOOLS <span>·</span> ADMIN</div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="breadcrumb"><span>KTAS TOOLS</span><b>/</b> Owner dashboard</div>
          <div className="topbar-actions">
            <a className="site-link" href={import.meta.env.BASE_URL} data-testid="link-public-site"><ExternalLink size={14} /> View public site</a>
            <span className="topbar-divider" />
            <UserButton />
          </div>
        </header>

        <div className="admin-content">
          <div className="admin-refresh-line">
            <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST` : 'Live data · refreshes every 2 minutes'}</span>
             <button className="button-secondary refresh-button" type="button" disabled={refreshing || actionBusy} onClick={() => void refreshAdmin()}>
              {refreshing ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} {refreshing ? 'Refreshing' : 'Refresh data'}
            </button>
          </div>
          {notice && (
            <div className={`admin-notice ${notice.kind}`} role="status" data-testid="status-admin">
              {notice.kind === 'success' ? <Check size={16} /> : <CircleAlert size={16} />}
              <span>{notice.text}</span>
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={15} /></button>
            </div>
          )}

          <div className="page-heading">
            <div>
              <div className="admin-eyebrow"><span /> OWNER ACCESS <span className="eyebrow-line" /> POSTGRESQL PERSISTENCE</div>
              <h1>{sections.find((item) => item.id === section)?.label}<i>.</i></h1>
              <p>Manage the PDF, Word, Excel, image and text toolkit, consented traffic records and ad placements.</p>
            </div>
            <div className="heading-date"><span>LOCAL REPORTING TIME</span><b>Asia / Kolkata</b></div>
          </div>

          {section === 'overview' && (
            <section className="admin-section">
              <div className="section-toolbar">
                <div><span className="section-number">01 / SIGNAL</span><h2>Traffic, without the guesswork</h2></div>
                <div className="segmented" aria-label="Analytics date range">
                  {[7, 30].map((period) => (
                    <button
                      key={period}
                      type="button"
                      className={days === period ? 'selected' : ''}
                      onClick={() => { setDays(period as 7 | 30); setVisitorPage(1); }}
                      data-testid={`range-${period}`}
                    >{period} days</button>
                  ))}
                </div>
              </div>
              {analytics.isLoading ? <MetricSkeleton /> : analytics.isError ? (
                <QueryError message="Traffic report could not be loaded." onRetry={() => analytics.refetch()} />
              ) : (
                <>
                  <div className="catalog-summary">
                    <div className="catalog-head"><div><span className="section-number">LIVE CATALOG</span><b>{formatNumber(tools.data?.length)} registered tools</b></div><span>{tools.isLoading ? 'Loading catalog…' : tools.isError ? 'Catalog unavailable' : 'Counts from the current API catalog'}</span></div>
                    <div className="catalog-totals">
                       <button type="button" onClick={() => { setToolSearch(''); setToolFilter('all'); setToolVisibility('enabled'); setToolPopularity('all'); navigate('tools'); }}><span>Enabled</span><b>{formatNumber(tools.data?.filter((tool) => tool.enabled).length)}</b></button>
                       <button type="button" onClick={() => { setToolSearch(''); setToolFilter('all'); setToolVisibility('hidden'); setToolPopularity('all'); navigate('tools'); }}><span>Hidden</span><b>{formatNumber(tools.data?.filter((tool) => !tool.enabled).length)}</b></button>
                       <button type="button" onClick={() => { setToolSearch(''); setToolFilter('all'); setToolVisibility('all'); setToolPopularity('popular'); navigate('tools'); }}><span>Popular</span><b>{formatNumber(tools.data?.filter((tool) => tool.popular).length)}</b></button>
                       {(['pdf', 'word', 'excel', 'image', 'text'] as const).map((group) => <button type="button" key={group} onClick={() => { setToolSearch(''); setToolFilter(group); setToolVisibility('all'); setToolPopularity('all'); navigate('tools'); }}><span>{group}</span><b>{formatNumber(tools.data?.filter((tool) => (tool.section ?? 'pdf') === group).length)}</b></button>)}
                    </div>
                    <div className="catalog-status">
                      <span className={`status-pill ${advertising.data?.settings.adsEnabled ? 'on' : 'off'}`}><i />Ads {advertising.data?.settings.adsEnabled ? 'globally on' : 'globally paused'}</span>
                      <span className={`status-pill ${advertising.data?.settings.analyticsEnabled ? 'on' : 'off'}`}><i />Consent analytics {advertising.data?.settings.analyticsEnabled ? 'on' : 'off'}</span>
                      <button type="button" className="text-action" onClick={() => navigate('advertising')}>Manage advertising <ArrowRight size={14} /></button>
                      <button type="button" className="text-action" onClick={() => navigate('settings')}>Global settings <ArrowRight size={14} /></button>
                    </div>
                  </div>
                  <div className="metric-grid">
                    <Metric label="Page views" value={analytics.data?.totals.views} icon={<Activity size={17} />} />
                    <Metric label="Unique visitors" value={analytics.data?.totals.visitors} icon={<Globe2 size={17} />} />
                    <Metric label="Today · views" value={analytics.data?.totals.todayViews} icon={<ArrowDownRight size={17} />} />
                    <Metric label="Today · visitors" value={analytics.data?.totals.todayVisitors} icon={<Eye size={17} />} />
                  </div>
                  <div className="data-panel daily-panel">
                    <PanelTitle eyebrow="DAILY TOTALS" title="Recent activity" detail={`${days} day window · ${analytics.data?.timezone || 'Asia/Kolkata'}`} />
                    <BreakdownTable rows={analytics.data?.daily?.map((row) => ({
                      label: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }).format(new Date(`${row.date}T12:00:00`)),
                      views: row.views,
                      visitors: row.visitors,
                    })) ?? []} empty="No consented traffic recorded in this period." />
                  </div>
                  <div className="breakdown-grid">
                    <BreakdownPanel title="Top pages" rows={analytics.data?.pages ?? []} />
                    <BreakdownPanel title="Countries" rows={analytics.data?.countries ?? []} />
                    <BreakdownPanel title="Devices" rows={analytics.data?.devices ?? []} />
                    <BreakdownPanel title="Operating systems" rows={analytics.data?.operatingSystems ?? []} />
                    <BreakdownPanel title="Browsers" rows={analytics.data?.browsers ?? []} />
                    <BreakdownPanel title="Referrers" rows={analytics.data?.referrers ?? []} />
                  </div>
                </>
              )}
              <div className="privacy-note"><LockKeyhole size={16} /><p><b>Consent-first reporting.</b> Only visitors who consent in their browser are counted. Country is an approximate local IP lookup; an IP address does not identify a person. Records are retained for 30 days.</p></div>
            </section>
          )}

          {section === 'visitors' && (
            <section className="admin-section">
              <div className="section-toolbar">
                <div><span className="section-number">02 / VISITORS</span><h2>Private visit records</h2><p className="section-subtitle">Consent-based records, displayed in Asia/Kolkata time.</p></div>
                <div className="segmented">
                  {[7, 30].map((period) => <button key={period} type="button" className={days === period ? 'selected' : ''} onClick={() => { setDays(period as 7 | 30); setVisitorPage(1); }}>{period} days</button>)}
                </div>
              </div>
              <div className="data-panel">
                {visitors.isLoading ? <TableSkeleton /> : visitors.isError ? <QueryError message="Visitor records could not be loaded." onRetry={() => visitors.refetch()} /> : (
                  <>
                    <div className="table-caption"><div><b>{formatNumber(visitors.data?.total)} records</b><span> · page {visitors.data?.page ?? 1} of {totalPages}</span></div><span>30-DAY RETENTION</span></div>
                    {visitors.data?.records.length ? (
                      <div className="table-scroll">
                        <table className="admin-table visitor-table">
                          <thead><tr><th>Time · IST</th><th>Page</th><th>IP address</th><th>Country</th><th>Device</th><th>OS / browser</th><th>Referrer</th></tr></thead>
                          <tbody>{visitors.data.records.map((record) => (
                            <tr key={record.id} data-testid={`row-visitor-${record.id}`}>
                              <td className="mono-cell">{formatDate(record.createdAt)}</td>
                              <td className="path-cell">{record.path}</td><td className="mono-cell">{record.ip || '—'}</td>
                              <td>{record.country || '—'}</td><td>{record.device || '—'}</td>
                              <td>{record.os || '—'}<small>{record.browser || '—'}</small></td>
                              <td className="referrer-cell">{record.referrer || 'Direct'}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : <EmptyState icon={<ClipboardList size={20} />} title="No visitor records yet" detail="Records appear only after a visitor gives consent. No activity is being fabricated or backfilled." />}
                    <div className="table-footer">
                      <span>Approximate country only. IP does not identify a person.</span>
                      <div className="pagination">
                        <button type="button" aria-label="Previous page" disabled={visitorPage <= 1} onClick={() => setVisitorPage((p) => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
                        <span>{visitorPage} / {totalPages}</span>
                        <button type="button" aria-label="Next page" disabled={visitorPage >= totalPages} onClick={() => setVisitorPage((p) => Math.min(totalPages, p + 1))}><ChevronRight size={16} /></button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="privacy-note"><LockKeyhole size={16} /><p>Private visitor information is available only to the verified owner. Reports contain consented browser visitors, approximate country lookup and a maximum 30-day retention period.</p></div>
            </section>
          )}

          {section === 'tools' && (
            <section className="admin-section">
              <div className="section-toolbar tool-toolbar">
                <div><span className="section-number">03 / DIRECTORY</span><h2>Tool management</h2><p className="section-subtitle">Manage existing server-side document tools and browser-local image and text tools. Listings do not create engines.</p></div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="search-field"><Search size={16} /><input aria-label="Search tools" placeholder="Find a tool or category" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} /><span>{visibleTools.length}</span></label>
                  <select className="admin-input !w-auto" aria-label="Filter tools by section" value={toolFilter} onChange={(event) => setToolFilter(event.target.value as typeof toolFilter)}>
                    <option value="all">All sections</option><option value="pdf">PDF</option><option value="word">Word</option><option value="excel">Excel</option><option value="image">Image</option><option value="text">Text</option>
                  </select>
                   <select className="admin-input !w-auto" aria-label="Filter tools by visibility" value={toolVisibility} onChange={(event) => setToolVisibility(event.target.value as typeof toolVisibility)}><option value="all">Enabled + hidden</option><option value="enabled">Enabled only</option><option value="hidden">Hidden only</option></select>
                   <select className="admin-input !w-auto" aria-label="Filter popular tools" value={toolPopularity} onChange={(event) => setToolPopularity(event.target.value as typeof toolPopularity)}><option value="all">Popular + all others</option><option value="popular">Popular only</option></select>
                   <button className="button-secondary" type="button" onClick={() => { setToolSearch(''); setToolFilter('all'); setToolVisibility('all'); setToolPopularity('all'); }}>Clear filters</button>
                </div>
              </div>
              {tools.isLoading ? <div className="tool-skeleton-grid"><div /><div /><div /><div /></div> : tools.isError ? <QueryError message="The tool directory could not be loaded." onRetry={() => tools.refetch()} /> : visibleTools.length === 0 ? (
                <EmptyState icon={<Search size={19} />} title="No matching tools" detail="Try a different name, description or category." />
              ) : (
                <div className="tools-table-wrap">
                  <table className="admin-table tools-table">
                    <thead><tr><th>Tool</th><th>Section</th><th>Category</th><th>Engine</th><th>Public status</th><th>Popular</th><th /></tr></thead>
                    <tbody>{visibleTools.map((tool) => (
                      <tr key={tool.slug} data-testid={`row-tool-${tool.slug}`}>
                         <td><b>{tool.name}</b><small>{tool.description}</small><a className="tool-public-link" href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/${tool.section ?? 'pdf'}/${tool.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open public tool{tool.enabled ? '' : ' · hidden'}</a></td>
                        <td><span className="popular-label">{(tool.section ?? 'pdf').toUpperCase()}</span></td><td>{tool.category}</td><td className="mono-cell">{tool.engine}</td>
                        <td><span className={`status-pill ${tool.enabled ? 'on' : 'off'}`}><i />{tool.enabled ? 'Enabled' : 'Hidden'}</span></td>
                        <td>{tool.popular ? <span className="popular-label">Featured</span> : <span className="muted-value">—</span>}</td>
                        <td><button className="icon-button" type="button" aria-label={`Edit ${tool.name}`} onClick={() => editTool(tool.slug)}><Pencil size={15} /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <div className="table-footer"><span>Disabled tools are removed from the public directory.</span><span>{tools.data?.length ?? 0} registered tools</span></div>
                </div>
              )}
            </section>
          )}

          {section === 'advertising' && (
            <section className="admin-section">
              <div className="section-toolbar">
                <div><span className="section-number">04 / MONETIZATION</span><h2>Advertising placements</h2><p className="section-subtitle">Configure a named website placement below. API slots are website inventory points; their presence does not mean a saved configuration exists.</p></div>
                <button className="button-primary" type="button" onClick={startNewSlot}><span>Configure placement</span><ArrowRight size={15} /></button>
              </div>
              {advertising.isLoading ? <TableSkeleton /> : advertising.isError ? <QueryError message="Advertising configuration could not be loaded." onRetry={() => advertising.refetch()} /> : (
                <>
                  <div className="ad-summary">
                      <div><span className={`status-pill ${advertising.data?.settings.adsEnabled ? 'on' : 'off'}`}><i />{advertising.data?.settings.adsEnabled ? 'Ads globally enabled' : 'Ads globally paused'}</span><p>Global control · slot-level enablement still applies</p></div>
                    <div className="ad-summary-side"><b>{advertising.data?.slots.length ?? 0}</b><span>website placements</span></div>
                  </div>
                  {(advertising.data?.slots ?? []).length ? (
                    <div className="placement-list">{advertising.data?.slots.map((slot) => (
                      <article className="placement-row" key={slot.name} data-testid={`placement-${slot.name}`}>
                        <span className={`placement-icon ${slot.type}`}><Megaphone size={18} /></span>
                        <div className="placement-copy"><div><b>{slot.name}</b><span className={`status-pill ${slot.enabled ? 'on' : 'off'}`}><i />{slot.enabled ? 'On' : 'Off'}</span></div><p>{slot.type === 'adsense' ? 'Google AdSense' : 'Sponsored link'}{slot.title ? ` · ${slot.title}` : ' · Not yet configured'} · {slot.enabled ? (!advertising.data?.settings.adsEnabled ? 'Global ads are paused' : slot.type === 'adsense' && (!publisherPattern.test(advertising.data?.settings.adsPublisherId ?? '') || !unitPattern.test(slot.adUnit ?? '')) ? 'Incomplete AdSense configuration' : slot.type === 'sponsor' && (!slot.title || !slot.link) ? 'Incomplete sponsor configuration' : 'Ready when consent is granted') : 'Placement switch is off'}</p></div>
                        <button type="button" className="text-action" onClick={() => editAd(slot.name)}><Pencil size={14} /> Edit</button>
                         <button type="button" className="icon-button danger-icon" disabled={deleteAd.isPending} aria-label={`Remove saved config for ${slot.name}`} onClick={() => {
                          if (window.confirm(`Remove the saved configuration for “${slot.name}”? The website placement itself will remain.`)) {
                            void runAction(() => deleteAd.mutateAsync({ name: slot.name }), 'Saved placement configuration removed.', true);
                          }
                        }}><Trash2 size={15} /></button>
                      </article>
                    ))}</div>
                  ) : <EmptyState icon={<Megaphone size={20} />} title="No saved placements" detail="The website placement points remain in place until configured here." action={<button className="button-secondary" type="button" onClick={startNewSlot}>Configure a placement <ArrowRight size={14} /></button>} />}
                  <div className="ad-compliance">
                    <div className="compliance-mark"><ShieldCheck size={18} /></div>
                    <div><b>Consent and policy come first</b><p>Ads render only after visitor consent and when both global and placement switches are enabled. AdSense may require Google approval and a compliant consent management platform (CMP). This dashboard does not track revenue or promise earnings.</p></div>
                  </div>
                </>
              )}
            </section>
          )}

          {section === 'settings' && (
            <section className="admin-section settings-section">
              <div className="section-toolbar">
                <div><span className="section-number">05 / SITE CONTROLS</span><h2>Global settings</h2><p className="section-subtitle">Changes persist in PostgreSQL and apply to the public experience.</p></div>
              </div>
              {advertising.isLoading ? <div className="settings-skeleton" /> : advertising.isError ? <QueryError message="Global settings could not be loaded." onRetry={() => advertising.refetch()} /> : (
                <div className="settings-layout">
                  <fieldset className="settings-form" disabled={actionBusy}>
                    <div className="setting-row">
                      <div><b>Advertising enabled</b><p>Allow eligible placements to render after visitor consent.</p></div>
                      <Toggle checked={settings.adsEnabled} label="Advertising enabled" onChange={(checked) => setSettings((current) => ({ ...current, adsEnabled: checked }))} />
                    </div>
                    <label className="admin-label">AdSense publisher ID <span>OPTIONAL</span>
                      <input className="admin-input" placeholder="ca-pub-0000000000000000" value={settings.adsPublisherId} onChange={(event) => setSettings((current) => ({ ...current, adsPublisherId: event.target.value }))} />
                      <small>Format: ca-pub- followed by 16 digits.</small>
                    </label>
                    <div className="setting-row">
                      <div><b>Consent-based analytics</b><p>Record browser visits only when the visitor has consented.</p></div>
                      <Toggle checked={settings.analyticsEnabled} label="Consent-based analytics" onChange={(checked) => setSettings((current) => ({ ...current, analyticsEnabled: checked }))} />
                    </div>
                    <div className="settings-submit">
                      <button className="button-primary" type="button" disabled={saveSettings.isPending || !settingsDirty} onClick={() => {
                        void runAction(() => saveSettings.mutateAsync({ data: settings }), 'Global settings saved.', true).then((saved) => {
                          if (saved) setSavedSettings(settings);
                        });
                      }}>{saveSettings.isPending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Save global settings</button>
                      <span>{settingsDirty ? 'Unsaved changes · apply only after saving.' : 'Saved settings apply to new page views.'}</span>
                    </div>
                    {settingsDirty && <div className="unsaved-notice" role="status"><CircleAlert size={15} /><span>You have unsaved global settings.</span><button type="button" className="text-action" onClick={discardSettings}>Discard changes</button></div>}
                  </fieldset>
                  <aside className="retention-card">
                    <div className="retention-icon"><LockKeyhole size={18} /></div>
                    <span className="section-number">DATA PRACTICE</span>
                    <h3>Useful signals.<br />Limited footprint.</h3>
                    <p>Analytics contains consented browser visitors only. Country is approximated from local IP lookup. IP addresses do not identify a person; visitor records are retained for 30 days.</p>
                    <span className="retention-rule" /><b>Stored securely</b><small>Settings and records persist on PostgreSQL.</small>
                  </aside>
                </div>
              )}
              <div className="danger-zone">
                <div className="danger-symbol"><Trash2 size={17} /></div>
                <div><b>Clear analytics records</b><p>Permanently delete consented analytics and visitor records. This cannot be undone.</p></div>
                <button type="button" className="button-danger" disabled={clearAnalytics.isPending} onClick={() => {
                  if (window.prompt('Type DELETE to permanently remove all consented analytics and visitor records. This cannot be undone.') === 'DELETE') {
                    void runAction(() => clearAnalytics.mutateAsync({ data: { confirm: 'DELETE' } }), 'Analytics and visitor records were cleared.').then(() => setVisitorPage(1));
                  }
                }}>{clearAnalytics.isPending ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Clear records</button>
              </div>
            </section>
          )}
          <footer className="admin-footer"><span>KTAS TOOLS <b>·</b> OWNER CONSOLE</span><span>Access restricted to verified owner</span></footer>
        </div>
      </main>

      {toolEdit && currentTool && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !actionBusy) setToolEdit(null); }}>
          <section ref={modalRef} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="tool-dialog-title">
            <button type="button" className="modal-close" aria-label="Close editor" disabled={actionBusy} onClick={() => setToolEdit(null)}><X size={18} /></button>
            <span className="section-number">ENGINE SETTINGS / {currentTool.slug}</span>
            <h2 id="tool-dialog-title">Edit tool</h2>
            <p className="modal-intro">Update the directory listing for this existing processing engine.</p>
            <form onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void runAction(() => saveTool.mutateAsync({ slug: currentTool.slug, data: toolDraft }), 'Tool listing updated.', true).then((saved) => { if (saved) setToolEdit(null); });
            }}>
              <fieldset disabled={actionBusy}>
              <label className="admin-label">Display name<input className="admin-input" maxLength={90} required value={toolDraft.name} onChange={(event) => setToolDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
              <label className="admin-label">Description<textarea className="admin-input admin-textarea" maxLength={600} required value={toolDraft.description} onChange={(event) => setToolDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
              <div className="modal-toggle-list">
                <div className="setting-row"><div><b>Publicly enabled</b><p>Disabled tools are hidden from the website.</p></div><Toggle checked={toolDraft.enabled} label="Publicly enabled" onChange={(checked) => setToolDraft((draft) => ({ ...draft, enabled: checked }))} /></div>
                <div className="setting-row"><div><b>Mark as popular</b><p>Surface this engine as a popular tool.</p></div><Toggle checked={toolDraft.popular} label="Mark as popular" onChange={(checked) => setToolDraft((draft) => ({ ...draft, popular: checked }))} /></div>
              </div>
              <div className="modal-actions">
              <button type="button" className="button-secondary reset-button" disabled={resetTool.isPending || saveTool.isPending} onClick={() => {
                  if (window.confirm(`Reset “${currentTool.name}” to its factory default?`)) {
                    void runAction(() => resetTool.mutateAsync({ slug: currentTool.slug }), 'Tool restored to factory defaults.', true).then((saved) => { if (saved) setToolEdit(null); });
                  }
                }}><RotateCcw size={15} /> Reset defaults</button>
                <button type="submit" className="button-primary" disabled={saveTool.isPending || resetTool.isPending}>{saveTool.isPending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Save tool</button>
              </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}

      {adEdit && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !actionBusy) setAdEdit(null); }}>
          <section ref={modalRef} className="admin-modal ad-modal" role="dialog" aria-modal="true" aria-labelledby="ad-dialog-title">
            <button type="button" className="modal-close" aria-label="Close editor" disabled={actionBusy} onClick={() => setAdEdit(null)}><X size={18} /></button>
            <span className="section-number">PLACEMENT CONFIGURATION</span>
            <h2 id="ad-dialog-title">{newSlot ? 'Configure a placement' : `Edit ${adEdit}`}</h2>
            <p className="modal-intro">A saved configuration never creates or removes the placement on the website.</p>
            <form onSubmit={saveSlot}>
              <fieldset disabled={actionBusy}>
              <label className="admin-label">Website placement<select className="admin-input" required disabled={!newSlot} value={slotName} onChange={(event) => setSlotName(event.target.value)}>
                <option value="">Choose an existing placement</option>
                {advertising.data?.slots.map((slot) => <option key={slot.name} value={slot.name}>{slot.name}</option>)}
              </select></label>
              <label className="admin-label">Ad format<select className="admin-input" value={adDraft.type} onChange={(event) => setAdDraft((draft) => ({ ...draft, type: event.target.value as 'sponsor' | 'adsense' }))}><option value="sponsor">Sponsored text or image link</option><option value="adsense">Google AdSense</option></select></label>
              <div className="setting-row ad-enable"><div><b>Placement enabled</b><p>Global advertising must also be enabled.</p></div><Toggle checked={adDraft.enabled} label="Placement enabled" onChange={(checked) => setAdDraft((draft) => ({ ...draft, enabled: checked }))} /></div>
              {adDraft.type === 'adsense' && <div className={`publisher-readiness ${publisherPattern.test(advertising.data?.settings.adsPublisherId ?? '') ? 'ready' : ''}`}><ShieldCheck size={15} /><span>{publisherPattern.test(advertising.data?.settings.adsPublisherId ?? '') ? `Saved publisher ready: ${advertising.data?.settings.adsPublisherId}` : 'No valid publisher ID is saved.'} <b>Manage publisher ID in Global settings.</b> Disabled drafts can be saved without it; enabling requires saved publisher and a valid unit.</span></div>}
              {adDraft.type === 'sponsor' ? (
                <>
                  <label className="admin-label">Title<input className="admin-input" maxLength={100} value={adDraft.title} onChange={(event) => setAdDraft((draft) => ({ ...draft, title: event.target.value }))} /></label>
                  <label className="admin-label">Text<textarea className="admin-input admin-textarea short" maxLength={240} value={adDraft.text} onChange={(event) => setAdDraft((draft) => ({ ...draft, text: event.target.value }))} /></label>
                  <label className="admin-label">Destination HTTPS URL<input className="admin-input" type="url" pattern="https://.*" placeholder="https://example.com" value={adDraft.link} onChange={(event) => setAdDraft((draft) => ({ ...draft, link: event.target.value }))} /></label>
                  <label className="admin-label">Image HTTPS URL <span>OPTIONAL</span><input className="admin-input" type="url" pattern="https://.*" placeholder="https://example.com/creative.png" value={adDraft.imageUrl} onChange={(event) => setAdDraft((draft) => ({ ...draft, imageUrl: event.target.value }))} /></label>
                </>
              ) : (
                <>
                  <label className="admin-label">10-digit ad unit ID<input className="admin-input" required={adDraft.enabled} pattern="[0-9]{10}" value={adDraft.adUnit} onChange={(event) => setAdDraft((draft) => ({ ...draft, adUnit: event.target.value }))} /></label>
                  <div className="compliance-inline"><CircleAlert size={15} /> AdSense approval and a compliant CMP may still be required. No revenue tracking is provided.</div>
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="button-secondary" disabled={saveAd.isPending} onClick={() => setAdEdit(null)}>Cancel</button>
                <button type="submit" className="button-primary" disabled={saveAd.isPending}>{saveAd.isPending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Save configuration</button>
              </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}
      {leaveConfirm && pendingSection && <div className="admin-modal-backdrop" role="presentation"><section ref={modalRef} className="admin-modal" role="alertdialog" aria-modal="true" aria-labelledby="leave-dialog-title"><span className="section-number">UNSAVED SETTINGS</span><h2 id="leave-dialog-title">Leave without saving?</h2><p className="modal-intro">Your global settings draft has not been saved. Discard it before leaving Settings?</p><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => { setLeaveConfirm(false); setPendingSection(null); }}>Stay here</button><button className="button-danger" type="button" onClick={() => { const target = pendingSection; discardSettings(); setLeaveConfirm(false); setPendingSection(null); window.location.hash = `/${target}`; }}>Discard and leave</button></div></section></div>}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value?: number; icon: ReactNode }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><b>{formatNumber(value)}</b><small>in selected period</small></article>;
}

function PanelTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="panel-title"><div><span className="section-number">{eyebrow}</span><h3>{title}</h3></div><small>{detail}</small></div>;
}

function BreakdownTable({ rows, empty }: { rows: { label: string; views: number; visitors: number }[]; empty: string }) {
  if (!rows.length) return <EmptyState icon={<Activity size={19} />} title="Nothing to report yet" detail={empty} compact />;
  return <div className="table-scroll"><table className="admin-table breakdown-table"><thead><tr><th>Date</th><th>Views</th><th>Visitors</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.label}-${index}`}><td>{row.label}</td><td>{formatNumber(row.views)}</td><td>{formatNumber(row.visitors)}</td></tr>)}</tbody></table></div>;
}

function BreakdownPanel({ title, rows }: { title: string; rows: { label: string; views: number; visitors: number }[] }) {
  return <div className="breakdown-card"><div className="breakdown-title"><span>{title}</span><ChevronDown size={14} /></div>{rows.length ? <ol>{rows.slice(0, 5).map((row, index) => <li key={`${row.label}-${index}`}><span><i>{String(index + 1).padStart(2, '0')}</i>{row.label}</span><b>{formatNumber(row.views)}</b></li>)}</ol> : <p className="breakdown-empty">No recorded data</p>}</div>;
}

function EmptyState({ icon, title, detail, action, compact = false }: { icon: ReactNode; title: string; detail: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}><i>{icon}</i><b>{title}</b><p>{detail}</p>{action}</div>;
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="query-error"><CircleAlert size={19} /><div><b>{message}</b><span>Check the connection and try again.</span></div><button type="button" className="button-secondary" onClick={onRetry}>Retry <RotateCcw size={13} /></button></div>;
}

function MetricSkeleton() {
  return <div className="metric-grid">{[0, 1, 2, 3].map((item) => <div className="metric-skeleton" key={item}><i /><b /><span /></div>)}</div>;
}

function TableSkeleton() {
  return <div className="data-panel table-skeleton"><div /><div /><div /><div /><div /><div /></div>;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle-switch ${checked ? 'checked' : ''}`} onClick={() => onChange(!checked)}><span /></button>;
}