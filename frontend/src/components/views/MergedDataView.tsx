'use client'

import React from 'react'
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

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {orderedSections.map((section) => (
            <SemanticSectionCard key={section.key} section={section} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SemanticSectionCard({ section }: { section: SemanticSection }) {
  const visibleFields = (section.fields || []).filter(
    (field) => field.values && field.values.length > 0
  )
  if (visibleFields.length === 0) {
    return null
  }

  return (
    <section className="bg-white shadow-sm border border-gray-200 rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {section.displayName ?? humanize(section.key)}
          </h2>
          {section.description && (
            <p className="text-sm text-gray-500">{section.description}</p>
          )}
        </div>
        {section.icon && (
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {section.icon}
          </span>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {visibleFields.map((field) => (
          <SemanticFieldRow key={field.id} field={field} />
        ))}
      </div>
    </section>
  )
}

function SemanticFieldRow({ field }: { field: SemanticField }) {
  const primaryValue = field.values?.[0]
  if (!primaryValue) return null

  return (
    <div className="border border-gray-100 rounded-xl px-4 py-3 bg-gray-50/60">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            {field.label ?? humanize(field.id)}
          </p>
          {field.aliases && field.aliases.length > 0 && (
            <p className="text-xs text-gray-500">
              Also known as: {field.aliases.join(', ')}
            </p>
          )}
        </div>
        <div className="text-sm text-gray-900 sm:text-right w-full sm:w-1/2">
          {renderValue(primaryValue.value)}
          {primaryValue.confidence !== undefined && (
            <p className="text-xs text-gray-500 mt-1">
              Confidence: {Math.round(primaryValue.confidence * 100)}%
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400">—</span>
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : <span className="text-gray-400">—</span>
  }
  if (typeof value === 'object') {
    return (
      <div className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-left text-xs text-gray-800 space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([key, val]) => (
          <div key={key} className="flex justify-between gap-3">
            <span className="font-medium text-gray-600">{humanize(key)}</span>
            <span className="text-gray-900">{formatPrimitive(val)}</span>
          </div>
        ))}
      </div>
    )
  }
  return formatPrimitive(value)
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value)
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
    <div className="h-full flex items-center justify-center">
      <div className="text-sm text-gray-500 animate-pulse">Loading merged data…</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-base font-medium text-gray-800">No merged data available</p>
        <p className="text-sm text-gray-500">
          Upload and process documents to view semantic sections.
        </p>
      </div>
    </div>
  )
}
