// Browser mutations must carry a well-formed, same-host Origin. Clients without
// an Origin are still authenticated by requireAdmin before reaching this check.
export function adminMutationAllowed(origin: string | undefined, host: string | undefined, fetchSite: string | undefined): boolean {
  if (fetchSite === "cross-site") return false;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      origin === url.origin && !!host && url.host === host.toLowerCase();
  } catch {
    return false;
  }
}