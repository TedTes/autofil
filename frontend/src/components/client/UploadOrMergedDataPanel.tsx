'use client'

import React from 'react'
import MergedDataView from '@/components/views/MergedDataView'
import type { MergedData,UploadedRow } from '@/types'

function hasRenderableMergedData(mergedData: MergedData | null | undefined): boolean {
  return Boolean(
    mergedData &&
      Array.isArray(mergedData.semantic_sections) &&
      mergedData.semantic_sections.some(
        (section) => Array.isArray(section.fields) && section.fields.some((field) => field.values?.length)
      )
  )
}

interface UploadOrMergedDataPanelProps {
  // Condition check
  hasExtractedFiles: boolean
  includedInputCount?: number
  
  // Merged data (shown when hasExtractedFiles = true)
  mergedData: MergedData | null
  isMergedDataLoading?: boolean
  
  // Upload zone props (shown when hasExtractedFiles = false)
  uploadedRows: UploadedRow[]
  isUploading: boolean
  uploadStatus: string | null
  message: string | null
  error: string | null
  activePackageName?: string
  
  // Callbacks
  onUploadMore: () => void
  onRemoveRow: (id: string) => void
  onViewFile: (submissionId: string, filename?: string, inputId?: string) => void
  onSaveMergedData?: (data: MergedData) => Promise<void> | void

  // Reference to the FileUploadDropZone component
  FileUploadDropZoneComponent: React.ComponentType<{
    rows: UploadedRow[]
    isUploading: boolean
    uploadStatus: string | null
    message: string | null
    error: string | null
    onUploadMore: () => void
    onRemove: (id: string) => void
    onView: (submissionId: string, filename?: string, inputId?: string) => void
    activePackageName?: string
  }>
}

/**
 * UploadOrMergedDataPanel
 * 
 * Conditional wrapper that shows:
 * - FileUploadDropZone when no extracted files exist
 * - MergedDataView + "Add More Files" button when files are extracted
 */
export default function UploadOrMergedDataPanel({
  hasExtractedFiles,
  includedInputCount = 0,
  mergedData,
  isMergedDataLoading,
  uploadedRows,
  isUploading,
  uploadStatus,
  message,
  error,
  activePackageName,
  onUploadMore,
  onRemoveRow,
  onViewFile,
  onSaveMergedData,
  FileUploadDropZoneComponent,

}: UploadOrMergedDataPanelProps) {
  const shouldShowMergedData = hasExtractedFiles && (isMergedDataLoading || hasRenderableMergedData(mergedData))
  const hasIncludedInputs = includedInputCount > 0

  if (!shouldShowMergedData) {
    return (
      <div className="h-full flex flex-col min-h-0 gap-3">
        {hasExtractedFiles && !isMergedDataLoading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            {hasIncludedInputs ? (
              <>
                <p className="text-sm font-medium text-amber-900">Merged review data is not available yet.</p>
                <p className="text-xs text-amber-700 mt-1">
                  Your extracted files are still being assembled into submission review data.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-900">No files are currently included in review.</p>
                <p className="text-xs text-amber-700 mt-1">
                  Include one or more files on the left to rebuild merged review data for this submission.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0">
          <FileUploadDropZoneComponent
            rows={uploadedRows}
            isUploading={isUploading}
            uploadStatus={uploadStatus}
            message={message}
            error={error}
            onUploadMore={onUploadMore}
            onRemove={onRemoveRow}
            onView={onViewFile}
            activePackageName={activePackageName}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden relative">
      {/* Header with "Add More Files" button */}
      {/* Merged Data View */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <MergedDataView
          mergedData={mergedData}
          onSaveData={onSaveMergedData}
          isLoading={isMergedDataLoading}
        />
      </div>

      {/* Upload overlay when adding more files */}
      {isUploading && (
        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900">
              {uploadStatus || 'Processing files...'}
            </p>
            {message && <p className="text-xs text-gray-500 mt-1">{message}</p>}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && !isUploading && (
        <div className="absolute top-16 left-4 right-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 shadow-lg z-20">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  )
}
