'use client'

import { useState } from 'react'
import { X, Download, Loader2, CheckCircle2 } from 'lucide-react'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  submissionId: string
  filename?: string
  onExport: () => Promise<void>
}

export function ExportModal({
  isOpen,
  onClose,
  submissionId,
  filename,
  onExport,
}: ExportModalProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  if (!isOpen) return null

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await onExport()
      setIsComplete(true)
      setTimeout(() => {
        onClose()
        setIsComplete(false)
      }, 2000)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Export PDF</h3>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {isComplete ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                Export Complete!
              </h4>
              <p className="text-sm text-gray-600">
                Your filled PDF has been downloaded.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-sm text-gray-700 mb-4">
                  This will generate a filled PDF with all the extracted and edited data.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">
                    File to export:
                  </h4>
                  <p className="text-sm text-blue-800 font-mono">
                    {filename || 'document.pdf'}
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-xs text-yellow-800">
                  <strong>Note:</strong> Make sure to save any unsaved changes before exporting.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isComplete && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:bg-green-400"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export PDF
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}