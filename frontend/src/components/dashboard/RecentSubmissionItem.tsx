/**
 * RecentSubmissionItem Component
 * Individual submission row in the Recent Submissions list
 */

'use client'

import React from 'react'
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Loader2,
  ChevronRight 
} from 'lucide-react'
import type { RecentSubmission } from '@/types'

interface RecentSubmissionItemProps {
  submission: RecentSubmission
  onClick?: () => void
}

export default function RecentSubmissionItem({ 
  submission, 
  onClick 
}: RecentSubmissionItemProps) {
  
  // Get status badge configuration
  const getStatusConfig = () => {
    switch (submission.status) {
      case 'ready':
      case 'filled':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          label: 'Complete'
        }
      case 'extracting':
      case 'uploading':
        return {
          icon: Loader2,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          label: 'Processing',
          spin: true
        }
      case 'error':
        return {
          icon: AlertCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          label: 'Error'
        }
      default:
        return {
          icon: Clock,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          label: 'In Progress'
        }
    }
  }

  // Get template type display
  const getTemplateTypeDisplay = () => {
    if (submission.template_metadata?.name) {
      return submission.template_metadata.name
    }
    if (!submission.template_type) return null

    const typeMap: Record<string, string> = {
      'property_renewal': '🏢 Property',
      'wc_quote': '👷 Workers Comp',
      'gl_new_business': '🛡️ GL',
      'custom': '✨ Custom'
    }
    
    return typeMap[submission.template_type] || submission.template_type
  }

  const statusConfig = getStatusConfig()
  const StatusIcon = statusConfig.icon

  // Safely display submission name
  const displayName = submission.name || `Submission ${submission.submission_id.slice(0, 8)}`

  return (
    <div
      onClick={onClick}
      className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors group"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left side - Main info */}
        <div className="flex-1 min-w-0">
          {/* Submission name and template type */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-gray-900 truncate">
              {displayName}
            </h4>
            {submission.template_type && (
              <span className="text-xs text-gray-500 flex-shrink-0">
                {getTemplateTypeDisplay()}
              </span>
            )}
          </div>

          {/* Document types present */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <FileText className="w-3.5 h-3.5" />
              <span>
                {submission.file_count || 0} file{submission.file_count !== 1 ? 's' : ''}
              </span>
            </div>
            
            {submission.document_types_present && submission.document_types_present.length > 0 && (
              <>
                <span className="text-gray-300">•</span>
                <div className="flex flex-wrap gap-1">
                  {submission.document_types_present.slice(0, 3).map((docType, idx) => (
                    <span 
                      key={idx}
                      className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded"
                    >
                      {docType}
                    </span>
                  ))}
                  {submission.document_types_present.length > 3 && (
                    <span className="text-xs text-gray-500">
                      +{submission.document_types_present.length - 3} more
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Missing documents warning */}
          {submission.missing_document_types && submission.missing_document_types.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-orange-600 mb-2">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>
                Missing: {submission.missing_document_types.join(', ')}
              </span>
            </div>
          )}

          {/* Completion progress bar */}
          {submission.completion_percentage < 100 && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${submission.completion_percentage || 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">
                {submission.completion_percentage || 0}%
              </span>
            </div>
          )}

          {/* Last activity timestamp */}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span>{submission.last_activity || 'Recently'}</span>
          </div>
        </div>

        {/* Right side - Status badge and arrow */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Status badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${statusConfig.bgColor}`}>
            <StatusIcon 
              className={`w-4 h-4 ${statusConfig.color} ${statusConfig.spin ? 'animate-spin' : ''}`} 
            />
            <span className={`text-xs font-medium ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>

          {/* Arrow icon */}
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </div>
      </div>
    </div>
  )
}
