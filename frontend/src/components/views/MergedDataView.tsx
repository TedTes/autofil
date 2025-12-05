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
    <div className="space-y-1">
      {/* Field Label */}
      <label className="block text-xs font-medium text-gray-700">
        {field.label ?? humanize(field.id)}
      </label>
      
      {/* Field Value in Text Field */}
      <div className="relative">
        <input
          type="text"
          readOnly
          value={formatValueAsString(primaryValue.value, field.type)}
          className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        {/* Multiple Values Indicator */}
        {hasMultipleValues && (
          <button
            onClick={() => setShowAllValues(!showAllValues)}
            className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-1.5 sm:px-2 py-1 rounded"
          >
            <Info className="w-3 h-3" />
            {field.values.length} values
          </button>
        )}
      </div>

      {/* Additional Values */}
      {showAllValues && hasMultipleValues && (
        <div className="mt-2 space-y-1">
          {field.values.slice(1).map((value, idx) => (
            <input
              key={idx}
              type="text"
              readOnly
              value={formatValueAsString(value.value, field.type)}
              className="w-full px-3 py-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md"
            />
          ))}
        </div>
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

function formatValueAsString(value: unknown, type?: string): string {
  // Null/undefined/empty
  if (value === null || value === undefined || value === '') {
    return ''
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  // Money formatting
  if (type === 'money' && typeof value === 'number') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Date formatting
  if (type === 'date' && typeof value === 'string') {
    try {
      return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return value
    }
  }

  // Number formatting
  if (typeof value === 'number') {
    return value.toLocaleString('en-US')
  }

  // Array - join with commas
  if (Array.isArray(value)) {
    return value.map(item => formatValueAsString(item, type)).join(', ')
  }

  // Object - JSON string
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2)
  }

  // String (default)
  return String(value)
}

function renderValue(value: unknown, type?: string): React.ReactNode {
  // Null/undefined/empty
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400 italic">Not provided</span>
  }

  // Boolean
  if (typeof value === 'boolean') {
    return (
      <span className={`font-medium ${value ? 'text-green-600' : 'text-red-600'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    )
  }

  // Money formatting
  if (type === 'money' && typeof value === 'number') {
    return (
      <span className="font-semibold text-gray-900">
        {new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value)}
      </span>
    )
  }

  // Date formatting
  if (type === 'date' && typeof value === 'string') {
    try {
      return (
        <span className="text-gray-900">
          {new Date(value).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      )
    } catch {
      return <span className="text-gray-900">{value}</span>
    }
  }

  // Number formatting
  if (typeof value === 'number') {
    return (
      <span className="font-medium text-gray-900">
        {value.toLocaleString('en-US')}
      </span>
    )
  }

  // Array
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-400 italic">Empty list</span>
    }
    return (
      <div className="space-y-1">
        {value.map((item, idx) => (
          <div key={idx} className="text-sm text-gray-900">
            <span className="text-gray-500 mr-2">•</span>
            {renderValue(item, type)}
          </div>
        ))}
      </div>
    )
  }

  // Object (complex)
  if (typeof value === 'object' && value !== null) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2 text-xs">
        {Object.entries(value as Record<string, unknown>).map(([key, val]) => (
          <div key={key} className="flex justify-between gap-4">
            <span className="font-medium text-gray-600 min-w-0 truncate">
              {humanize(key)}:
            </span>
            <span className="text-gray-900 text-right flex-shrink-0">
              {formatPrimitive(val)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // String (default)
  return <span className="text-gray-900">{String(value)}</span>
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
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
