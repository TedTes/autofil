'use client'

import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import DocumentTypeBadge from './DocumentTypeBadge'
import type { ClassificationResult } from '@/types/extraction'

interface ClassificationPreviewProps {
  filename: string
  classification: ClassificationResult
  onConfirm?: () => void
  onReject?: () => void
  showActions?: boolean
  className?: string
}

export default function ClassificationPreview({
  filename,
  classification,
  onConfirm,
  onReject,
  showActions = true,
  className = '',
}: ClassificationPreviewProps) {
  const {
    document_type,
    confidence,
    indicators,
    classifier_results,
    is_supported,
    needs_review,
    recommended_action,
    message,
    review_reasons,
  } = classification

  // Determine confidence level
  const getConfidenceLevel = (conf: number): {
    level: 'high' | 'medium' | 'low'
    color: string
    bgColor: string
    icon: typeof CheckCircle2
    message: string
  } => {
    if (conf >= 0.8) {
      return {
        level: 'high',
        color: 'text-green-700',
        bgColor: 'bg-green-50',
        icon: CheckCircle2,
        message: 'High confidence classification',
      }
    }
    if (conf >= 0.6) {
      return {
        level: 'medium',
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-50',
        icon: Info,
        message: 'Medium confidence - please review',
      }
    }
    return {
      level: 'low',
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
      icon: AlertTriangle,
      message: 'Low confidence - manual verification recommended',
    }
  }

  const confidenceInfo = getConfidenceLevel(confidence)
  const Icon = confidenceInfo.icon

  return (
    <div className={`bg-white border-2 border-gray-200 rounded-xl p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Document Classification
          </h3>
          <p className="text-sm text-gray-600 truncate">{filename}</p>
        </div>
        
        <DocumentTypeBadge
          documentType={document_type}
          confidence={confidence}
          size="md"
        />
      </div>

      {/* Confidence Level */}
      <div className={`flex items-center gap-3 p-3 rounded-lg ${confidenceInfo.bgColor} mb-4`}>
        <Icon className={`w-5 h-5 ${confidenceInfo.color} flex-shrink-0`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${confidenceInfo.color}`}>
            {confidenceInfo.message}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            Confidence: {Math.round(confidence * 100)}%
          </p>
        </div>
      </div>

      {(is_supported === false || needs_review) && (
        <div
          className={`mb-4 rounded-lg border p-3 ${
            is_supported === false
              ? 'border-red-200 bg-red-50'
              : 'border-yellow-200 bg-yellow-50'
          }`}
        >
          <p
            className={`text-sm font-medium ${
              is_supported === false ? 'text-red-800' : 'text-yellow-800'
            }`}
          >
            {message || 'This file should be reviewed before continuing.'}
          </p>
          {recommended_action && (
            <p className="mt-1 text-xs text-gray-700">
              Recommended action: {recommended_action.replaceAll('_', ' ')}
            </p>
          )}
          {review_reasons && review_reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-gray-700">
              {review_reasons.map((reason, index) => (
                <li key={index}>• {reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Detection Indicators */}
      {indicators && indicators.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">
            Detection Indicators:
          </h4>
          <div className="flex flex-wrap gap-2">
            {indicators.map((indicator, index) => {
              // Handle both string and object indicators
              const text = typeof indicator === 'string' 
                ? indicator
                : indicator.value || indicator.text || JSON.stringify(indicator);
              
              return (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md border border-blue-200"
                >
                  {text} 
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Classifier Details (expandable) */}
      {classifier_results && classifier_results.length > 0 && (
        <details className="mb-4">
          <summary className="text-xs font-semibold text-gray-700 cursor-pointer hover:text-gray-900">
            Classifier Details ({classifier_results.length} classifiers)
          </summary>
          <div className="mt-2 space-y-2">
            {classifier_results.map((result, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-md"
              >
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-700">
                    {result.classifier}
                  </p>
                  <p className="text-xs text-gray-500">
                    {result.document_type}
                  </p>
                </div>
                <span className="text-xs font-semibold text-gray-600">
                  {Math.round(result.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Actions */}
      {showActions && is_supported !== false && (onConfirm || onReject) && (
        <div className="flex gap-2 pt-2 border-t border-gray-200">
          {onConfirm && (
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Confirm & Extract
            </button>
          )}
          {onReject && (
            <button
              onClick={onReject}
              className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 transition-colors"
            >
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Compact variant for inline display
interface CompactClassificationPreviewProps {
  classification: ClassificationResult
  className?: string
}

export function CompactClassificationPreview({
  classification,
  className = '',
}: CompactClassificationPreviewProps) {
  const { document_type, confidence, indicators } = classification

  const getConfidenceColor = (conf: number): string => {
    if (conf >= 0.8) return 'text-green-600'
    if (conf >= 0.6) return 'text-yellow-600'
    return 'text-orange-600'
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <DocumentTypeBadge
        documentType={document_type}
        confidence={confidence}
        size="sm"
      />
      
      {indicators && indicators.length > 0 && (
        <span className="text-xs text-gray-500">
          • {indicators.length} indicator{indicators.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

// List variant for multiple classifications
interface ClassificationListProps {
  classifications: Array<{
    filename: string
    classification: ClassificationResult
  }>
  onSelect?: (index: number) => void
  className?: string
}

export function ClassificationList({
  classifications,
  onSelect,
  className = '',
}: ClassificationListProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Classified Documents ({classifications.length})
      </h3>
      
      {classifications.map((item, index) => (
        <button
          key={index}
          onClick={() => onSelect?.(index)}
          className="w-full text-left p-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-900 truncate flex-1">
              {item.filename}
            </p>
            <DocumentTypeBadge
              documentType={item.classification.document_type}
              confidence={item.classification.confidence}
              size="sm"
            />
          </div>
          
          {item.classification.indicators && item.classification.indicators.length > 0 && (
            <p className="text-xs text-gray-500">
              {item.classification.indicators.length} detection indicator
              {item.classification.indicators.length !== 1 ? 's' : ''} found
            </p>
          )}
        </button>
      ))}
    </div>
  )
}
