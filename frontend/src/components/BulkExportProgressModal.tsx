'use client'

import { X, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface BulkExportProgressModalProps {
  isOpen: boolean
  progress: {
    current: number
    total: number
  }
  isProcessing: boolean
  results?: {
    success: number
    failed: number
    errors: string[]
  }
  onClose: () => void
  onRetry?: () => void
}

export function BulkExportProgressModal({
  isOpen,
  progress,
  isProcessing,
  results,
  onClose,
  onRetry
}: BulkExportProgressModalProps) {
  if (!isOpen) return null

  const percentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  const isComplete = !isProcessing && results !== undefined
  const hasErrors = results && results.failed > 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {isProcessing ? 'Exporting Files...' : 'Export Complete'}
          </h3>
          {isComplete && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {isProcessing ? (
            /* Processing State */
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-blue-100 rounded-full" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900 mb-1">
                  {percentage}%
                </p>
                <p className="text-sm text-gray-600">
                  Processing {progress.current} of {progress.total} files
                </p>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 bg-blue-600 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <p className="text-xs text-center text-gray-500">
                {progress.total >= 3
                  ? 'Creating ZIP archive with all files...'
                  : 'Please wait while we export your files'
                }
              </p>
            </div>
          ) : results ? (
            /* Complete State */
            <div className="space-y-4">
              {/* Success Section */}
              {results.success > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-green-900 mb-1">
                        Successfully Exported
                      </h4>
                      <p className="text-sm text-green-800">
                        {results.success} file{results.success !== 1 ? 's' : ''} exported successfully
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Section */}
              {hasErrors && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-red-900 mb-1">
                        Export Failed
                      </h4>
                      <p className="text-sm text-red-800 mb-2">
                        {results.failed} file{results.failed !== 1 ? 's' : ''} failed to export
                      </p>
                      
                      {results.errors.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                          {results.errors.map((error, idx) => (
                            <p key={idx} className="text-xs text-red-700">
                              • {error}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {isComplete && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
            {hasErrors && onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
              >
                Retry Failed
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}