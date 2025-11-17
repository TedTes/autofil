'use client'

import { useState } from 'react'
import { X, FileText, Loader2, CheckCircle2, Download, Eye } from 'lucide-react'
import { fillPdf,downloadPDF } from '@/lib/api-client'
import type { FillReport } from '@/types'

interface FillModalProps {
  isOpen: boolean
  onClose: () => void
  submissionId: string
  filename?: string
  onFillComplete?: (report: FillReport) => void
}

export function FillModal({
  isOpen,
  onClose,
  submissionId,
  filename,
  onFillComplete,
}: FillModalProps) {
  const [isFilling, setIsFilling] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [fillReport, setFillReport] = useState<FillReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleFill = async () => {
    setIsFilling(true)
    setError(null)
    try {
      const report = await fillPdf(submissionId)
      setFillReport(report)
      setIsComplete(true)
      onFillComplete?.(report)
    } catch (err) {
      console.error('Fill failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to fill PDF')
    } finally {
      setIsFilling(false)
    }
  }

  const handleDownload = async () => {
    if (!fillReport) return
    await downloadPDF(fillReport.submission_id)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Fill PDF</h3>
          <button
            onClick={onClose}
            disabled={isFilling}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {error ? (
            /* Error State */
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-red-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                Fill Failed
              </h4>
              <p className="text-sm text-red-600 mb-4">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  setIsComplete(false)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          ) : isComplete && fillReport ? (
            /* Success State */
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                PDF Filled Successfully!
              </h4>
              
              {/* Fill Report Stats */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Fields written:</span>
                  <span className="text-sm font-semibold text-green-600">{fillReport.written}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Fields skipped:</span>
                  <span className="text-sm font-semibold text-orange-600">{fillReport.skipped}</span>
                </div>
                {fillReport.warnings && fillReport.warnings.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Warnings:</p>
                    <ul className="text-xs text-orange-600 space-y-1">
                      {fillReport.warnings.slice(0, 3).map((warning, i) => (
                        <li key={i}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Initial/Filling State */
            <>
              <div className="mb-6">
                <p className="text-sm text-gray-700 mb-4">
                  This will fill a PDF template with the extracted and edited data from this submission.
                </p>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-purple-900 mb-2">
                    File to process:
                  </h4>
                  <p className="text-sm text-purple-800 font-mono">
                    {filename || 'document.pdf'}
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Make sure you&apos;ve saved any changes before filling the PDF.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isComplete && !error && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isFilling}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleFill}
              disabled={isFilling}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium disabled:bg-purple-400"
            >
              {isFilling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Filling PDF...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Fill PDF
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}