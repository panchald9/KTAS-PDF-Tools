import { useUser, SignIn, SignUp, UserButton } from '@clerk/react';
import { Link } from 'wouter';
import { useGetAdminSession, getGetAdminSessionQueryKey } from '@workspace/api-client-react';
import type { ReactNode } from 'react';
import { useMeta } from '@/lib/util';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function AdminAccess({ children }: { children: ReactNode }) {
  useMeta('Admin panel', 'Private KTAS Tools website management.');
  const { isLoaded, isSignedIn, user } = useUser();
  const session = useGetAdminSession({ query: { queryKey: [...getGetAdminSessionQueryKey(), user?.id], enabled: !!isLoaded && !!isSignedIn, retry: false, staleTime: 0 } });
  if (!isLoaded || (isSignedIn && session.isLoading)) {
    return <div className="mx-auto max-w-lg px-6 py-24" role="status">Verifying owner access…</div>;
  }
  if (!isSignedIn) {
    return <section className="mx-auto max-w-lg px-6 py-24">
      <p className="section-kicker">KTAS TOOLS · OWNER ACCESS</p>
      <h1 className="mt-4 text-4xl font-bold">Your website, under control.</h1>
      <p className="my-6 text-muted-foreground">Sign in with the verified owner account to manage tools, advertising, and private visitor reports.</p>
      <div className="flex gap-3"><Link className="btn btn-primary" href="/sign-in">Sign in</Link><Link className="btn btn-ghost" href="/">Back to website</Link></div>
    </section>;
  }
  if (session.isError || !session.data) {
    return <section className="mx-auto max-w-lg px-6 py-24">
      <UserButton />
      <h1 className="mt-6 text-3xl font-bold">Owner access required</h1>
      <p className="my-6 text-muted-foreground">This account is not authorized, or owner verification is temporarily unavailable. Only the configured, verified owner email has access.</p>
      <button className="btn btn-primary" onClick={() => session.refetch()}>Retry verification</button>
      <Link className="btn btn-ghost ml-2" href="/">Back to website</Link>
    </section>;
  }
  return <>{children}</>;
}

export function AuthPage({ signup = false }: { signup?: boolean }) {
  useMeta(signup ? 'Create owner account' : 'Owner sign in', 'Secure owner access to the KTAS Tools admin panel.');
  return <main className="min-h-screen px-5 py-12">
    <div className="mx-auto mb-8 max-w-md text-center">
      <Link href="/" className="text-xl font-bold text-primary">KTAS Tools</Link>
      <h1 className="mt-4 text-3xl font-bold">{signup ? 'Create your owner account' : 'Owner sign in'}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Use the configured owner email. Signing up does not grant other accounts admin access.</p>
    </div>
    <div className="flex justify-center">
      {signup
        ? <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/admin`} />
        : <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/admin`} />}
    </div>
  </main>;
}