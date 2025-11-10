/**
 * Extracted File Card
 * Shows single file's extracted data with edit/save/discard actions
 */

'use client'

import { ChevronDown, ChevronUp, Save, X, AlertTriangle, CheckCircle2, File, FileText } from 'lucide-react'
import type { WorkflowFile } from '@/types/workflow'
import { ConfidenceBadgeCompact } from '../ConfidenceBadge'
import { formatFileSize } from '@/lib/utils'
import { ClickableFieldValue } from './InlineFieldEditor'
interface ExtractedFileCardProps {
  file: WorkflowFile
  isExpanded: boolean
  onToggleExpand: () => void
  onSave: () => void
  onDiscard: () => void
  onEditField: (fieldPath: string, value: unknown) => void
  isSaving?: boolean
}

export function ExtractedFileCard({
  file,
  isExpanded,
  onToggleExpand,
  onSave,
  onDiscard,
  onEditField,
  isSaving = false,
}: ExtractedFileCardProps) {
  const hasWarnings = (file.warnings?.length ?? 0) > 0
  const hasData = file.extractedData && Object.keys(file.extractedData).length > 0

  // Get file icon based on type
  const getFileIcon = () => {
    switch (file.fileType) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-600" />
      case 'csv':
        return <File className="w-5 h-5 text-green-600" />
      case 'excel':
        return <File className="w-5 h-5 text-green-600" />
      default:
        return <File className="w-5 h-5 text-gray-600" />
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-all">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* File Info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-1">
              {getFileIcon()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {file.filename}
                </h3>
                {file.confidence !== undefined && (
                  <ConfidenceBadgeCompact confidence={file.confidence} />
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{formatFileSize(file.fileSize)}</span>
                {hasData && (
                  <>
                    <span>•</span>
                    <span>{Object.keys(file.extractedData!).length} fields</span>
                  </>
                )}
                {hasWarnings && (
                  <>
                    <span>•</span>
                    <span className="text-yellow-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {file.warnings!.length} warning{file.warnings!.length > 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onToggleExpand}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Save to Documents"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>

            <button
              onClick={onDiscard}
              disabled={isSaving}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Discard"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Warnings */}
          {hasWarnings && (
            <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-900 mb-1">
                    Warnings
                  </p>
                  <ul className="text-xs text-yellow-800 space-y-1">
                    {file.warnings!.map((warning, idx) => (
                      <li key={idx}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Extracted Data Preview */}
          {hasData ? (
            <div className="p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">Extracted Data</h4>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {Object.entries(file.extractedData!).map(([section, sectionData]) => (
                  <DataSection
                    key={section}
                    section={section}
                    data={sectionData}
                    onEditField={onEditField}
                  />
                ))}
              </div>

              <div className="pt-3 border-t border-gray-200 text-xs text-gray-500">
                <p>Click field values to edit inline</p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-600">No data extracted</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Data Section Component
 * Renders a section of extracted data (e.g., "applicant", "policy")
 */
function DataSection({
  section,
  data,
  onEditField,
}: {
  section: string
  data: unknown
  onEditField: (fieldPath: string, value: unknown) => void
}) {
  // Format section name for display
  const sectionLabel = section
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  // Render based on data type
  if (typeof data !== 'object' || data === null) {
    return (
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{sectionLabel}</span>
          <span className="text-sm text-gray-900">{String(data)}</span>
        </div>
      </div>
    )
  }

  const entries = Object.entries(data as Record<string, unknown>)

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <h5 className="text-sm font-semibold text-gray-900 mb-2">{sectionLabel}</h5>
      
      <div className="space-y-1.5 pl-3">
        {entries.map(([key, value]) => (
          <DataField
            key={key}
            fieldPath={`${section}.${key}`}
            label={key}
            value={value}
            onEdit={(newValue) => onEditField(`${section}.${key}`, newValue)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Data Field Component
 * Renders a single field with inline editing using ClickableFieldValue
 */
function DataField({
  fieldPath,
  label,
  value,
  onEdit,
}: {
  fieldPath: string
  label: string
  value: unknown
  onEdit: (value: unknown) => void
}) {
  // Infer field type from label or value
  const inferFieldType = (): 'text' | 'number' | 'date' | 'boolean' | 'email' | 'tel' => {
    const lowerLabel = label.toLowerCase()
    
    if (lowerLabel.includes('email')) return 'email'
    if (lowerLabel.includes('phone') || lowerLabel.includes('tel')) return 'tel'
    if (lowerLabel.includes('date') || lowerLabel.includes('effective') || lowerLabel.includes('expiration')) return 'date'
    if (lowerLabel.includes('amount') || lowerLabel.includes('limit') || lowerLabel.includes('premium')) return 'number'
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'number') return 'number'
    
    return 'text'
  }

  // Format label for display
  const fieldLabel = label
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return (
    <div className="flex items-start justify-between gap-2 text-xs group">
      <span className="text-gray-600 font-medium min-w-[120px]">{fieldLabel}:</span>
      <div className="text-right flex-1">
        <ClickableFieldValue
          fieldPath={fieldPath}
          label={fieldLabel}
          value={value}
          fieldType={inferFieldType()}
          onEdit={onEdit}
          className="w-full text-right"
        />
      </div>
    </div>
  )
}