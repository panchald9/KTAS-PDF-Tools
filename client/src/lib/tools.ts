import { useMemo } from 'react';
import { useListTools, getListToolsQueryKey, type PdfTool } from '@workspace/api-client-react';

export function localizeTool(t: PdfTool): PdfTool {
  return t;
}

export type ToolSection = 'pdf' | 'image' | 'text' | 'word' | 'excel';
export function toolSection(tool: PdfTool): ToolSection {
  return tool.section ?? 'pdf';
}
export function toolHref(tool: PdfTool): string {
  return `/${toolSection(tool)}/${tool.slug}`;
}
export function sectionHref(section: ToolSection): string {
  return `/${section}`;
}

export function useTools() {
  const q = useListTools({ query: { queryKey: getListToolsQueryKey(), staleTime: 0, refetchInterval: 60_000 } });
  const tools = useMemo(() => (q.data ? q.data.map(localizeTool) : undefined), [q.data]);
  return { ...q, tools };
}
