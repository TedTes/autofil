'use client'

import React, { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react'
import type { MergedData, SemanticField, SemanticSection } from '@/types'

interface MergedDataViewProps {
  mergedData: MergedData | null
  onEditField?: (fieldPath: string, value: string | number | boolean) => void
  isLoading?: boolean
}

export default function MergedDataView({
  mergedData,
  isLoading = false,
}: MergedDataViewProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  if (isLoading) {
    return <LoadingSkeleton />
  }

  const sections = mergedData?.semantic_sections ?? []
  if (sections.length === 0) {
    return <EmptyState />
  }

  const orderedSections = [...sections].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0)
  )

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
        <div className="max-w-5xl mx-auto space-y-3 sm:space-y-4">
          {orderedSections.map((section) => (
            <SemanticSectionCard
              key={section.key}
              section={section}
              isCollapsed={collapsedSections.has(section.key)}
              onToggle={() => toggleSection(section.key)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface SemanticSectionCardProps {
  section: SemanticSection
  isCollapsed: boolean
  onToggle: () => void
}

function SemanticSectionCard({ section, isCollapsed, onToggle }: SemanticSectionCardProps) {
  const visibleFields = (section.fields || []).filter(
    (field) => field.values && field.values.length > 0
  )
  
  if (visibleFields.length === 0) {
    return null
  }

  return (
    <section className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
      {/* Header - Clickable */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 sm:px-5 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
          )}
          <div className="text-left">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">
              {section.displayName ?? humanize(section.key)}
            </h2>
            {section.description && !isCollapsed && (
              <p className="text-sm text-gray-500 mt-0.5">{section.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {visibleFields.length} {visibleFields.length === 1 ? 'field' : 'fields'}
          </span>
        </div>
      </button>

      {/* Content - Collapsible */}
      {!isCollapsed && (
        <div className="px-4 sm:px-5 pb-4 space-y-3">
          {visibleFields.map((field) => (
            <SemanticFieldRow key={field.id} field={field} />
          ))}
        </div>
      )}
    </section>
  )
}

function SemanticFieldRow({ field }: { field: SemanticField }) {
  const [showAllValues, setShowAllValues] = useState(false)
  
  if (!field.values || field.values.length === 0) {
    return null
  }

  const primaryValue = field.values[0]
  const hasMultipleValues = field.values.length > 1

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-gray-700">
          {field.label ?? humanize(field.id)}
        </label>
        {hasMultipleValues && (
          <button
            onClick={() => setShowAllValues(!showAllValues)}
            className="text-[10px] sm:text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-1.5 sm:px-2 py-1 rounded"
          >
            <Info className="w-3 h-3" />
            {showAllValues ? 'Hide extras' : `${field.values.length} values`}
          </button>
        )}
      </div>

      <ValueCard entry={primaryValue} type={field.type} indexLabel="Primary" />

      {showAllValues && hasMultipleValues && (
        <div className="space-y-2">
          {field.values.slice(1).map((value, idx) => (
            <ValueCard
              key={`${field.id}-${idx}`}
              entry={value}
              type={field.type}
              indexLabel={`Value ${idx + 2}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type SemanticFieldValueEntry = NonNullable<SemanticField['values']>[number]

function ValueCard({
  entry,
  type,
  indexLabel,
}: {
  entry: SemanticFieldValueEntry
  type?: string
  indexLabel?: string
}) {
  const confidence = entry.confidence
  const shouldShowConfidence = confidence !== undefined && confidence < 0.8

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-3 space-y-2">
      {indexLabel && (
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          {indexLabel}
        </p>
      )}
      <StructuredValue value={entry.value} type={type} />
      {shouldShowConfidence && confidence !== undefined && (
        <span
          className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ${getConfidenceBadgeColor(
            confidence
          )}`}
        >
          Confidence {formatConfidenceDisplay(confidence)}
        </span>
      )}
    </div>
  )
}

function getConfidenceBadgeColor(confidence: number): string {
  if (confidence >= 0.9) {
    return 'bg-green-100 text-green-700'
  }
  if (confidence >= 0.7) {
    return 'bg-yellow-100 text-yellow-700'
  }
  return 'bg-red-100 text-red-700'
}

function formatConfidenceDisplay(confidence?: number): string {
  if (confidence === undefined) return ''
  return `${(confidence * 100).toFixed(1)}%`
}

function StructuredValue({ value, type }: { value: unknown; type?: string }) {
  return (
    <div className="text-sm text-gray-900">
      {renderStructuredContent(value, type, 0)}
    </div>
  )
}

function renderStructuredContent(
  rawValue: unknown,
  type?: string,
  depth: number = 0
): React.ReactNode {
  const value = parseStructuredValue(rawValue)

  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400 italic">Not provided</span>
  }

  if (typeof value === 'boolean') {
    return (
      <span className={`font-medium ${value ? 'text-green-600' : 'text-red-600'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    )
  }

  if (type === 'money' && typeof value === 'number') {
    return (
      <span className="font-semibold">
        {new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value)}
      </span>
    )
  }

  if (type === 'date' && typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return (
        <span className="text-gray-900">
          {date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      )
    }
  }

  if (typeof value === 'number') {
    return <span className="font-medium text-gray-900">{value.toLocaleString('en-US')}</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-400 italic">No entries</span>
    }

    const normalized = value.map(parseStructuredValue)
    const primitivesOnly = normalized.every(
      (item) => item === null || typeof item !== 'object'
    )
    if (primitivesOnly) {
      return (
        <ul className="list-disc pl-5 space-y-1">
          {normalized.map((item, idx) => (
            <li key={`${depth}-primitive-${idx}`} className="text-sm text-gray-900">
              {formatPrimitive(item)}
            </li>
          ))}
        </ul>
      )
    }

    const table = detectTabularData(normalized)
    if (table) {
      return renderObjectTable(table, depth)
    }

    return (
      <div className="space-y-2">
        {normalized.map((item, idx) => (
          <div
            key={`${depth}-object-${idx}`}
            className="border border-gray-200 rounded-lg p-3 bg-gray-50"
          >
            {renderStructuredContent(item, undefined, depth + 1)}
          </div>
        ))}
      </div>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, val]) => val !== null && val !== undefined && val !== ''
    )
    if (entries.length === 0) {
      return <span className="text-gray-400 italic">Not provided</span>
    }
    return (
      <dl className="space-y-1">
        {entries.map(([key, val]) => (
          <div key={`${key}-${depth}`} className="flex flex-col gap-1 border-b border-gray-100 pb-2 last:border-b-0">
            <dt className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
              {humanize(key)}
            </dt>
            <dd className="text-sm text-gray-900">
              {typeof val === 'object'
                ? renderStructuredContent(val, undefined, depth + 1)
                : formatPrimitive(val)}
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  return <span className="text-gray-900">{String(value)}</span>
}

type TabularData = {
  columns: string[]
  rows: Array<Record<string, unknown>>
}

function detectTabularData(entries: unknown[]): TabularData | null {
  const objects = entries.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
  )
  if (objects.length < 2) {
    return null
  }
  const columns = Array.from(
    new Set(
      objects.flatMap((obj) =>
        Object.keys(obj).filter(
          (key) => !key.startsWith('_') && obj[key] !== null && obj[key] !== undefined && obj[key] !== ''
        )
      )
    )
  )
  if (columns.length === 0 || columns.length > 15) {
    return null
  }
  return {
    columns,
    rows: objects,
  }
}

function renderObjectTable(tabular: TabularData, depth: number): React.ReactNode {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs text-left text-gray-700 border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-100 text-gray-600 uppercase tracking-wide">
          <tr>
            {tabular.columns.map((col) => (
              <th key={`${col}-${depth}`} className="px-3 py-2 whitespace-nowrap">
                {humanize(col)}
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
                  {renderStructuredContent(row[col], undefined, depth + 1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseStructuredValue(value: unknown): unknown {
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

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  return String(value)
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function LoadingSkeleton() {
  return (
    <div className="h-full flex flex-col bg-gray-50 animate-pulse">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
              <div className="space-y-3">
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-5/6" />
                <div className="h-4 bg-gray-100 rounded w-4/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-3 px-4">
        <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto flex items-center justify-center">
          <Info className="w-8 h-8 text-gray-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">No merged data available</p>
          <p className="text-sm text-gray-500 mt-1">
            Upload and process documents to view extracted fields
          </p>
        </div>
      </div>
    </div>
  )
}
