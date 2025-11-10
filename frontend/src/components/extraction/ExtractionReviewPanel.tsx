/**
 * Extraction Review Panel
 * Shows extracted files with their data, allows editing, saving, or discarding
 */

'use client'

import { useState } from 'react'
import { Save, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { ExtractedFileCard } from './ExtractedFileCard'
import type { WorkflowFile } from '@/types/workflow'

interface ExtractionReviewPanelProps {
  files: WorkflowFile[]
  onSaveFile: (fileId: string) => Promise<void>
  onSaveAll: (fileIds: string[]) => Promise<void>
  onDiscardFile: (fileId: string) => void
  onEditField: (fileId: string, fieldPath: string, value: unknown) => void
  isSaving?: boolean
}

export function ExtractionReviewPanel({
  files,
  onSaveFile,
  onSaveAll,
  onDiscardFile,
  onEditField,
  isSaving = false,
}: ExtractionReviewPanelProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  // Filter to only show extracted files
  const extractedFiles = files.filter(f => 
    f.status === 'extracted' || f.status === 'reviewing'
  )

  const toggleExpanded = (fileId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) {
        next.delete(fileId)
      } else {
        next.add(fileId)
      }
      return next
    })
  }

  const handleSaveAll = async () => {
    const fileIds = extractedFiles.map(f => f.id)
    await onSaveAll(fileIds)
  }

  if (extractedFiles.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Files to Review
        </h3>
        <p className="text-gray-600 text-sm">
          Extract some files first to review their data here
        </p>
      </div>
    )
  }

  // Count low confidence fields across all files
  const lowConfidenceCount = extractedFiles.reduce((count, file) => {
    if (!file.extractedData) return count
    const warnings = file.warnings || []
    return count + warnings.filter(w => w.toLowerCase().includes('confidence')).length
  }, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Review Extracted Data
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {extractedFiles.length} file{extractedFiles.length > 1 ? 's' : ''} extracted
              {lowConfidenceCount > 0 && (
                <span className="ml-2 text-yellow-600">
                  • {lowConfidenceCount} low confidence field{lowConfidenceCount > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          {/* Bulk Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAll}
              disabled={isSaving || extractedFiles.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save All to Documents
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* File Cards */}
      <div className="space-y-3">
        {extractedFiles.map(file => (
          <ExtractedFileCard
            key={file.id}
            file={file}
            isExpanded={expandedFiles.has(file.id)}
            onToggleExpand={() => toggleExpanded(file.id)}
            onSave={() => onSaveFile(file.id)}
            onDiscard={() => onDiscardFile(file.id)}
            onEditField={(fieldPath, value) => onEditField(file.id, fieldPath, value)}
            isSaving={isSaving}
          />
        ))}
      </div>

      {/* Bottom Actions */}
      {extractedFiles.length > 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {extractedFiles.length} file{extractedFiles.length > 1 ? 's' : ''} ready to save
            </p>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save All
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}