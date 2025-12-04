/**
 * TemplateFillStatusCard Component
 * 
 * Displays the status of a single template fill operation.
 * Shows pending → in-progress → success/error states with detailed metrics.
 * 
 * ADD THIS as a new file: frontend/src/components/client/TemplateFillStatusCard.tsx
 */

'use client'

import React, { useState } from 'react'
import {
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react'
import type { TemplateFillResult } from '@/types/'

interface TemplateFillStatusCardProps {
  result: TemplateFillResult
  isActive?: boolean
  onDownload?: (url: string, filename: string) => void
}

export default function TemplateFillStatusCard({
  result,
  isActive = false,
  onDownload,
}: TemplateFillStatusCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getStatusIcon = () => {
    switch (result.status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-400" />
      case 'in-progress':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />
    }
  }

  const getStatusBadge = () => {
    switch (result.status) {
      case 'pending':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
            Pending
          </span>
        )
      case 'in-progress':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
            Processing...
          </span>
        )
      case 'success':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            Completed
          </span>
        )
      case 'error':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
            Failed
          </span>
        )
    }
  }

  const hasDetails = result.status === 'success' || result.status === 'error'

  return (
    <div
      className={`border rounded-lg transition-all ${
        isActive
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : result.status === 'error'
          ? 'border-red-200 bg-red-50'
          : result.status === 'success'
          ? 'border-green-200 bg-green-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div className="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Template Name & Status */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold text-gray-900 truncate">
                {result.template_name}
              </h3>
              {getStatusBadge()}
            </div>

            {/* Success Metrics */}
            {result.status === 'success' && result.report && (
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>
                    {result.report.filled_fields}/{result.report.total_fields} fields
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center text-xs text-white font-bold">
                    {Math.round(result.report.coverage)}
                  </div>
                  <span>{result.report.coverage}% coverage</span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {result.status === 'error' && result.error && (
              <p className="text-sm text-red-600 mb-2">{result.error}</p>
            )}

            {/* Warnings/Errors Badge */}
            {result.status === 'success' && result.report && (
              <div className="flex items-center gap-2">
                {result.report.warnings.length > 0 && (
                  <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {result.report.warnings.length} warning
                    {result.report.warnings.length !== 1 ? 's' : ''}
                  </span>
                )}
                {result.report.errors.length > 0 && (
                  <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    {result.report.errors.length} error
                    {result.report.errors.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Download Button */}
            {result.status === 'success' && result.report?.output.url && (
              <button
                onClick={() =>
                  onDownload?.(
                    result.report!.output.url!,
                    result.report!.output.filename
                  )
                }
                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                title="Download PDF"
              >
                <Download className="w-4 h-4" />
              </button>
            )}

            {/* Expand/Collapse */}
            {hasDetails && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && hasDetails && (
        <div className="border-t border-gray-200 p-4 space-y-3 bg-white">
          {/* Success Details */}
          {result.status === 'success' && result.report && (
            <>
              {/* Unmapped Fields */}
              {result.report.unmapped_fields.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">
                    Unmapped Fields ({result.report.unmapped_fields.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {result.report.unmapped_fields.slice(0, 5).map((field, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded"
                      >
                        {field.canonical_name}
                        {field.reason && (
                          <span className="text-gray-400 ml-1">
                            ({field.reason})
                          </span>
                        )}
                      </div>
                    ))}
                    {result.report.unmapped_fields.length > 5 && (
                      <p className="text-xs text-gray-500 italic">
                        +{result.report.unmapped_fields.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {result.report.warnings.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">
                    Warnings ({result.report.warnings.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {result.report.warnings.map((warning, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded flex items-start gap-1"
                      >
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>{warning.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {result.report.errors.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">
                    Errors ({result.report.errors.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {result.report.errors.map((error, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded flex items-start gap-1"
                      >
                        <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>{error.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error Details */}
          {result.status === 'error' && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                Error Details
              </h4>
              <div className="text-xs text-red-700 bg-red-50 px-3 py-2 rounded">
                <p className="font-medium mb-1">
                  {result.error_type?.toUpperCase() || 'ERROR'}
                </p>
                <p>{result.error}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}