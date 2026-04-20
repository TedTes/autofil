'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

type BBox = [number, number, number, number]

type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
  destroy: () => Promise<void>
}

type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport
  render: (options: {
    canvas: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    viewport: PdfViewport
  }) => { promise: Promise<void> }
}

type PdfViewport = {
  width: number
  height: number
  convertToViewportRectangle: (rect: BBox) => number[]
}

type HighlightRect = {
  left: number
  top: number
  width: number
  height: number
}

interface PdfPreviewProps {
  fileUrl: string
  filename?: string
  targetPage?: number
  sourceBbox?: BBox
  onDownload?: () => void
}

function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(page, 1), Math.max(pageCount, 1))
}

function buildNativePdfUrl(fileUrl: string, page?: number): string {
  const fragment = [`view=FitH`, `toolbar=0`, `navpanes=0`]
  if (page && page > 0) {
    fragment.unshift(`page=${page}`)
  }
  return `${fileUrl}#${fragment.join('&')}`
}

export function PdfPreview({
  fileUrl,
  filename,
  targetPage,
  sourceBbox,
  onDownload,
}: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const targetPageRef = useRef(targetPage)
  const [isLoading, setIsLoading] = useState(true)
  const [isRendering, setIsRendering] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [useNativePreview, setUseNativePreview] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(targetPage && targetPage > 0 ? targetPage : 1)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null)
  const targetHighlightPage = targetPage && targetPage > 0 ? targetPage : 1

  useEffect(() => {
    targetPageRef.current = targetPage
  }, [targetPage])

  useEffect(() => {
    let active = true
    let loadedDoc: PdfDocument | null = null

    async function loadPdf() {
      if (!fileUrl || fileUrl === 'about:blank') return

      setIsLoading(true)
      setHasError(false)
      setUseNativePreview(false)
      setPdfDoc(null)
      setHighlightRect(null)

      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString()
        const loadingTask = pdfjsLib.getDocument(fileUrl)
        const doc = (await loadingTask.promise) as unknown as PdfDocument
        loadedDoc = doc

        if (!active) return
        setPdfDoc(doc)
        setPageCount(doc.numPages)
        setCurrentPage(
          clampPage(
            targetPageRef.current && targetPageRef.current > 0 ? targetPageRef.current : 1,
            doc.numPages
          )
        )
      } catch (error) {
        console.warn('PDF.js preview unavailable; falling back to browser PDF viewer:', error)
        if (active) {
          setPdfDoc(null)
          setPageCount(0)
          setHighlightRect(null)
          setCurrentPage(targetPageRef.current && targetPageRef.current > 0 ? targetPageRef.current : 1)
          setUseNativePreview(true)
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadPdf()

    return () => {
      active = false
      if (loadedDoc) {
        void loadedDoc.destroy()
      }
    }
  }, [fileUrl])

  useEffect(() => {
    if (!targetPage || targetPage <= 0 || pageCount <= 0) return
    setCurrentPage(clampPage(targetPage, pageCount))
  }, [targetPage, pageCount])

  useEffect(() => {
    let cancelled = false

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return

      setIsRendering(true)
      setHighlightRect(null)

      try {
        const page = await pdfDoc.getPage(currentPage)
        if (cancelled || !canvasRef.current) return

        const viewport = page.getViewport({ scale: zoom / 100 })
        const outputScale = window.devicePixelRatio || 1
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error('Canvas context unavailable')
        }

        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
        await page.render({ canvas, canvasContext: context, viewport }).promise

        if (cancelled) return
        setPageSize({ width: viewport.width, height: viewport.height })

        if (sourceBbox && targetHighlightPage === currentPage) {
          const [x0, y0, x1, y1] = viewport.convertToViewportRectangle(sourceBbox)
          const left = Math.min(x0, x1)
          const top = Math.min(y0, y1)
          setHighlightRect({
            left,
            top,
            width: Math.abs(x1 - x0),
            height: Math.abs(y1 - y0),
          })
        }
      } catch (error) {
        console.error('Failed to render PDF page:', error)
        if (!cancelled) {
          setHasError(true)
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false)
          setIsLoading(false)
        }
      }
    }

    void renderPage()

    return () => {
      cancelled = true
    }
  }, [pdfDoc, currentPage, zoom, sourceBbox, targetHighlightPage])

  useEffect(() => {
    if (!highlightRect || !highlightRef.current) return
    const frame = window.requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [highlightRect])

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 200))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50))
  }

  const handleResetZoom = () => {
    setZoom(100)
  }

  const handleFullscreen = () => {
    const pageFragment = currentPage > 0 ? `#page=${currentPage}` : ''
    window.open(`${fileUrl}${pageFragment}`, '_blank')
  }

  const handlePreviousPage = () => {
    setCurrentPage((prev) => clampPage(prev - 1, pageCount))
  }

  const handleNextPage = () => {
    setCurrentPage((prev) => clampPage(prev + 1, pageCount))
  }

  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">Failed to load PDF</h3>
          <p className="mb-4 text-sm text-gray-600">
            The PDF file could not be displayed. You can still download it.
          </p>
          {onDownload && (
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          )}
        </div>
      </div>
    )
  }

  if (useNativePreview) {
    const nativePage = targetPage && targetPage > 0 ? targetPage : currentPage

    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="max-w-xs truncate text-sm text-gray-300" title={filename}>
              {filename || 'Document'}
            </span>
            <span className="whitespace-nowrap text-xs text-amber-300">
              Browser preview
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleFullscreen}
              className="rounded p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              title="Open in new window"
            >
              <Maximize2 className="h-4 w-4" />
            </button>

            {onDownload && (
              <button
                onClick={onDownload}
                className="rounded p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                title="Download PDF"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          PDF.js could not initialize in this browser session, so the native PDF viewer is being used.
          Field navigation can open the right page, but exact field highlighting is unavailable here.
        </div>

        <div className="relative flex-1 bg-white">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
              <div className="text-center">
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-600">Loading PDF...</p>
              </div>
            </div>
          )}
          <iframe
            src={buildNativePdfUrl(fileUrl, nativePage)}
            className="h-full w-full border-0"
            onLoad={() => {
              setIsLoading(false)
              setHasError(false)
            }}
            onError={() => {
              setIsLoading(false)
              setHasError(true)
            }}
            title={filename || 'PDF Preview'}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="max-w-xs truncate text-sm text-gray-300" title={filename}>
            {filename || 'Document'}
          </span>
          {pageCount > 0 && (
            <span className="whitespace-nowrap text-xs text-gray-400">
              Page {currentPage} of {pageCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handlePreviousPage}
            disabled={currentPage <= 1}
            className="rounded p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleNextPage}
            disabled={pageCount === 0 || currentPage >= pageCount}
            className="rounded p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="mx-2 h-6 w-px bg-gray-700" />

          <button
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="rounded p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="min-w-[60px] rounded px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            className="rounded p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <div className="mx-2 h-6 w-px bg-gray-700" />

          <button
            onClick={handleFullscreen}
            className="rounded p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            title="Open in new window"
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          {onDownload && (
            <button
              onClick={onDownload}
              className="rounded p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              title="Download PDF"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="relative flex-1 overflow-auto bg-white p-6">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80">
            <div className="text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-600">Loading PDF...</p>
            </div>
          </div>
        )}
        {isRendering && !isLoading && (
          <div className="absolute right-4 top-4 z-20 rounded-full bg-gray-800/80 p-2">
            <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
          </div>
        )}

        <div
          className="relative mx-auto bg-white shadow-2xl"
          style={{
            width: pageSize?.width,
            height: pageSize?.height,
          }}
        >
          <canvas ref={canvasRef} className="block" />
          {highlightRect && (
            <div
              ref={highlightRef}
              className="pointer-events-none absolute rounded-sm border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_0_4px_rgba(37,99,235,0.18)]"
              style={{
                left: highlightRect.left,
                top: highlightRect.top,
                width: highlightRect.width,
                height: highlightRect.height,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export function PdfPreviewSimple({ fileUrl, filename }: { fileUrl: string; filename?: string }) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-gray-400" />
          <p className="text-sm text-gray-600">Failed to load PDF</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full bg-gray-100">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}
      <iframe
        src={`${fileUrl}#view=FitH&toolbar=0&navpanes=0`}
        className="h-full w-full border-0"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          setHasError(true)
        }}
        title={filename || 'PDF Preview'}
      />
    </div>
  )
}
