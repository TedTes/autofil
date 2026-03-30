'use client'

import { useState } from 'react'
import { 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  ChevronDown, 
  ChevronRight,
  FileText,
  Calendar,
  DollarSign,
  Building2,
  User,
  Phone,
  Mail,
  Filter,
  AlertCircle,
  HelpCircle,
  Lightbulb,
  MapPin,
  Edit
} from 'lucide-react'
import type { ExtractionResult } from '@/types/extraction'

interface ExtractionResultsProps {
  result: ExtractionResult
  filename: string
  onEdit?: (field: string, value: string) => void
  showMetadata?: boolean
  className?: string
}

// Data Section Component
interface DataSectionProps {
  category: string
  fields: Array<{ key: string; value: string | number | boolean; confidence?: number }>
  isExpanded: boolean
  onToggle: () => void
  onEdit?: (field: string, value: string) => void
  showingFiltered: boolean
  result: ExtractionResult
}

// Individual Data Field Component
interface DataFieldProps {
  fieldKey: string
  value: string | number | boolean
  confidence?: number
  onEdit?: (field: string, value: string) => void
  result: ExtractionResult  
}

export default function ExtractionResults({
  result,
  filename,
  onEdit,
  showMetadata = true,
  className = '',
}: ExtractionResultsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']))
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState(false)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7) 
  
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }

  // Get confidence level styling
  const getConfidenceStyle = (confidence: number): {
    color: string
    bgColor: string
    label: string
  } => {
    if (confidence >= 0.8) {
      return { color: 'text-green-700', bgColor: 'bg-green-50', label: 'High' }
    }
    if (confidence >= 0.6) {
      return { color: 'text-yellow-700', bgColor: 'bg-yellow-50', label: 'Medium' }
    }
    return { color: 'text-orange-700', bgColor: 'bg-orange-50', label: 'Low' }
  }

  const filterFieldsByConfidence = (
    fields: Array<{ key: string; value: string | number | boolean; confidence?: number }>
  ) => {
    if (!showLowConfidenceOnly) return fields
    
    return fields.filter(f => 
      f.confidence !== undefined && f.confidence < confidenceThreshold
    )
  }

  const getLowConfidenceStats = () => {
    const allFields = Object.entries(result.data || {}).flatMap(([category, value]) =>
      flattenObject(value as Record<string, string | number | boolean>, category)
    )
    
    const lowConfFields = allFields.filter(([path]) => {
      const conf = result.field_confidence?.[path]
      return conf !== undefined && conf < confidenceThreshold
    })
    
    return {
      total: allFields.length,
      lowConfidence: lowConfFields.length,
      percentage: allFields.length > 0 
        ? Math.round((lowConfFields.length / allFields.length) * 100)
        : 0
    }
  }
  
  const stats = getLowConfidenceStats()
  const confidenceStyle = getConfidenceStyle(result.confidence)
  const reviewRequired = Boolean(result.metadata?.review_required)
  const reviewReasons = result.metadata?.review_reasons || []
  const recommendedAction = result.metadata?.recommended_action

  // Group data by category
  const groupedData = groupDataByCategory(result.data, result.field_confidence)

  return (
    <div className={`bg-white border-2 border-gray-200 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Extraction Results
            </h2>
            <p className="text-sm text-gray-600">{filename}</p>
          </div>
          
          {/* Overall Confidence */}
          <div className={`px-3 py-1.5 rounded-lg ${confidenceStyle.bgColor}`}>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${confidenceStyle.color}`}>
                {confidenceStyle.label} Confidence
              </span>
              <span className={`text-sm font-bold ${confidenceStyle.color}`}>
                {Math.round(result.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>
        
        {/* Low Confidence Alert */}
        {stats.lowConfidence > 0 && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-yellow-100 border border-yellow-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-yellow-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">
                {stats.lowConfidence} field{stats.lowConfidence !== 1 ? 's' : ''} below {Math.round(confidenceThreshold * 100)}% confidence
              </p>
              <p className="text-xs text-yellow-700 mt-0.5">
                These fields may need manual review
              </p>
            </div>
          </div>
        )}

        {reviewRequired && (
          <div className="mt-3 flex items-start gap-2 px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <HelpCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                Manual review is recommended before using this extraction
              </p>
              {recommendedAction && (
                <p className="text-xs text-amber-700 mt-0.5">
                  Recommended action: {recommendedAction.replaceAll('_', ' ')}
                </p>
              )}
              {reviewReasons.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {reviewReasons.map((reason, index) => (
                    <li key={`${reason}-${index}`}>• {reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
 
      {/* Filter Controls */}
      {stats.lowConfidence > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => setShowLowConfidenceOnly(!showLowConfidenceOnly)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                showLowConfidenceOnly
                  ? 'bg-yellow-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              {showLowConfidenceOnly ? 'Show All Fields' : 'Show Low Confidence Only'}
              {showLowConfidenceOnly && (
                <span className="ml-1 px-1.5 py-0.5 bg-yellow-700 text-white text-xs rounded">
                  {stats.lowConfidence}
                </span>
              )}
            </button>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Threshold:</label>
              <select
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="0.9">90%</option>
                <option value="0.8">80%</option>
                <option value="0.7">70%</option>
                <option value="0.6">60%</option>
                <option value="0.5">50%</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Warnings/Errors */}
      {((result.warnings && result.warnings.length > 0) || (result.errors && result.errors.length > 0)) && (
        <div className="px-6 py-4 space-y-2 bg-yellow-50 border-b border-yellow-100">
          {result.errors && result.errors.map((error, index) => (
            <div key={`error-${index}`} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-red-700">{error}</span>
            </div>
          ))}
          {result.warnings && result.warnings.map((warning, index) => (
            <div key={`warning-${index}`} className="flex items-start gap-2 text-sm">
              <Info className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <span className="text-yellow-700">{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Extracted Data Sections */}
      <div className="divide-y divide-gray-200">
        {Object.entries(groupedData).map(([category, fields]) => {
          const filteredFields = filterFieldsByConfidence(fields)
          
          // Skip empty sections when filtering
          if (showLowConfidenceOnly && filteredFields.length === 0) {
            return null
          }
          
          return (
            <DataSection
              key={category}
              category={category}
              fields={filteredFields} 
              isExpanded={expandedSections.has(category)}
              onToggle={() => toggleSection(category)}
              onEdit={onEdit}
              showingFiltered={showLowConfidenceOnly}
              result={result}
            />
          )
        })}
      </div>

      {/* Metadata */}
      {showMetadata && result.metadata && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={() => toggleSection('metadata')}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 w-full"
          >
            {expandedSections.has('metadata') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <span>Extraction Metadata</span>
          </button>
          
          {expandedSections.has('metadata') && (
            <div className="mt-3 space-y-2 text-xs text-gray-600">
              {result.metadata.extractor_used && (
                <div className="flex justify-between">
                  <span>Extractor:</span>
                  <span className="font-medium">{result.metadata.extractor_used}</span>
                </div>
              )}
              {result.metadata.document_type && (
                <div className="flex justify-between">
                  <span>Document Type:</span>
                  <span className="font-medium">{result.metadata.document_type}</span>
                </div>
              )}
              {result.metadata.extraction_date && (
                <div className="flex justify-between">
                  <span>Extracted:</span>
                  <span className="font-medium">
                    {new Date(result.metadata.extraction_date).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function DataSection({ 
  category, 
  fields, 
  isExpanded, 
  onToggle, 
  onEdit, 
  showingFiltered = false, 
  result 
}: DataSectionProps) {
  const getCategoryIcon = (cat: string) => {
    const lower = cat.toLowerCase()
    if (lower.includes('applicant') || lower.includes('contact')) return User
    if (lower.includes('policy') || lower.includes('coverage')) return FileText
    if (lower.includes('date') || lower.includes('period')) return Calendar
    if (lower.includes('financial') || lower.includes('premium')) return DollarSign
    if (lower.includes('location') || lower.includes('address')) return MapPin
    if (lower.includes('property') || lower.includes('building')) return Building2
    return FileText
  }

  const Icon = getCategoryIcon(category)

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">
            {formatCategoryName(category)}
          </h3>
          <span className="text-xs text-gray-500">
            ({fields.length} field{fields.length !== 1 ? 's' : ''})
            {showingFiltered && <span className="ml-1 text-yellow-600">filtered</span>}
          </span>
        </div>
        
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-6 pb-4 space-y-3">
          {fields.map((field) => (
            <DataField
              key={field.key}
              fieldKey={field.key}
              value={field.value}
              confidence={field.confidence}
              onEdit={onEdit}
              result={result}
            />
          ))}
        </div>
      )}
    </div>
  )
}


function DataField({ fieldKey, value, confidence, onEdit, result }: DataFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value))
  const [showGuidance, setShowGuidance] = useState(false) 



  const handleSave = () => {
    if (onEdit) {
      onEdit(fieldKey, editValue)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(String(value))
    setIsEditing(false)
  }

  const handleApplySuggestion = () => {
    if (suggestedFix) {
      setEditValue(suggestedFix)
      setIsEditing(true)
    }
  }

  // More prominent confidence display
  const getConfidenceStyle = (conf: number) => {
    if (conf >= 0.9) return { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: '✓' }
    if (conf >= 0.7) return { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: '✓' }
    if (conf >= 0.5) return { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-300', icon: '⚠' }
    return { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-300', icon: '⚠' }
  }

  const confStyle = confidence !== undefined ? getConfidenceStyle(confidence) : null
  const hint = result.field_hints?.[fieldKey]
  const issues = result.extraction_issues?.[fieldKey] || []
  const suggestedFix = result.suggested_fixes?.[fieldKey]
  const hasGuidance = hint || issues.length > 0 || suggestedFix

  return (
    <div className={`p-3 rounded-lg border ${confStyle?.border || 'border-gray-200'} ${confStyle?.bg || 'bg-white'}`}>
      {/* Field Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-medium text-gray-700">
              {formatFieldName(fieldKey)}
            </label>
            
            {/* Prominent confidence badge */}
            {confidence !== undefined && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${confStyle?.bg} border ${confStyle?.border}`}>
                <span className="text-xs">{confStyle?.icon}</span>
                <span className={`text-xs font-bold ${confStyle?.color}`}>
                  {Math.round(confidence * 100)}%
                </span>
              </div>
            )}

            {/* Guidance indicator */}
            {hasGuidance && (
              <button
                onClick={() => setShowGuidance(!showGuidance)}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title="Show extraction guidance"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Field Value or Editor */}
          {isEditing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-900 break-words">{String(value)}</p>
          )}
        </div>

        {/* Edit button */}
        {onEdit && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
            title="Edit value"
          >
            <Edit className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Inline Guidance Panel */}
      {showGuidance && hasGuidance && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
          {/* Hint */}
          {hint && (
            <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
              <Lightbulb className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-blue-900 mb-0.5">Hint</p>
                <p className="text-xs text-blue-700">{hint}</p>
              </div>
            </div>
          )}

          {/* Issues */}
          {issues.length > 0 && (
            <div className="flex items-start gap-2 p-2 bg-yellow-50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-yellow-900 mb-1">Issues Found</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {issues.map((issue, idx) => (
                    <li key={idx} className="text-xs text-yellow-700">{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Suggested Fix */}
          {suggestedFix && (
            <div className="flex items-start gap-2 p-2 bg-green-50 rounded-lg">
              <Info className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-green-900 mb-1">Suggested Fix</p>
                <p className="text-xs text-green-700 font-mono mb-2">{suggestedFix}</p>
                <button
                  onClick={handleApplySuggestion}
                  className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded transition-colors"
                >
                  Apply Suggestion
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Compact variant for inline display
interface CompactExtractionResultsProps {
  result: ExtractionResult
  className?: string
}

export function CompactExtractionResults({
  result,
  className = '',
}: CompactExtractionResultsProps) {
  const fieldCount = Object.keys(result.data).length
  const confidenceStyle = result.confidence >= 0.8 
    ? 'text-green-600 bg-green-50' 
    : result.confidence >= 0.6 
    ? 'text-yellow-600 bg-yellow-50' 
    : 'text-orange-600 bg-orange-50'

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <CheckCircle2 className="w-4 h-4 text-green-500" />
      <span className="text-sm text-gray-700">
        {fieldCount} field{fieldCount !== 1 ? 's' : ''} extracted
      </span>
      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${confidenceStyle}`}>
        {Math.round(result.confidence * 100)}%
      </span>
    </div>
  )
}

// Helper functions
function groupDataByCategory(
  data: Record<string, unknown>,
  fieldConfidence?: Record<string, number>
): Record<string, Array<{
  key: string
  value: string | number | boolean
  confidence?: number
}>> {
  const grouped: Record<string, Array<{
    key: string
    value: string | number | boolean
    confidence?: number
  }>> = {}

  // Define category patterns
  const categories: Record<string, RegExp[]> = {
    'Applicant Information': [/applicant/i, /name/i, /contact/i, /email/i, /phone/i],
    'Policy Details': [/policy/i, /coverage/i, /limit/i, /deductible/i],
    'Dates & Periods': [/date/i, /period/i, /effective/i, /expiration/i],
    'Financial Information': [/premium/i, /amount/i, /price/i, /cost/i, /fee/i],
    'Location Information': [/address/i, /location/i, /city/i, /state/i, /zip/i],
    'Property Details': [/property/i, /building/i, /structure/i, /construction/i],
  }

  // Flatten nested objects and categorize
  const flattenedFields = flattenObject(data)
  
  for (const [key, value] of flattenedFields) {
    if (typeof value === 'object' && value !== null) {
      continue
    }

    let assigned = false
    for (const [category, patterns] of Object.entries(categories)) {
      if (patterns.some(pattern => pattern.test(key))) {
        if (!grouped[category]) {
          grouped[category] = []
        }
        grouped[category].push({
          key,
          value: value as string | number | boolean,
          confidence: fieldConfidence?.[key]
        })
        assigned = true
        break
      }
    }

    // Default category
    if (!assigned) {
      if (!grouped['Other Information']) {
        grouped['Other Information'] = []
      }
      grouped['Other Information'].push({
        key,
        value: value as string | number | boolean,
        confidence: fieldConfidence?.[key]
      })
    }
  }

  return grouped
}

function formatCategoryName(category: string): string {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatFieldName(key: string): string {
  return key
    .split(/[_.]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function flattenObject(obj: Record<string, unknown>, prefix: string = ''): Array<[string, unknown]> {
  const result: Array<[string, unknown]> = []
  
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flattenObject(value as Record<string, unknown>, path))
    } else {
      result.push([path, value])
    }
  }
    
  return result
}

function formatValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (typeof value === 'number') {
    return value.toLocaleString()
  }
  return String(value)
}
