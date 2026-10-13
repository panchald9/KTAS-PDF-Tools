import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { AppAuthProvider, useClerk } from '@/lib/auth';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/layout';
import NotFound from '@/pages/not-found';
import Catalog from '@/pages/catalog';
import { About, Contact, CookiePolicy, GuidePage, GuidesIndex, Privacy, Terms } from '@/pages/info';
import { AdminAccess, AuthPage } from '@/components/admin-access';
import { VisitorTracker } from '@/components/visitor-tracker';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const AdminPage = lazy(() => import('@/pages/admin'));
const ToolPage = lazy(() => import('@/pages/tool'));
const LocalToolPage = lazy(() => import('@/pages/local-workspace').then((module) => ({ default: module.LocalToolPage })));
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) queryClient.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);
  return null;
}

function Router() {
  const [location, setLocation] = useLocation();
  const privateRoute = /^\/(admin|sign-in|sign-up)(\/|$)/.test(location);
  const content = (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/admin">{() => <AdminAccess><Suspense fallback={<p className="p-10">Loading admin panel…</p>}><AdminPage /></Suspense></AdminAccess>}</Route>
        <Route path="/sign-in/*?">{() => <AuthPage />}</Route>
        <Route path="/sign-up/*?">{() => <AuthPage signup />}</Route>
        <Route path="/">{() => <Catalog home />}</Route>
        <Route path="/tools">{() => <Catalog section="all" />}</Route>
        <Route path="/pdf">{() => <Catalog section="pdf" />}</Route>
        <Route path="/image">{() => <Catalog section="image" />}</Route>
        <Route path="/text">{() => <Catalog section="text" />}</Route>
        <Route path="/word">{() => <Catalog section="word" />}</Route>
        <Route path="/excel">{() => <Catalog section="excel" />}</Route>
        <Route path="/image/:slug">{(p) => <Suspense fallback={<WorkspaceLoading />}><LocalToolPage slug={p.slug} section="image" /></Suspense>}</Route>
        <Route path="/text/:slug">{(p) => <Suspense fallback={<WorkspaceLoading />}><LocalToolPage slug={p.slug} section="text" /></Suspense>}</Route>
        <Route path="/pdf/:slug">{(p) => <Suspense fallback={<WorkspaceLoading />}><ToolPage slug={p.slug} section="pdf" /></Suspense>}</Route>
        <Route path="/word/:slug">{(p) => <Suspense fallback={<WorkspaceLoading />}><ToolPage slug={p.slug} section="word" /></Suspense>}</Route>
        <Route path="/excel/:slug">{(p) => <Suspense fallback={<WorkspaceLoading />}><ToolPage slug={p.slug} section="excel" /></Suspense>}</Route>
        <Route path="/guides" component={GuidesIndex} />
        <Route path="/guides/:slug">{(p) => <GuidePage slug={p.slug} />}</Route>
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/cookie-policy" component={CookiePolicy} />
        <Route path="/:slug">{(p) => <Suspense fallback={<WorkspaceLoading />}><ToolPage slug={p.slug} legacy /></Suspense>}</Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
  return (
    <AppAuthProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to: string) => setLocation(stripBase(to))}
      routerReplace={(to: string) => setLocation(stripBase(to), { replace: true })}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/admin`}
      signUpFallbackRedirectUrl={`${basePath}/admin`}
      afterSignOutUrl={`${basePath}/`}
      appearance={{
        options: { logoImageUrl: `${window.location.origin}${basePath}/logo.svg`, logoLinkUrl: `${basePath}/` },
        variables: { colorPrimary: '#087d78', colorForeground: '#153b3b', colorMutedForeground: '#58726c', colorBackground: '#fbfdf9', colorInput: '#ffffff', colorInputForeground: '#153b3b', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.7rem' },
        elements: { cardBox: { backgroundColor: '#fbfdf9' }, headerTitle: { color: '#153b3b' }, headerSubtitle: { color: '#58726c' }, formFieldLabel: { color: '#153b3b' }, footerActionText: { color: '#58726c' }, footerActionLink: { color: '#087d78' }, socialButtonsBlockButtonText: { color: '#153b3b' }, dividerText: { color: '#58726c' } },
      }}
      localization={{ signIn: { start: { title: 'Sign in to KTAS Tools', subtitle: 'Secure access for the website owner' } }, signUp: { start: { title: 'Create your KTAS Tools account', subtitle: 'Only the verified owner can access administration' } } }}
    >
      <ClerkQueryClientCacheInvalidator />
      <VisitorTracker />
      {privateRoute ? content : <Layout>{content}</Layout>}
    </AppAuthProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function WorkspaceLoading() {
  return <div className="mx-auto max-w-4xl space-y-4 px-6 py-12" role="status" aria-label="Loading tool workspace">
    <div className="h-5 w-32 animate-pulse rounded bg-muted" />
    <div className="h-12 w-72 animate-pulse rounded bg-muted" />
    <div className="h-72 animate-pulse rounded-2xl bg-muted" />
  </div>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
