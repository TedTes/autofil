'use client'

import { useState } from 'react'
import { AlertCircle, Info, CheckCircle2 } from 'lucide-react'
import { ConfidenceBar } from '@/components/ConfidenceBadge'
import {ExtractedField,ExtractionData} from "../types";
import {flattenObjectToFields} from "../lib";


interface ExtractionDataFormProps {
  data: ExtractionData
  isEditable?: boolean
  onChange?: (updatedFields: ExtractedField[]) => void
}

export function ExtractionDataForm({ 
  data, 
  isEditable = false, 
  onChange 
}: ExtractionDataFormProps) {
  const [fields, setFields] = useState<ExtractedField[]>(() => {
    if (!data.data) return []
    
    return flattenObjectToFields(
      data.data, 
      data.field_confidence, 
      data.field_hints
    )
  })
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['all']))

  // Group fields by section
  const groupedFields = fields.reduce((acc, field) => {
    const section = field.section || 'General Information'
    if (!acc[section]) {
      acc[section] = []
    }
    acc[section].push(field)
    return acc
  }, {} as Record<string, ExtractedField[]>)

  const sections = Object.keys(groupedFields)

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }

  const handleFieldChange = (fieldName: string, newValue: string) => {
    const updatedFields = fields.map((field) =>
      field.field_name === fieldName ? { ...field, field_value: newValue } : field
    )
    setFields(updatedFields)
    onChange?.(updatedFields)
  }

  if (!data.data || Object.keys(data.data).length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h4 className="text-sm font-semibold text-gray-900 mb-2">No data extracted</h4>
        <p className="text-sm text-gray-600">
          No fields were extracted from this document.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overall Confidence Banner */}
      {data.confidence !== undefined && (
        <ConfidenceBar 
        confidence={data.confidence} 
        label="Overall Extraction Confidence"
      />
      )}

      {/* Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Warnings</h4>
              <ul className="space-y-1">
                {data.warnings.map((warning, idx) => (
                  <li key={idx} className="text-sm text-gray-700">
                    • {warning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Sections with Fields */}
      <div className="space-y-4">
        {sections.map((section) => {
          const isExpanded = expandedSections.has(section)
          const sectionFields = groupedFields[section]

          return (
            <div
              key={section}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
              >
                <h3 className="text-sm font-semibold text-gray-900">{section}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {sectionFields.length} field{sectionFields.length !== 1 ? 's' : ''}
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {/* Section Content */}
              {isExpanded && (
                <div className="p-4 space-y-4">
                  {sectionFields.map((field) => (
                    <FieldInput
                      key={field.field_name}
                      field={field}
                      isEditable={isEditable}
                      onChange={(value) => handleFieldChange(field.field_name, value)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Individual Field Input Component
function FieldInput({
  field,
  isEditable,
  onChange,
}: {
  field: ExtractedField
  isEditable: boolean
  onChange: (value: string) => void
}) {
  const hasLowConfidence = field.confidence !== undefined && field.confidence < 70
  const isEmpty = !field.field_value || field.field_value === ''

  return (
    <div className="space-y-2">
      {/* Field Label */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          {formatFieldName(field.field_name)}
          {field.required && <span className="text-red-500">*</span>}
          {hasLowConfidence && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded"
              title="Low confidence - please review"
            >
              <AlertCircle className="w-3 h-3" />
              Low confidence
            </span>
          )}
        </label>
        {field.confidence !== undefined && (
          <span className="text-xs text-gray-500">{field.confidence}%</span>
        )}
      </div>

      {/* Field Input */}
      <div className="relative">
        {renderFieldInput(field, isEditable, onChange)}
        {isEmpty && field.required && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Info className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>

      {/* Confidence Bar (for low confidence fields) */}
      {hasLowConfidence && field.confidence !== undefined && (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 ${getConfidenceColor(field.confidence)}`}
              style={{ width: `${field.confidence}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Render appropriate input based on field type
function renderFieldInput(
  field: ExtractedField,
  isEditable: boolean,
  onChange: (value: string) => void
) {
  const baseClasses = `w-full px-3 py-2 border rounded-lg text-sm transition-colors ${
    isEditable
      ? 'border-gray-300 bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
      : 'border-gray-200 bg-gray-50 cursor-not-allowed'
  }`

  switch (field.field_type) {
    case 'select':
      return (
        <select
          value={field.field_value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={!isEditable}
          className={baseClasses}
        >
          <option value="">-- Select --</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )

    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={field.field_value?true: false}
            onChange={(e) => onChange(field.field_value)}
            disabled={!isEditable}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
          />
          <span className="text-sm text-gray-700">
            {field.field_value ? 'Yes' : 'No'}
          </span>
        </label>
      )

    case 'date':
      return (
        <input
          type="date"
          value={field.field_value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={!isEditable}
          className={baseClasses}
        />
      )

    case 'number':
      return (
        <input
          type="number"
          value={field.field_value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={!isEditable}
          className={baseClasses}
        />
      )

    case 'text':
    default:
      // Multi-line for long text
      if (field.field_value && field.field_value.length > 100) {
        return (
          <textarea
            value={field.field_value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={!isEditable}
            rows={3}
            className={baseClasses}
          />
        )
      }

      return (
        <input
          type="text"
          value={field.field_value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={!isEditable}
          className={baseClasses}
        />
      )
  }
}

// Helper Functions
function formatFieldName(fieldName: string): string {
  return fieldName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return 'bg-green-500'
  if (confidence >= 70) return 'bg-blue-500'
  if (confidence >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}