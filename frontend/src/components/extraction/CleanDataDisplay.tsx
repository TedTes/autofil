/**
 * Clean Data Display
 * Displays extracted data in a user-friendly format (like Screenshot 2)
 */

'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Edit3 } from 'lucide-react'
import { ClickableFieldValue } from './InlineFieldEditor'

interface CleanDataDisplayProps {
  data: Record<string, unknown>
  fieldConfidence?: Record<string, number>
  isEditable?: boolean
  onFieldChange?: (fieldPath: string, value: unknown) => void
}

/**
 * Helper: Extract actual value from object structure
 */
function extractFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  
  // If it's an object with a 'value' property, extract it
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return String((value as { value: unknown }).value)
  }
  
  // If it's an array, join the values (limit preview)
  if (Array.isArray(value)) {
    const extracted = value.map(item => extractFieldValue(item)).filter(Boolean)
    if (extracted.length > 3) {
      return `${extracted.slice(0, 3).join(', ')}... (+${extracted.length - 3} more)`
    }
    return extracted.join(', ')
  }
  
  // If it's a plain object, stringify it
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  
  return String(value)
}

/**
 * Helper: Extract confidence from object structure
 */
function extractConfidence(value: unknown): number | undefined {
  if (typeof value === 'object' && value !== null && 'confidence' in value) {
    return (value as { confidence: number }).confidence
  }
  return undefined
}

/**
 * Helper: Format field name for display
 */
function formatFieldName(fieldName: string): string {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Helper: Flatten nested entities structure
 */
function flattenEntities(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  
  // Check if data has 'entities' key (canonical output format)
  if ('entities' in data && typeof data.entities === 'object' && data.entities !== null) {
    const entities = data.entities as Record<string, any>
    
    // Flatten each entity
    Object.entries(entities).forEach(([entityName, entity]) => {
      if (entity && typeof entity === 'object' && 'instances' in entity) {
        const instances = entity.instances as any[]
        
        if (entity.cardinality === 'zero-to-one' && instances.length > 0) {
          // Single value entity
          result[entityName] = instances[0]
        } else if (entity.cardinality === 'zero-to-many') {
          // Array of values
          result[entityName] = instances
        }
      } else {
        // Direct value
        result[entityName] = entity
      }
    })
    
    return result
  }
  
  // If no entities structure, return as-is
  return data
}

export function CleanDataDisplay({
  data,
  fieldConfidence = {},
  isEditable = false,
  onFieldChange,
}: CleanDataDisplayProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  
  // Flatten the data structure
  const flatData = flattenEntities(data)
  
  // Group fields by section if they have dot notation (e.g., "applicant.name")
  const groupedData = Object.entries(flatData).reduce((acc, [key, value]) => {
    const parts = key.split('.')
    const section = parts.length > 1 ? parts[0] : 'Entities'
    const fieldName = parts.length > 1 ? parts.slice(1).join('.') : key
    
    if (!acc[section]) {
      acc[section] = {}
    }
    acc[section][fieldName] = value
    
    return acc
  }, {} as Record<string, Record<string, unknown>>)
  
  const sections = Object.keys(groupedData)
  
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }
  
  // Auto-expand first section on mount
  useEffect(() => {
    if (sections.length > 0 && expandedSections.size === 0) {
      setExpandedSections(new Set([sections[0]]))
    }
  }, [sections.length])
  
  if (Object.keys(flatData).length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <p className="text-sm text-gray-600">No data extracted</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const sectionData = groupedData[section]
        const isExpanded = expandedSections.has(section)
        const fieldCount = Object.keys(sectionData).length
        
        return (
          <div key={section} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Section Header */}
            <button
              onClick={() => toggleSection(section)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  {formatFieldName(section)}
                </h3>
                <span className="text-xs text-gray-500">
                  {fieldCount} field{fieldCount > 1 ? 's' : ''}
                </span>
              </div>
              
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            
            {/* Section Content */}
            {isExpanded && (
              <div className="border-t border-gray-200 p-4">
                <div className="space-y-3">
                  {Object.entries(sectionData).map(([fieldName, value]) => {
                    const displayValue = extractFieldValue(value)
                    const confidence = extractConfidence(value) || fieldConfidence[fieldName]
                    const fieldPath = section === 'Entities' ? fieldName : `${section}.${fieldName}`
                    
                    return (
                      <FieldRow
                        key={fieldName}
                        fieldPath={fieldPath}
                        fieldName={fieldName}
                        value={displayValue}
                        confidence={confidence}
                        isEditable={isEditable}
                        onFieldChange={onFieldChange}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
      
      {/* Helper Text */}
      {isEditable && (
        <p className="text-xs text-gray-500 text-center mt-4">
          Click field values to edit inline
        </p>
      )}
    </div>
  )
}

/**
 * Field Row Component
 */
function FieldRow({
  fieldPath,
  fieldName,
  value,
  confidence,
  isEditable,
  onFieldChange,
}: {
  fieldPath: string
  fieldName: string
  value: string
  confidence?: number
  isEditable: boolean
  onFieldChange?: (fieldPath: string, value: unknown) => void
}) {
  // Infer field type from field name
  const inferFieldType = (): 'text' | 'number' | 'date' => {
    const lower = fieldName.toLowerCase()
    if (lower.includes('date') || lower.includes('effective')) return 'date'
    if (lower.includes('amount') || lower.includes('limit') || lower.includes('premium') || lower.includes('sales')) return 'number'
    return 'text'
  }
  
  const formattedLabel = formatFieldName(fieldName)
  
  return (
    <div className="flex items-start gap-4">
      {/* Label */}
      <div className="flex-shrink-0 w-40">
        <span className="text-sm font-medium text-gray-600">
          {formattedLabel}
        </span>
      </div>
      
      {/* Value */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isEditable && onFieldChange ? (
          <ClickableFieldValue
            fieldPath={fieldPath}
            label={formattedLabel}
            value={value}
            fieldType={inferFieldType()}
            onEdit={(newValue) => onFieldChange(fieldPath, newValue)}
            className="text-sm text-gray-900"
          />
        ) : (
          <span className="text-sm text-gray-900">{value || 'N/A'}</span>
        )}
        
        {/* Confidence Badge */}
        {confidence !== undefined && confidence < 1 && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            confidence >= 0.8 
              ? 'bg-green-100 text-green-700' 
              : confidence >= 0.6 
              ? 'bg-yellow-100 text-yellow-700' 
              : 'bg-red-100 text-red-700'
          }`}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
    </div>
  )
}