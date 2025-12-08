/**
 * Clean Data Display
 * Displays extracted data in a user-friendly format (like Screenshot 2)
 */

'use client'

import { useState, useEffect, useMemo, type ReactElement } from 'react'
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
    const inner = (value as { value: unknown }).value
    if (inner === null || inner === undefined) {
      return ''
    }
    if (typeof inner === 'object') {
      try {
        return JSON.stringify(inner, null, 2)
      } catch {
        return '[object]'
      }
    }
    return String(inner)
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
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return '[object]'
    }
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

function formatConfidenceDisplay(confidence?: number): string {
  if (confidence === undefined) return ''
  return `${((confidence || 0) * 100).toFixed(2)}%`
}

/**
 * Helper: Flatten nested entities structure
 */
function flattenEntities(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  
  // Check if data has 'entities' key (canonical output format)
  if ('entities' in data && typeof data.entities === 'object' && data.entities !== null) {
    const entities = data.entities
    
    // Flatten each entity
    Object.entries(entities).forEach(([entityName, entity]) => {
      if (entity && typeof entity === 'object' && 'instances' in entity) {
        const instances = entity.instances as unknown[]
        
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

type SemanticFieldValue = {
  value: unknown
  confidence?: number
  tags?: string[]
}

type SemanticField = {
  id: string
  label: string
  type?: string
  values: SemanticFieldValue[]
}

type SemanticSection = {
  key?: string
  displayName: string
  description?: string
  priority?: number
  icon?: string
  fields: SemanticField[]
}

function normalizeValueEntry(valueEntry: unknown): SemanticFieldValue {
  if (valueEntry && typeof valueEntry === 'object') {
    const entryObj = valueEntry as Record<string, unknown>
    return {
      value: 'value' in entryObj ? entryObj.value : valueEntry,
      confidence:
        typeof entryObj.confidence === 'number' ? entryObj.confidence : undefined,
      tags: Array.isArray(entryObj.tags) ? (entryObj.tags as string[]) : undefined,
    }
  }

  return { value: valueEntry }
}

function normalizeSemanticSections(raw: unknown): SemanticSection[] {
  const sectionsArray: unknown =
    (raw && typeof raw === 'object' && 'semantic_sections' in raw)
      ? (raw as Record<string, unknown>).semantic_sections
      : raw && typeof raw === 'object' && 'semanticSections' in raw
      ? (raw as Record<string, unknown>).semanticSections
      : Array.isArray(raw)
      ? raw
      : null

  if (!Array.isArray(sectionsArray)) {
    return []
  }

  return sectionsArray
    .map((sectionRaw) => {
      if (!sectionRaw || typeof sectionRaw !== 'object') return null
      const section = sectionRaw as Record<string, unknown> & { fields?: unknown }
      const rawFields = Array.isArray(section.fields) ? (section.fields as unknown[]) : null
      const fields = rawFields
        ? rawFields
            .map((fieldRaw) => {
              if (!fieldRaw || typeof fieldRaw !== 'object') return null
              const field = fieldRaw as Record<string, unknown> & {
                id?: string
                label?: string
                type?: string
                values?: unknown
                value?: unknown
                confidence?: number
              }
              const label = field.label || formatFieldName(field.id || '')
              const id = field.id || label || 'field'
              const rawValues = Array.isArray(field.values)
                ? (field.values as unknown[])
                : null
              const values = rawValues
                ? rawValues.map((valueEntry) => normalizeValueEntry(valueEntry))
                : field.value !== undefined
                ? [{ value: field.value, confidence: field.confidence }]
                : []
              return {
                id,
                label,
                type: field.type,
                values,
              } as SemanticField
            })
            .filter(Boolean)
        : []

      const keyString = typeof section.key === 'string' ? section.key : undefined
      return {
        key: keyString,
        displayName: section.displayName || formatFieldName(keyString || 'Section'),
        description: section.description,
        priority: section.priority,
        icon: section.icon,
        fields,
      } as SemanticSection
    })
    .filter(
      (section): section is SemanticSection =>
        Boolean(section && section.fields && section.fields.length)
    )
}

function formatValueForDisplay(value: unknown): ReactElement {
  return <StructuredValue value={value} />
}

export function CleanDataDisplay({
  data,
  fieldConfidence = {},
  isEditable = false,
  onFieldChange,
}: CleanDataDisplayProps) {
  
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [expandedSemanticSections, setExpandedSemanticSections] = useState<Set<string>>(
    new Set()
  )

  const semanticSections = useMemo(() => normalizeSemanticSections(data), [data])
  const rawData = (data as Record<string, unknown>)?.raw
  
  // Flatten the data structure
  const flatData = flattenEntities(data as Record<string, unknown>)
  const hiddenKeys = new Set([
    'raw',
    'job_id',
    'jobId',
    'source',
    'metadata',
    'semantic_sections',
    'semanticSections',
    'inputs',
    'outputs',
    'name',
    'status',
    'filename',
  ])
  Object.keys(flatData).forEach((key) => {
    if (hiddenKeys.has(key)) {
      delete flatData[key]
    }
  })
  
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
  
  // Auto-expand first section on mount (semantic)
  useEffect(() => {
    if (semanticSections.length > 0 && expandedSemanticSections.size === 0) {
      setExpandedSemanticSections(new Set([semanticSections[0].displayName || semanticSections[0].key || 'section']))
    }
  }, [semanticSections, expandedSemanticSections.size])
  
  // Auto-expand first section on mount for flat data
  useEffect(() => {
    if (semanticSections.length === 0 && sections.length > 0 && expandedSections.size === 0) {
      setExpandedSections(new Set([sections[0]]))
    }
  }, [sections.length, semanticSections.length, expandedSections.size])
  
  if (Object.keys(flatData).length === 0 && semanticSections.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <p className="text-sm text-gray-600">No data extracted</p>
      </div>
    )
  }
  
  if (semanticSections.length > 0) {
    return (
      <div className="space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
        {semanticSections.map((section) => {
          const sectionKey = section.displayName || section.key || 'section'
          const isExpanded = expandedSemanticSections.has(sectionKey)

          return (
            <div
              key={sectionKey}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => {
                  setExpandedSemanticSections((prev) => {
                    const next = new Set(prev)
                    if (next.has(sectionKey)) {
                      next.delete(sectionKey)
                    } else {
                      next.add(sectionKey)
                    }
                    return next
                  })
                }}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-col text-left">
                  <span className="text-sm font-semibold text-gray-900">{sectionKey}</span>
                  {section.description && (
                    <span className="text-xs text-gray-500">{section.description}</span>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 divide-y divide-gray-100">
                  {section.fields.map((field) => {
                    const confidenceOverride = fieldConfidence[field.id]
                    const fieldValues = field.values && field.values.length > 0 ? field.values : null
                    const tableData = fieldValues ? buildTabularFromFieldValues(fieldValues) : null
                    return (
                      <div key={field.id} className="px-4 py-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {field.label}
                        </div>
                        {fieldValues ? (
                          <div className="mt-2 flex flex-col gap-2">
                            {tableData ? (
                              <div className="flex flex-col gap-2">
                                {renderObjectTable(tableData, 0)}
                                {fieldValues.some(
                                  (entry) =>
                                    (entry.confidence ?? confidenceOverride) !== undefined &&
                                    (entry.confidence ?? confidenceOverride)! < 0.8
                                ) && (
                                  <div className="flex flex-wrap gap-2">
                                    {fieldValues.map((entry, index) => {
                                      const valueConfidence =
                                        entry.confidence ?? confidenceOverride
                                      if (
                                        valueConfidence === undefined ||
                                        valueConfidence >= 0.8
                                      ) {
                                        return null
                                      }
                                      return (
                                        <span
                                          key={`${field.id}-conf-${index}`}
                                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                            valueConfidence >= 0.6
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : 'bg-red-100 text-red-700'
                                          }`}
                                        >
                                          Row {index + 1}:{' '}
                                          {formatConfidenceDisplay(valueConfidence)}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              fieldValues.map((entry, index) => (
                                <div
                                  key={`${field.id}-${index}`}
                                  className="flex flex-col gap-1 bg-gray-50 rounded-lg p-3 border border-gray-100"
                                >
                                  {formatValueForDisplay(entry.value)}
                                  {(entry.confidence ?? confidenceOverride) !== undefined &&
                                    (entry.confidence ?? confidenceOverride)! < 0.8 && (
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded-full self-start font-medium ${
                                          (entry.confidence ?? confidenceOverride)! >= 0.6
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700'
                                        }`}
                                      >
                                        {formatConfidenceDisplay(entry.confidence ?? confidenceOverride)}
                                      </span>
                                    )}
                                </div>
                              ))
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-gray-400">No data available</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
      {rawData ? <RawDataPreview data={rawData} /> : null}
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
                        rawValue={value}
                        displayValue={displayValue}
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
  rawValue,
  displayValue,
  confidence,
  isEditable,
  onFieldChange,
}: {
  fieldPath: string
  fieldName: string
  rawValue: unknown
  displayValue: string
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
            value={displayValue}
            fieldType={inferFieldType()}
            onEdit={(newValue) => onFieldChange(fieldPath, newValue)}
            className="text-sm text-gray-900"
          />
        ) : (
          <StructuredValue value={rawValue} />
        )}
        
        {/* Confidence Badge */}
        {confidence !== undefined && confidence < 0.8 && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {formatConfidenceDisplay(confidence)}
          </span>
        )}
      </div>
    </div>
  )
}

function StructuredValue({ value }: { value: unknown }) {
  return (
    <div className="text-sm text-gray-900">
      {renderStructuredContent(value, 0)}
    </div>
  )
}

function renderStructuredContent(rawValue: unknown, depth: number): ReactElement {
  const value = parseStructuredString(rawValue)

  if (value === null || value === undefined || value === '') {
    return <span className="text-sm text-gray-400">N/A</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-sm text-gray-400">No entries</span>
    }
    const hasOnlyPrimitives = value.every(
      (item) => item === null || item === undefined || typeof item !== 'object'
    )
    if (hasOnlyPrimitives) {
      return (
        <ul className="list-disc pl-5 space-y-0.5">
          {value.map((item, index) => (
            <li key={`primitive-${depth}-${index}`} className="text-sm text-gray-900">
              {formatPrimitive(item)}
            </li>
          ))}
        </ul>
      )
    }
    const tabular = detectTabularData(value)
    if (tabular) {
      return renderObjectTable(tabular, depth)
    }
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div
            key={`object-${depth}-${index}`}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Item {index + 1}
            </div>
            {renderStructuredContent(item, depth + 1)}
          </div>
        ))}
      </div>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, val]) => val !== undefined && val !== null && val !== ''
    )
    if (entries.length === 0) {
      return <span className="text-sm text-gray-400">N/A</span>
    }
    return (
      <dl className="space-y-1">
        {entries.map(([key, val]) => (
          <div
            key={`${key}-${depth}`}
            className="flex flex-col sm:flex-row sm:items-start gap-1 border-b border-gray-100 py-1 last:border-b-0"
          >
            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide sm:w-40">
              {formatFieldName(key)}
            </dt>
            <dd className="flex-1 text-sm text-gray-900">
              {typeof val === 'object'
                ? renderStructuredContent(val, depth + 1)
                : formatPrimitive(val)}
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  return <span className="text-sm text-gray-900">{formatPrimitive(value)}</span>
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'N/A'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  return String(value)
}

function RawDataPreview({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold text-gray-900">Raw Extracted Data</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-3">
          <pre className="text-xs text-gray-800 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

type TabularData = {
  columns: string[]
  rows: Array<Record<string, unknown>>
}

function detectTabularData(entries: unknown[]): TabularData | null {
  const normalized = entries.map((entry) => parseStructuredString(entry))
  const objects = normalized.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
  )
  if (objects.length === 0) {
    return null
  }
  if (objects.some((obj) => Array.isArray(obj))) {
    return null
  }
  const columns = Array.from(
    new Set(
      objects.flatMap((obj) =>
        Object.keys(obj).filter((key) => !key.startsWith('_') && obj[key] !== null && obj[key] !== undefined && obj[key] !== '')
      )
    )
  )
  if (columns.length === 0 || columns.length > 12) {
    return null
  }
  return {
    columns,
    rows: objects.map((obj) => obj),
  }
}

function renderObjectTable(tabular: TabularData, depth: number): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs text-left text-gray-700 border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-100 text-gray-600 uppercase tracking-wide">
          <tr>
            {tabular.columns.map((col) => (
              <th key={`${col}-${depth}`} className="px-3 py-2 whitespace-nowrap">
                {formatFieldName(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabular.rows.map((row, rowIndex) => (
            <tr
              key={`row-${depth}-${rowIndex}`}
              className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
            >
              {tabular.columns.map((col) => (
                <td key={`${col}-${rowIndex}`} className="px-3 py-2 align-top whitespace-nowrap">
                  {typeof row[col] === 'object'
                    ? renderStructuredContent(row[col], depth + 1)
                    : formatPrimitive(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseStructuredString(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed)
      } catch {
        return value
      }
    }
  }
  return value
}

function buildTabularFromFieldValues(values: SemanticFieldValue[]): TabularData | null {
  console.log("values")
  console.log(values)
  if (values.length === 0) return null
  const parsed = values.map((entry) => parseStructuredString(entry.value))
  if (
    parsed.some(
      (item) => item === null || typeof item !== 'object' || Array.isArray(item)
    )
  ) {
    return null
  }
  return detectTabularData(parsed)
}
