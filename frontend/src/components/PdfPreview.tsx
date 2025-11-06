'use client'

import { useState } from 'react'
import { Loader2, ZoomIn, ZoomOut, Maximize2, Download, AlertCircle } from 'lucide-react'

interface PdfPreviewProps {
  fileUrl: string
  filename?: string
  onDownload?: () => void
}

export function PdfPreview({ fileUrl, filename, onDownload }: PdfPreviewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [zoom, setZoom] = useState(100)

  const handleLoad = () => {
    setIsLoading(false)
    setHasError(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

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
    // Open PDF in new window for fullscreen view
    window.open(fileUrl, '_blank')
  }

  if (hasError) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Failed to load PDF
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            The PDF file could not be displayed. You can still download it.
          </p>
          {onDownload && (
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300 truncate max-w-xs" title={filename}>
            {filename || 'Document'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom Controls */}
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-3 py-1 text-xs text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors min-w-[60px]"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-700 mx-2" />

          {/* Fullscreen */}
          <button
            onClick={handleFullscreen}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Open in new window"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Download */}
          {onDownload && (
            <button
              onClick={onDownload}
              className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* PDF Viewer */}
<div className="flex-1 relative bg-white" style={{ minHeight: '100%' }}>
  {isLoading && (
    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Loading PDF...</p>
      </div>
    </div>
  )}
  <iframe
    src={`${fileUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
    className="w-full shadow-2xl"
    style={{
      width: `${zoom}%`,
      height: '100%',
      minHeight: '600px',
      border: 'none',
      display: 'block',
    }}
    onLoad={handleLoad}
    onError={handleError}
    title={filename || 'PDF Preview'}
  />
</div>
    </div>
  )
}

// Simpler embedded version (no toolbar)
export function PdfPreviewSimple({ fileUrl, filename }: { fileUrl: string; filename?: string }) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Failed to load PDF</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative bg-gray-100">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      )}
      <iframe
        src={`${fileUrl}#view=FitH&toolbar=0&navpanes=0`}
        className="w-full h-full border-0"
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