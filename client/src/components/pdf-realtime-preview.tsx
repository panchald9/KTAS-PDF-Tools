import React, { useEffect, useState } from 'react';
import { renderPdfPageThumbnail, renderPdfPageFull } from '@/lib/pdf-preview';
import { FileText, Loader2, Maximize2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PdfPageThumbnailProps {
  fileId: string;
  dataBase64?: string;
  pageNumber: number;
  width: number;
  height: number;
  rotation?: number;
  fallbackBase64?: string;
  password?: string;
  onOpenPreview?: (pageNumber: number) => void;
}

export function PdfPageThumbnail({
  fileId,
  dataBase64,
  pageNumber,
  width,
  height,
  fallbackBase64,
  password = '',
  onOpenPreview,
}: PdfPageThumbnailProps) {
  const [realtimeUrl, setRealtimeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    if (!dataBase64) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setHasError(false);

    renderPdfPageThumbnail(fileId, dataBase64, pageNumber, 320, password)
      .then((url) => {
        if (isMounted) {
          setRealtimeUrl(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setHasError(true);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [fileId, dataBase64, pageNumber, password]);

  const fallbackSrc = React.useMemo(() => {
    if (!fallbackBase64) return '';
    if (fallbackBase64.startsWith('data:')) return fallbackBase64;
    if (fallbackBase64.startsWith('PHN2') || fallbackBase64.startsWith('PD94') || fallbackBase64.startsWith('<')) {
      return `data:image/svg+xml;base64,${fallbackBase64}`;
    }
    return `data:image/png;base64,${fallbackBase64}`;
  }, [fallbackBase64]);

  return (
    <div
      className="group relative overflow-hidden rounded-md border border-border bg-white shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {/* Real-time Rendered Page */}
      {realtimeUrl ? (
        <img
          src={realtimeUrl}
          alt={`Page ${pageNumber}`}
          className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
          loading="lazy"
        />
      ) : fallbackSrc && !hasError ? (
        <img
          src={fallbackSrc}
          alt={`Page ${pageNumber} placeholder`}
          className="h-full w-full object-contain opacity-70"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/60">
          <FileText className="h-8 w-8 text-muted-foreground/60" />
        </div>
      )}

      {/* Loading indicator overlay (subtle) */}
      {loading && !realtimeUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-[1px]">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      )}

      {/* Zoom / Preview Button on Hover */}
      {onOpenPreview && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPreview(pageNumber);
          }}
          title={`Enlarge Page ${pageNumber}`}
          className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Real-time badge indicator */}
      {realtimeUrl && (
        <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur-xs">
          p.{pageNumber}
        </span>
      )}
    </div>
  );
}

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileId: string;
  dataBase64?: string;
  totalPages: number;
  initialPage?: number;
  password?: string;
}

export function PdfPreviewModal({
  isOpen,
  onClose,
  fileName,
  fileId,
  dataBase64,
  totalPages,
  initialPage = 1,
  password = '',
}: PdfPreviewModalProps) {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [scaleWidth, setScaleWidth] = useState<number>(850);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setCurrentPage(initialPage);
    }
  }, [isOpen, initialPage]);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen || !dataBase64) return;

    setLoading(true);
    renderPdfPageFull(fileId, dataBase64, currentPage, scaleWidth, password)
      .then((url) => {
        if (isMounted) {
          setPageUrl(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to render full page preview:', err);
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, fileId, dataBase64, currentPage, scaleWidth, password]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-card">
        {/* Header toolbar */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
          <div className="flex items-center gap-2 truncate pr-4">
            <DialogTitle className="text-base font-semibold truncate max-w-sm">
              {fileName}
            </DialogTitle>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              (Page {currentPage} of {totalPages})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScaleWidth((w) => Math.max(500, w - 150))}
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono px-1 text-muted-foreground">
              {Math.round((scaleWidth / 850) * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScaleWidth((w) => Math.min(1600, w + 150))}
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            <div className="h-4 w-[1px] bg-border mx-1" />

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview Viewport */}
        <div className="flex-1 overflow-auto bg-muted/40 p-4 flex items-center justify-center min-h-[500px]">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs">Rendering page {currentPage}...</p>
            </div>
          ) : pageUrl ? (
            <div className="shadow-lg rounded border bg-white overflow-hidden transition-all">
              <img
                src={pageUrl}
                alt={`Page ${currentPage}`}
                style={{ width: `${scaleWidth}px`, maxWidth: '100%' }}
                className="block h-auto"
              />
            </div>
          ) : (
            <div className="text-center text-muted-foreground p-8">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Could not render preview for this page.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
