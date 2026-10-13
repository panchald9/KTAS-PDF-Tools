// Polyfill for Promise.withResolvers if needed by older browsers
if (typeof Promise.withResolvers === 'undefined') {
  // @ts-expect-error polyfill
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

const thumbnailCache = new Map<string, string>();
const documentPromiseCache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = window.atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function getPdfDocument(fileKey: string, base64Data: string, password = ''): Promise<pdfjsLib.PDFDocumentProxy> {
  const cacheKey = `${fileKey}:${password}`;
  const cached = documentPromiseCache.get(cacheKey);
  if (cached) return cached;

  const uint8Array = base64ToUint8Array(base64Data);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    password: password || undefined,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@6.4.299/cmaps/',
    cMapPacked: true,
  });

  const promise = loadingTask.promise;
  documentPromiseCache.set(cacheKey, promise);
  return promise;
}

export async function renderPdfPageThumbnail(
  fileKey: string,
  base64Data: string,
  pageNumber: number,
  targetWidth = 320,
  password = ''
): Promise<string> {
  const cacheKey = `${fileKey}:${password}:${pageNumber}:${targetWidth}`;
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey)!;
  }

  try {
    const doc = await getPdfDocument(fileKey, base64Data, password);
    const page = await doc.getPage(pageNumber);

    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 1 ? 1.5 : 1;
    const scale = (targetWidth / unscaledViewport.width) * dpr;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2d canvas context');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      intent: 'display',
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    thumbnailCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn(`[PDF Preview] Real-time rendering page ${pageNumber} failed:`, err);
    throw err;
  }
}

export async function renderPdfPageFull(
  fileKey: string,
  base64Data: string,
  pageNumber: number,
  targetWidth = 900,
  password = ''
): Promise<string> {
  const cacheKey = `${fileKey}:${password}:${pageNumber}:full:${targetWidth}`;
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey)!;
  }

  const doc = await getPdfDocument(fileKey, base64Data, password);
  const page = await doc.getPage(pageNumber);

  const unscaled = page.getViewport({ scale: 1.0 });
  const scale = targetWidth / unscaled.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get 2d canvas context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    intent: 'display',
  }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  thumbnailCache.set(cacheKey, dataUrl);
  return dataUrl;
}
