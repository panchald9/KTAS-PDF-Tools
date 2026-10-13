import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import ToolPage from '../../../src/pages/tool';
import '../../../src/index.css';

const slug = new URLSearchParams(window.location.search).get('tool') ?? 'trim-excel-text';
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Router><ToolPage slug={slug} section="excel" /></Router>
  </QueryClientProvider>,
);