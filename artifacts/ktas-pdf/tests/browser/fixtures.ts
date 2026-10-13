import { test as base, expect, type Page } from '@playwright/test';
import type {
  DocumentProcessingInput, PdfTool, SiteConfig,
  WorkbookInspection, WorkbookInspectionInput,
} from '@workspace/api-client-react';

export const sheetNames = ['Summary', " O'Brien, Q4 ", '売上 2026'];
const option = (key: string) => ({
  key, label: key === 'sheet' ? 'Worksheet name (blank = all)' : 'Match column numbers (blank = all)',
  type: 'text' as const, defaultValue: '', description: '', choices: [],
});
const tools: PdfTool[] = ['trim-excel-text', 'split-excel', 'excel-to-csv', 'remove-excel-duplicates', 'merge-excel', 'excel-statistics'].map((slug) => ({
  slug, name: slug, section: 'excel', description: 'Workbook lifecycle test',
  category: 'Excel', icon: 'Table', accept: '.xlsx', multiple: slug === 'merge-excel',
  engine: 'Local openpyxl processing', help: [], limitations: '', popular: false,
  options: ['merge-excel', 'excel-statistics'].includes(slug) ? []
    : slug === 'remove-excel-duplicates' ? [option('sheet'), option('columns')] : [option('sheet')],
}));
const siteConfig: SiteConfig = {
  maxFileBytes: 1_000_000, maxTotalBytes: 5_000_000, maxFiles: 20, maxPages: 100,
  adsEnabled: false, publisherId: null, adSlots: {}, aiEnabled: false, retention: 'Temporary files only',
};

export function uploadFile(name = 'first.xlsx', contents = 'first workbook bytes') {
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(contents) };
}

export function sample(input: WorkbookInspectionInput): WorkbookInspection {
  const marker = atob(input.file.dataBase64);
  return {
    sheets: sheetNames.map((name, i) => ({ name, rows: 2, columns: 1, state: i === 2 ? 'hidden' : 'visible' })),
    previewSheet: input.sheet ?? sheetNames[0],
    sampleRows: [[{
      coordinate: 'A1', kind: 'value', value: `${marker}: ${input.sheet ?? sheetNames[0]}`,
      formula: null, cachedValue: null, truncated: false,
    }]],
    rowLimit: 10, columnLimit: 12, cellCharacterLimit: 500, truncated: false, warnings: [],
  };
}

interface InspectionRequest {
  input: WorkbookInspectionInput;
  aborted: boolean;
}
interface InspectionControl {
  requests: InspectionRequest[];
  deliver: Record<number, (body: unknown, status: number) => void>;
  consumed: number[];
}
declare global {
  interface Window { workbookTest: InspectionControl }
}

export class WorkbookBrowser {
  processed: DocumentProcessingInput[] = [];
  constructor(readonly page: Page) {}

  async open(slug = 'trim-excel-text') {
    // Every inspection deliberately ignores cancellation at the transport level.
    // This proves the component's aborted-request guard, not just fetch's rejection.
    await this.page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.workbookTest = { requests: [], deliver: {}, consumed: [] };
      window.fetch = (input, init) => {
        if (!String(input).endsWith('/api/workbooks/inspect')) return originalFetch(input, init);
        const control = window.workbookTest;
        const index = control.requests.length;
        const request = { input: JSON.parse(String(init?.body)), aborted: false };
        control.requests.push(request);
        init?.signal?.addEventListener('abort', () => { request.aborted = true; });
        return new Promise<Response>((resolve) => {
          control.deliver[index] = (body, status) => {
            delete control.deliver[index];
            const response = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
            const text = response.text.bind(response);
            response.text = async () => {
              const result = await text();
              control.consumed.push(index);
              return result;
            };
            resolve(response);
          };
        });
      };
    });
    await this.page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/tools') return route.fulfill({ json: tools });
      if (url.pathname === '/api/site-config') return route.fulfill({ json: siteConfig });
      if (url.pathname === '/api/public-config') return route.fulfill({ json: { settings: { adsEnabled: false, analyticsEnabled: false, adsPublisherId: '' }, slots: [] } });
      if (/^\/api\/tools\/[^/]+\/process$/.test(url.pathname)) {
        this.processed.push(route.request().postDataJSON());
        return route.fulfill({ json: { files: [], message: 'Processed', warnings: [], originalBytes: 1, outputBytes: 0, pageCount: 0, text: '' } });
      }
      throw new Error(`Unexpected API request: ${route.request().method()} ${url.pathname}`);
    });
    await this.page.goto(`/?tool=${slug}`);
    await expect(this.page.getByTestId('text-tool-name')).toHaveText(slug);
  }

  async upload(name?: string, contents?: string) {
    await this.page.getByTestId('input-file').setInputFiles(uploadFile(name, contents));
    await expect(this.page.getByRole('button', { name: `Remove ${name ?? 'first.xlsx'}`, exact: true })).toBeVisible();
    await expect(this.page.getByTestId('button-process')).toBeEnabled();
  }

  requests() { return this.page.evaluate(() => window.workbookTest.requests); }

  async waitForRequests(count: number) {
    await expect.poll(async () => (await this.requests()).length).toBe(count);
    return (await this.requests())[count - 1];
  }

  async deliver(index: number, body?: unknown, status = 200) {
    const input = (await this.requests())[index].input;
    await this.page.evaluate(({ index, body, status }) => {
      window.workbookTest.deliver[index](body, status);
    }, { index, body: body ?? sample(input), status });
    await this.page.waitForFunction((index) => window.workbookTest.consumed.includes(index), index);
    // Await the response body and React's next paint, even when the UI correctly
    // does nothing (cleared/unmounted component). No sleep-based race assertions.
    await this.page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
  }

  async preview() {
    const count = (await this.requests()).length;
    await this.page.getByTestId('button-preview-workbook').click();
    await this.waitForRequests(count + 1);
    await this.deliver(count);
    await expect(this.page.getByTestId('table-workbook-preview')).toBeVisible();
  }

  async process(): Promise<DocumentProcessingInput> {
    const count = this.processed.length;
    await this.page.getByTestId('button-process').click();
    await expect.poll(() => this.processed.length).toBe(count + 1);
    await expect(this.page.getByTestId('button-process')).toBeEnabled();
    return this.processed[count];
  }

  async expectCleared() {
    await expect(this.page.getByTestId('table-workbook-preview')).toHaveCount(0);
    await expect(this.page.getByTestId('select-process-sheet')).toHaveCount(0);
    await expect(this.page.getByTestId('select-preview-sheet')).toHaveCount(0);
    await expect(this.page.getByRole('alert')).toHaveCount(0);
  }
}

export const test = base.extend<{ workbook: WorkbookBrowser }>({
  workbook: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(new WorkbookBrowser(page));
    expect(errors, 'The production components must not throw browser errors').toEqual([]);
  },
});
export { expect };