'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import MergedDataView from '../views/MergedDataView'
import type { MergedData } from '@/types/merged-data'
import type { UploadedRow } from '@/hooks/useClientSubmissions'

interface UploadOrMergedDataPanelProps {
  // Condition check
  hasExtractedFiles: boolean
  
  // Merged data (only shown when hasExtractedFiles = true)
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
  onEditMergedField?: (fieldPath: string, value: string | number | boolean) => void
  
  // Reference to the existing FileUploadDropZone component
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
 * Smart wrapper that shows:
 * - Existing FileUploadDropZone when NO extracted files
 * - MergedDataView + "Add More Files" button when files are extracted
 */
export default function UploadOrMergedDataPanel({
  hasExtractedFiles,
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
  onEditMergedField,
  FileUploadDropZoneComponent,
}: UploadOrMergedDataPanelProps) {
  
  // Show existing dropzone if no extracted files yet
  if (!hasExtractedFiles) {
    return (
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
    )
  }

  // Show merged data view with "Add More Files" button
  return (
    <div className="h-full flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden relative">
      {/* Header with "Add More Files" button */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Merged Submission Data</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {activePackageName || 'Active Package'}
          </p>
        </div>
        <button
          onClick={onUploadMore}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add More Files
        </button>
      </div>

      {/* Merged Data View */}
      <div className="flex-1 overflow-hidden">
        <MergedDataView
          mergedData={mergedData}
          onEditField={onEditMergedField}
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
    </div>
  )
}