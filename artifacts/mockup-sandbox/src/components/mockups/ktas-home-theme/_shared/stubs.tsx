import type { AnchorHTMLAttributes } from 'react';
import catalog from './catalog.json';

export type PdfTool = (typeof catalog)[number];
export const PDF_TOOLS: PdfTool[] = catalog;
export const COMPANY_SITE = 'https://kalitechandservices.com';

export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} onClick={(event) => event.preventDefault()} />;
}
export function useTools() {
  return { tools: PDF_TOOLS, isLoading: false, isError: false, refetch: () => {} };
}
export function useMeta(_title: string, _description: string) {}
export function useLocation() { return ['/'] as const; }
export function useCookiePref() { return 'essential'; }
export function setCookiePref(_preference: 'essential' | 'all') {}