/**
 * Submission card component - displays input file and output file.
 */

'use client'

import { useState } from 'react'
import { Download, Eye, RotateCcw, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { fillPdf, downloadPDF } from '@/lib/api-client'
import type { CardSubmission, FillReport } from '@/types'

interface SubmissionCardProps {
  submission:CardSubmission
  onReset: () => void
}

export default function SubmissionCard({ submission, onReset }: SubmissionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [filling, setFilling] = useState(false)
  const [fillReport, setFillReport] = useState<FillReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFillPdf = async () => {
    setFilling(true)
    setError(null)

    try {
      const report = await fillPdf(submission.id)
      setFillReport(report)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fill failed')
    } finally {
      setFilling(false)
    }
  }

  const handleDownload = async () => {
    try {
      await downloadPDF(submission.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Card Content */}
      <div className="p-6">
        <div className="flex items-start gap-6">
          {/* Left Column: Input File */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-gray-400 hover:text-gray-600"
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              <span className="text-sm font-medium text-gray-500">INPUT</span>
            </div>

            <div className="pl-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">📄</span>
                <div>
                  <p className="font-medium text-gray-900">{submission.filename}</p>
                  <p className="text-sm text-gray-500">ACORD 126</p>
                </div>
              </div>

              {submission.confidence !== undefined && (
                <p className="text-sm text-gray-600 mt-2">
                  ✅ Extracted ({Math.round(submission.confidence * 100)}% confidence)
                </p>
              )}

              {expanded && submission.warnings && submission.warnings.length > 0 && (
                <div className="mt-3 text-sm text-amber-600">
                  <p className="font-medium mb-1">⚠️ {submission.warnings.length} warnings:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {submission.warnings.slice(0, 3).map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Output File */}
          <div className="flex-1">
            <div className="mb-2">
              <span className="text-sm font-medium text-gray-500">OUTPUT</span>
            </div>

            {!fillReport ? (
              <div className="pl-6">
                <p className="text-gray-400 mb-4">⏸️ Not generated yet</p>
                <button
                  onClick={handleFillPdf}
                  disabled={filling}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {filling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Output'
                  )}
                </button>
              </div>
            ) : (
              <div className="pl-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">📥</span>
                  <div>
                    <p className="font-medium text-gray-900">ACORD_126_filled.pdf</p>
                    <p className="text-sm text-gray-500">✅ Ready</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Preview"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleFillPdf}
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Re-generate"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={onReset}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 text-sm text-gray-600">
                    <p className="font-medium mb-1">Fill Report:</p>
                    <ul className="space-y-1">
                      <li>• {fillReport.written} fields written ✅</li>
                      <li>• {fillReport.skipped} fields skipped</li>
                      {fillReport.warnings && fillReport.warnings.length > 0 && (
                        <li>• {fillReport.warnings.length} warnings ⚠️</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}