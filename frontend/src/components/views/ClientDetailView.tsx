'use client'

import React, { useRef, useState, useEffect,useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useClientSubmissions,useTemplateLibrary } from '@/hooks'
import { fillPdf, downloadPDF, markSubmissionReviewed, updateSubmissionData} from '@/lib/api-client'
import UploadOrMergedDataPanel from "@/components/client/UploadOrMergedDataPanel"
import SendToAmsModal from '@/components/client/SendToAmsModal'
import type { ClientSubmissionPackage,UploadedRow, MergedData, ClientDetailActions  } from '@/types'
import { CreateSubmissionModal,DeleteConfirmationModal } from '@/components'
import { useLandingUpload } from '@/contexts/LandingUploadContext'
import {
  Calendar,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileStack,
  X,
  Eye,
  Download,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Table,
  FolderOpen,
  Folder,
  Combine,
  Plus,
  Trash2
} from 'lucide-react'

const GenerateOutputsModal = dynamic(
  () => import('@/components/client/GenerateOutputsModal'),
  { ssr: false }
)

function getFileIcon(filename: string) {
  if (!filename) return null
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return <FileText className="w-4 h-4 text-red-500" />
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />
    case 'csv':
      return <Table className="w-4 h-4 text-blue-600" />
    default:
      return <FileText className="w-4 h-4 text-gray-400" />
  }
}

function formatFileSize(size: number): string {
  if (!size) return '0 KB'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatFileType(type: UploadedRow['fileType']): string {
  switch (type) {
    case 'pdf':
      return 'PDF'
    case 'excel':
      return 'Excel'
    case 'csv':
      return 'CSV'
    default:
      return 'Document'
  }
}

const statusBadgeFor = (status: string): StatusBadgeConfig => {
  switch (status) {
    case 'created':
    case 'uploading':
    case 'uploaded':
      return { label: 'Uploading', color: 'text-blue-600 bg-blue-50', icon: Upload }
    case 'extracting':
      return { label: 'Extracting', color: 'text-purple-600 bg-purple-50', icon: Loader2 }
    case 'ready':
    case 'extracted':
      return { label: 'Ready', color: 'text-green-600 bg-green-50', icon: CheckCircle2 }
    case 'filled':
      return { label: 'Completed', color: 'text-green-600 bg-green-50', icon: CheckCircle2 }
    case 'error':
      return { label: 'Error', color: 'text-red-600 bg-red-50', icon: AlertCircle }
    default:
      return { label: status, color: 'text-gray-600 bg-gray-50', icon: Clock }
  }
}

type StatusBadgeConfig = {
  label: string
  color: string
  icon: typeof Upload
}

function hasRenderableMergedData(
  mergedData: { semantic_sections?: Array<{ fields?: Array<{ values?: unknown[] }> }> } | null | undefined
): boolean {
  return Boolean(
    mergedData?.semantic_sections?.some(
      (section) => section.fields?.some((field) => Array.isArray(field.values) && field.values.length > 0)
    )
  )
}

// ============================================================================
// FILE UPLOAD DROP ZONE
// ============================================================================
function FileUploadDropZone({
  rows,
  isUploading,
  uploadStatus,
  message,
  error,
  onUploadMore,
  onRemove,
  onView,
  activePackageName,
}: {
  rows: UploadedRow[]
  isUploading: boolean
  uploadStatus: string | null
  message: string | null
  error: string | null
  onUploadMore: () => void
  onRemove: (submissionId: string) => void
  onView: (submissionId: string, filename?: string) => void
  activePackageName?: string
}) {
  const [isDragging, setIsDragging] = React.useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const uniqueRows = React.useMemo(() => {
    const seen = new Set<string>()
    return rows.filter(row => {
      if (seen.has(row.submissionId)) {
        return false
      }
      seen.add(row.submissionId)
      return true
    })
  }, [rows])

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Header*/}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2 text-sm">
      <Upload className="w-4 h-4 text-gray-600" />
      <span className="font-medium text-gray-700">
        {activePackageName ? `Upload to ${activePackageName}` : 'Select Package'}
      </span>
    </div>
    <button
  onClick={onUploadMore}
  disabled={isUploading || !activePackageName}
  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-95 active:bg-blue-800"
>
  <Plus className="w-4 h-4" />
  Add Files
</button>
  </div>
</div>

      {/* Main Content Area - SCROLLABLE */}
      <div className="flex-1 overflow-y-auto p-4">
        {!activePackageName ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center p-8">
              <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600 mb-1">No Package Selected</p>
              <p className="text-xs text-gray-500">
                Create or select a package to upload files
              </p>
            </div>
          </div>
        ) : uniqueRows.length === 0 ? (
          <div
            className={`h-full border-2 border-dashed rounded-xl transition-all cursor-pointer flex items-center justify-center ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={onUploadMore}
          >
            <div className="text-center p-8">
              <Upload className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 mb-1">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-gray-500">PDF, Excel, and CSV files are supported</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Status Messages */}
            {message && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-700">{message}</p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {uploadStatus && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
                <p className="text-sm text-blue-700">{uploadStatus}</p>
              </div>
            )}

            {/* File List - VERTICAL LAYOUT*/}
            <div className="space-y-2">
              {uniqueRows.map((row) => (
                <div
                  key={row.submissionId}
                  className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* File Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {getFileIcon(row.filename)}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-sm font-medium text-gray-900 truncate">
                          {row.filename}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                        <span>{formatFileType(row.fileType)}</span>
                        <span>•</span>
                        <span>{formatFileSize(row.fileSize)}</span>
                        {row.status && (
                          <>
                            <span>•</span>
                            <span className={statusBadgeFor(row.status).color}>
                              {statusBadgeFor(row.status).label}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {(row.status === 'uploading' || row.status === 'extracting') && (
                        <div className="mb-2">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                row.status === 'extracting' ? 'bg-purple-600' : 'bg-blue-600'
                              }`}
                              style={{
                                width: `${
                                  row.status === 'extracting'
                                    ? row.extractionProgress
                                    : row.uploadPercent
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Error Message */}
                      {row.status === 'error' && row.extractionError && (
                        <p className="text-xs text-red-600 mt-1">{row.extractionError}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {row.status === 'uploading' && (
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      )}
                      {row.status === 'extracting' && (
                        <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                      )}
                      {row.status === 'extracted' && (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-xs text-green-600 font-medium">Done</span>
                        </div>
                      )}
                      {row.status === 'error' && (
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      )}
                      <button
                        onClick={() => onRemove(row.submissionId)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {activePackageName && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <p className="text-xs text-gray-500 text-center">
            Files are automatically extracted and moved to the package
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// COMPACT FOLDER LIST 
// ============================================================================
function CompactFolderList({
  submissions,
  activeId,
  selectedOutputsByPackage,
  onToggle,
  onAddFiles,
  onViewFile,
  onDownloadFile,
  onToggleInput,
  onSelectAllInputs,
  fillingPackageId,
  mergingPackageId,
  fillMessage,
  mergeMessage,
  onDeleteInput,
  onDeleteOutput,
  onDeleteSubmission,
}: {
  submissions: ClientSubmissionPackage[]
  activeId?: string | null
  selectedOutputsByPackage: Record<string, string[]>
  onToggle?: (pkg: ClientSubmissionPackage) => void
  onViewFile?: (
    submissionId: string,
    filename?: string,
    inputId?: string,
    source?: {
      page?: number
      bbox?: [number, number, number, number]
      fieldLabel?: string
    }
  ) => void
  onDownloadFile?: (submissionId: string, filename: string) => void
  onToggleInput?: (submissionId: string, inputId: string) => void
  onSelectAllInputs?: (submissionId: string, inputIds: string[]) => void
  fillingPackageId?: string | null
  mergingPackageId?: string | null
  fillMessage?: string | null
  mergeMessage?: string | null
  onDeleteInput?: (submissionId: string, inputId: string, event: React.MouseEvent) => void
  onDeleteOutput?: (submissionId: string, outputId: string, event: React.MouseEvent) => void
  onDeleteSubmission?: (submissionId: string, event: React.MouseEvent) => void
  onAddFiles?: (pkg: ClientSubmissionPackage) => void
}) {
  const [isSmallScreen, setIsSmallScreen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const media = window.matchMedia('(max-width: 1023px)')
    const applyMatch = (source: MediaQueryList | MediaQueryListEvent) => {
      setIsSmallScreen(source.matches)
    }
    applyMatch(media)
    const listener = (event: MediaQueryListEvent) => applyMatch(event)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  const lastActiveRef = useRef<string | null>(null)
  useEffect(() => {
    if (isSmallScreen) {
      setExpandedId(null)
      lastActiveRef.current = null
    }
  }, [isSmallScreen])

  useEffect(() => {
    if (isSmallScreen) {
      return
    }
    if (!activeId) {
      setExpandedId(null)
      lastActiveRef.current = null
      return
    }
    if (lastActiveRef.current !== activeId) {
      setExpandedId(activeId)
      lastActiveRef.current = activeId
    }
  }, [activeId, isSmallScreen])

  const renderPackageCard = (pkg: ClientSubmissionPackage) => {
    const isActive = activeId === pkg.submission_id
    const isExpanded = expandedId === pkg.submission_id

    const totalInputs = pkg.inputs?.length || 0
    const selectedInputFilenames = (pkg.inputs || [])
      .filter((input) => input.included_in_merge !== false)
      .map((input) => input.input_id || input.filename)
      .filter((id): id is string => Boolean(id))
    const selectedOutputFilenames = selectedOutputsByPackage[pkg.submission_id] || []

    const isFilling = fillingPackageId === pkg.submission_id
    const isMerging = mergingPackageId === pkg.submission_id
    const hasMessage = fillMessage || mergeMessage

    return (
      <div
        key={pkg.submission_id}
        className={`border rounded-lg overflow-hidden transition-all duration-200 ${
          isActive
            ? 'bg-blue-50 border-blue-200 shadow-sm'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
      >
{/* Package Header */}
<div className="flex items-center group/card">
  {/* 1. EXPAND/COLLAPSE BUTTON — takes remaining space */}
  <button
    onClick={() => {
      const wasOpen = expandedId === pkg.submission_id
      const next = wasOpen ? null : pkg.submission_id
      setExpandedId(next)
      if (!wasOpen) onToggle?.(pkg)
    }}
    className="flex flex-1 items-center gap-2.5 px-3 py-3 text-left min-w-0 hover:bg-gray-50 transition-colors rounded-l-lg"
  >
    {isExpanded ? (
      <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
    ) : (
      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
    )}
    <Folder className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
    <p className={`text-sm font-medium truncate flex-1 ${isActive ? 'text-blue-900' : 'text-gray-800'}`}>
      {pkg.name}
    </p>
    {totalInputs > 0 && (
      <span className="text-xs text-gray-400 font-normal flex-shrink-0 pr-1">
        {totalInputs} {totalInputs === 1 ? 'file' : 'files'}
      </span>
    )}
  </button>

  {/* Actions — visible on hover */}
  <div className="flex items-center pr-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150">
    {/* 2. ADD FILES BUTTON */}
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onAddFiles?.(pkg)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
      title="Add files to this submission"
    >
      <Plus className="w-4 h-4" />
    </button>

    {/* 3. DELETE SUBMISSION BUTTON */}
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDeleteSubmission?.(pkg.submission_id, e)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
      title="Delete submission"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
</div>
<div
   className={`
    transition-all duration-400 ease-in-out overflow-hidden
    ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}
  `}
  style={{
    transitionProperty: 'max-height, opacity',
    transitionDuration: isExpanded ? '400ms' : '250ms', 
    transitionTimingFunction: isExpanded 
      ? 'cubic-bezier(0.4, 0, 0.2, 1)'
      : 'cubic-bezier(0.4, 0, 1, 1)'  
  }}
>
        {/* Package Content */}
     
           <div className="animate-slideDown">
            {/* Inputs Section */}
            {pkg.inputs && pkg.inputs.length > 0 && (
  <div className="px-3 py-3 border-t border-gray-100">
    {/* Header with title and select-all checkbox */}
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
        Input Files ({pkg.inputs.length})
      </h4>
      <label
        className="flex items-center gap-1.5 cursor-pointer group"
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <input
          type="checkbox"
          checked={selectedInputFilenames.length === totalInputs && totalInputs > 0}
          onChange={() => {
            const inputIds =
              pkg.inputs
                ?.map(input => input.input_id || input.filename)
                .filter((val): val is string => Boolean(val)) || []
            onSelectAllInputs?.(pkg.submission_id, inputIds)
          }}
          ref={(el) => {
            if (el) el.indeterminate = selectedInputFilenames.length > 0 && selectedInputFilenames.length < totalInputs
          }}
          className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
        />
        <span className="text-xs text-gray-500 group-hover:text-gray-700 font-medium">All</span>
      </label>
    </div>

    {/* Vertical list of input files */}
    <div className="space-y-1.5">
      {pkg.inputs.map((input) => {
        const inputKey = input.input_id || input.filename
        const isSelected = inputKey ? selectedInputFilenames.includes(inputKey) : false
        return (
          <div
            key={inputKey || input.filename}
            className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
              isSelected
                ? 'bg-blue-50 border-blue-200'
                : 'bg-gray-50 border-gray-200 hover:bg-gray-100 opacity-80'
            }`}
          >
            <label 
              className="flex items-center cursor-pointer"
              onClick={(e) => e.stopPropagation()}
              title={isSelected ? 'Included in merged review data' : 'Excluded from merged review data'}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={!inputKey}
                onChange={() => {
                  if (!inputKey) return
                  onToggleInput?.(pkg.submission_id, inputKey)
                }}
                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              />
            </label>
            <div className="flex-shrink-0">{getFileIcon(input.filename)}</div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewFile?.(pkg.submission_id, input.filename, input.input_id)
              }}
              className="flex-1 text-left min-w-0 hover:bg-transparent"
            >
              <p className="text-xs font-medium text-gray-900 truncate">
                {input.filename}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {input.confidence !== undefined && (
                  <p className="text-xs text-gray-500">
                    Confidence: {Math.round(input.confidence * 100)}%
                  </p>
                )}
                {!isSelected && (
                  <span className="text-[11px] font-medium text-gray-400">
                    Excluded
                  </span>
                )}
              </div>
            </button>
            {inputKey && (
              <button
                onClick={(e) => onDeleteInput?.(pkg.submission_id, inputKey, e)}
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                title="Delete file"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  </div>
)}

       
{(!pkg.inputs || pkg.inputs.length === 0) &&
  (!pkg.outputs || pkg.outputs.length === 0) && (
    <div className="p-6 text-center">
      <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
      <p className="text-xs text-gray-500">No files in this submission yet</p>
    </div>
  )}
          </div>
 
      </div>
      </div>
    )
  }

  if (!submissions.length) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="font-medium">No submissions yet</p>
        <p className="text-xs text-gray-500 mt-1">Create a submission to organize your files</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 pr-1">
      {submissions.map(renderPackageCard)}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
interface ClientDetailViewProps {
  clientId: string
  clientName?: string
  initialSubmissionId?: string
  landingHandoff?: boolean
  intent?: 'create-submission' | 'upload-files'
  onFileClick?: (
    submissionId: string,
    filename?: string,
    inputId?: string,
    source?: {
      page?: number
      bbox?: [number, number, number, number]
      fieldLabel?: string
    }
  ) => void
  onActionsReady?: (actions: ClientDetailActions | null) => void
}

export function ClientDetailView({
  clientId,
  clientName,
  initialSubmissionId,
  landingHandoff,
  intent,
  onFileClick,
  onActionsReady,
}: ClientDetailViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const landingUploadStartedRef = useRef(false)
  const intentHandledRef = useRef(false)
  const { files: landingFiles, clearFiles: clearLandingFiles } = useLandingUpload()
  const [isLandingSetupRunning, setIsLandingSetupRunning] = useState(false)
  const [autoOpenUploadAfterCreate, setAutoOpenUploadAfterCreate] = useState(false)

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false)
  const [isApprovingReview, setIsApprovingReview] = useState(false)
  const {
    loading,
    error,
    packages,
    activePackageId,
    setActivePackageId,
    activePackage,
    selectedInputsByPackage,
    toggleInputSelection,
    selectAllInputs,
    selectedOutputsByPackage,
    toggleOutputSelection,
    selectAllOutputs,
    uploadedRows,
    isUploading,
    statusText,
    message,
    workflowError,
    removeRow,
    createFolder,
    uploadFilesToActiveFolder,
    refreshClient,
    stats,
    mergedData,
    isMergedDataLoading,
    mergedDataError,
    loadMergedData,

    availableTemplates,
    selectedTemplateIds,
    isGeneratingOutputs,
    generateOutputsError,
    lastGenerationResult,
    toggleTemplateSelection,
    selectAllTemplates,
    deselectAllTemplates,
    generateOutputsFromTemplates,
    setTemplates,
    deleteInputFile,
    deleteOutputFile,
    deleteSubmissionPackage,
    standaloneLoading,
    standaloneError,
  } = useClientSubmissions(clientId, { initialSubmissionId })

const displayedPackages = useMemo(() => {
  if (!initialSubmissionId) {
    return packages
  }
  return packages.filter(pkg => pkg.submission_id === initialSubmissionId)
}, [packages, initialSubmissionId])
const packagesToRender = initialSubmissionId ? displayedPackages : packages
const isFocusedSubmissionMissing = Boolean(initialSubmissionId) && displayedPackages.length === 0
// Delete confirmation modal state
const [deleteModal, setDeleteModal] = useState<{
  isOpen: boolean
  type: 'input' | 'output' | 'submission' | 'file'
  submissionId: string
  itemId: string
  itemName: string
} | null>(null)

const [isDeleting, setIsDeleting] = useState(false)

const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
const [isCreating, setIsCreating] = useState(false)

  const handleDeleteInput = async (submissionId: string, inputId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    
    // Find the input to get its name
    const pkg = packages.find(p => p.submission_id === submissionId)
    const input = pkg?.inputs?.find(i => i.input_id === inputId || i.filename === inputId)
    
    // Open modal
    setDeleteModal({
      isOpen: true,
      type: 'input',
      submissionId,
      itemId: inputId,
      itemName: input?.filename || 'file',
    })
  }

 
  const handleDeleteOutput = async (submissionId: string, outputId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    
    // Find the output to get its name
    const pkg = packages.find(p => p.submission_id === submissionId)
    const output = pkg?.outputs?.find(o => o.output_id === outputId || o.filename === outputId)
    
    // Open modal
    setDeleteModal({
      isOpen: true,
      type: 'output',
      submissionId,
      itemId: outputId,
      itemName: output?.filename || 'output',
    })
  }
  const handleConfirmDelete = async () => {
    if (!deleteModal) return
    
    setIsDeleting(true)
    
    try {
      switch (deleteModal.type) {
        case 'input':
          await deleteInputFile(deleteModal.submissionId, deleteModal.itemId)
          break
        case 'output':
          await deleteOutputFile(deleteModal.submissionId, deleteModal.itemId)
          break
        case 'submission':
          await deleteSubmissionPackage(deleteModal.submissionId)
          break
      }
      
      // Close modal on success
      setDeleteModal(null)
    } catch (err) {
      console.error('Failed to delete:', err)
      // Keep modal open on error so user can see what happened
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCloseDeleteModal = () => {
    if (!isDeleting) {
      setDeleteModal(null)
    }
  }
 
  const handleDeleteSubmission = async (submissionId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    
    const pkg = packages.find(p => p.submission_id === submissionId)
    
    // Open modal
    setDeleteModal({
      isOpen: true,
      type: 'submission',
      submissionId,
      itemId: submissionId,
      itemName: pkg?.name || 'submission',
    })
  }

  const {
    templates: libraryTemplates,
    loading: templatesLoading,
    error: templatesError,
  } = useTemplateLibrary()

  useEffect(() => {
    if (libraryTemplates.length > 0) {
      setTemplates(libraryTemplates)
    }
  }, [libraryTemplates, setTemplates])

  useEffect(() => {
    if (!landingHandoff || landingUploadStartedRef.current || landingFiles.length === 0 || loading) {
      return
    }

    landingUploadStartedRef.current = true
    setIsLandingSetupRunning(true)

    void (async () => {
      try {
        const createdSubmission =
          packages.length > 0
            ? packages[0]
            : await createFolder(`Submission ${packages.length + 1}`)

        const targetSubmissionId = createdSubmission?.submission_id
        const targetSubmissionName = createdSubmission?.name || 'Submission 1'

        if (!targetSubmissionId) {
          throw new Error('Unable to create a submission for the landing upload.')
        }

        setActivePackageId(targetSubmissionId)

        const result = await uploadFilesToActiveFolder(landingFiles, {
          submissionId: targetSubmissionId,
          packageName: targetSubmissionName,
        })

        if (result?.successCount) {
          clearLandingFiles()
        } else {
          landingUploadStartedRef.current = false
        }
      } catch (err) {
        console.error('Landing handoff upload failed:', err)
        landingUploadStartedRef.current = false
      } finally {
        setIsLandingSetupRunning(false)
      }
    })()
  }, [
    clearLandingFiles,
    createFolder,
    landingFiles,
    landingHandoff,
    loading,
    packages,
    setActivePackageId,
    uploadFilesToActiveFolder,
  ])

  const handleSaveMergedData = useCallback(async (nextMergedData: MergedData) => {
    if (!activePackageId) return
    await updateSubmissionData(activePackageId, nextMergedData as unknown as Record<string, unknown>)
    await refreshClient()
    await loadMergedData(activePackageId)
  }, [activePackageId, refreshClient, loadMergedData])
  const hasExtractedFiles = activePackage?.inputs?.some(
    input => input.extraction_status === 'extracted' || input.extraction_status === 'ready'
  ) || false
  const reviewDataReady = hasRenderableMergedData(mergedData)
  const reviewApproved = Boolean(activePackage?.reviewed_at)

  const handleApproveReview = useCallback(async () => {
    if (!activePackageId) return
    setIsApprovingReview(true)
    try {
      await markSubmissionReviewed(activePackageId)
      await refreshClient()
    } finally {
      setIsApprovingReview(false)
    }
  }, [activePackageId, refreshClient])

  const workflowState = useMemo(() => {
    if (!activePackage) return null
    const inputs = activePackage.inputs || []
    const outputs = activePackage.outputs || []
    if (outputs.length > 0) {
      return { label: 'Forms Generated', className: 'bg-green-100 text-green-700 border-green-200' }
    }
    if (inputs.some(i => i.extraction_status === 'error')) {
      return { label: 'Needs Review', className: 'bg-red-100 text-red-700 border-red-200' }
    }
    if (hasExtractedFiles && reviewDataReady) {
      return { label: 'Ready to Generate', className: 'bg-purple-100 text-purple-700 border-purple-200' }
    }
    if (hasExtractedFiles) {
      return { label: 'Review Data Pending', className: 'bg-amber-100 text-amber-700 border-amber-200' }
    }
    if (inputs.some(i => i.extraction_status === 'extracting')) {
      return { label: 'Extracting...', className: 'bg-blue-100 text-blue-700 border-blue-200' }
    }
    if (inputs.length > 0) {
      return { label: 'Review Required', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
    }
    return null
  }, [activePackage, hasExtractedFiles, reviewDataReady])


  const handleGenerateOutputs = useCallback(async () => {
    if (!activePackageId) return
    await generateOutputsFromTemplates(activePackageId)
  }, [activePackageId, generateOutputsFromTemplates])

  const [fillState, setFillState] = useState<{
    loading: boolean
    message: string | null
    error: string | null
    packageId: string | null
  }>({
    loading: false,
    message: null,
    error: null,
    packageId: null,
  })

  const [mergeState, setMergeState] = useState<{
    loading: boolean
    message: string | null
    error: string | null
    packageId: string | null
  }>({
    loading: false,
    message: null,
    error: null,
    packageId: null,
  })
  const [outputState, setOutputState] = useState<{
    loading: boolean
    message: string | null
    error: string | null
    packageId: string | null
  }>({
    loading: false,
    message: null,
    error: null,
    packageId: null,
  })

  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const files = Array.from(event.target.files ?? [])
    void uploadFilesToActiveFolder(files)
    event.target.value = ''
  }

  const handleCreateSubmissionClick = useCallback(() => {
    setIsCreateModalOpen(true)
  }, [])
  
  const handleConfirmCreateSubmission = async (name: string) => {
    setIsCreating(true)
    try {
      const created = await createFolder(name)
      if (autoOpenUploadAfterCreate && created?.submission_id) {
        setAutoOpenUploadAfterCreate(false)
        setActivePackageId(created.submission_id)
        setTimeout(() => {
          fileInputRef.current?.click()
        }, 0)
      }
      setIsCreateModalOpen(false)
    } catch (err) {
      console.error('Failed to create submission:', err)
      // Modal stays open so user can try again or see the error
    } finally {
      setIsCreating(false)
    }
  }
  
  const handleCloseCreateModal = useCallback(() => {
    if (!isCreating) {
      setIsCreateModalOpen(false)
    }
  }, [isCreating])

  useEffect(() => {
    if (!onActionsReady) return
    onActionsReady({
      canGenerate: Boolean(availableTemplates.length > 0 && !isMergedDataLoading && reviewDataReady && reviewApproved),
      canSendIntegration: Boolean(activePackageId && !isMergedDataLoading && reviewDataReady && reviewApproved),
      selectedTemplateCount: selectedTemplateIds.length,
      isUploading,
      openNewSubmission: handleCreateSubmissionClick,
      openGenerate: () => setIsGenerateModalOpen(true),
      openAddFiles: triggerFileUpload,
      openIntegrations: () => setIsIntegrationModalOpen(true),
    })
    return () => onActionsReady(null)
  }, [
    onActionsReady,
    availableTemplates.length,
    activePackageId,
    isMergedDataLoading,
    reviewDataReady,
    reviewApproved,
    selectedTemplateIds.length,
    isUploading,
    handleCreateSubmissionClick,
    triggerFileUpload,
  ])

  useEffect(() => {
    if (landingHandoff || intentHandledRef.current || loading || !intent) {
      return
    }

    if (intent === 'create-submission') {
      intentHandledRef.current = true
      setIsCreateModalOpen(true)
      return
    }

    if (intent === 'upload-files') {
      intentHandledRef.current = true
      if (activePackageId) {
        fileInputRef.current?.click()
        return
      }

      if (packages.length > 0) {
        const firstPackage = packages[0]
        setActivePackageId(firstPackage.submission_id)
        setTimeout(() => {
          fileInputRef.current?.click()
        }, 0)
        return
      }

      setAutoOpenUploadAfterCreate(true)
      setIsCreateModalOpen(true)
    }
  }, [activePackageId, intent, landingHandoff, loading, packages, setActivePackageId])

  const handleViewFile = (
    submissionId: string,
    filename?: string,
    inputId?: string,
    source?: {
      page?: number
      bbox?: [number, number, number, number]
      fieldLabel?: string
    }
  ) => {
    if (filename || inputId) {
      onFileClick?.(submissionId, filename, inputId, source)
    }
  }

  const handleDownloadOutput = async (submissionId: string, filename: string) => {
    try {
      await downloadPDF(submissionId, filename)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }


  useEffect(() => {
    setFillState((prev) => ({ ...prev, message: null, error: null }))
    setMergeState((prev) => ({ ...prev, message: null, error: null }))
    setOutputState((prev) => ({ ...prev, message: null, error: null }))
  }, [activePackageId])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-900 mb-2">Error Loading Client</p>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.xlsx,.xls,.csv"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Main Content - TWO COLUMN LAYOUT WITH PROPER SCROLLING */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full flex flex-col gap-4 p-4">
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT PANEL: Submissions - SCROLLABLE */}
<div className="lg:col-span-1 h-full flex flex-col">
  <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-full max-h-[calc(100vh-90px)] overflow-hidden">
    
    {/* Submissions content with "New Submission" button at top */}
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-3 space-y-2">
        {packagesToRender.length === 0 ? (
          initialSubmissionId ? (
            <div className="text-center py-12">
              {standaloneLoading ? (
                <>
                  <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-3 animate-spin" />
                  <p className="text-sm text-gray-500">Loading submission...</p>
                </>
              ) : standaloneError ? (
                <>
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
                  <p className="text-sm text-red-600">{standaloneError}</p>
                </>
              ) : (
                <>
                  <FolderOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Submission not available</p>
                </>
              )}
            </div>
          ) : (
      <div className="text-center py-12">
      {isLandingSetupRunning ? (
        <>
          <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-gray-700 mb-1">Setting up your first submission</p>
          <p className="text-xs text-gray-500">
            Your landing upload is being added to this workspace
          </p>
        </>
      ) : (
        <>
          <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-1">No submissions yet</p>
          <p className="text-xs text-gray-400">
            Create a submission to organize your files
          </p>
        </>
      )}
    </div>
          )
    ) : (
        //  Submission List
        <CompactFolderList
          submissions={packagesToRender}
          activeId={activePackageId}
          selectedOutputsByPackage={selectedOutputsByPackage}
          onToggle={(pkg) => {
            setActivePackageId(pkg.submission_id)
          }}
          onAddFiles={(pkg) => {
            setActivePackageId(pkg.submission_id)
            triggerFileUpload()
          }}
          onViewFile={handleViewFile}
          onDownloadFile={handleDownloadOutput}
          onToggleInput={toggleInputSelection}
          onSelectAllInputs={selectAllInputs}  
          fillingPackageId={fillState.packageId}
          mergingPackageId={mergeState.packageId}
          fillMessage={fillState.message}
          mergeMessage={mergeState.message}
          onDeleteInput={handleDeleteInput}
          onDeleteOutput={handleDeleteOutput}
          onDeleteSubmission={handleDeleteSubmission}
        />
      )}
      </div>
    </div>
  </div>
</div>

          {/* RIGHT PANEL: File Upload */}
          <div className="lg:col-span-2 h-full flex flex-col min-h-0">
  <div className="h-full flex-1 min-h-0">
    <UploadOrMergedDataPanel
      hasExtractedFiles={hasExtractedFiles}
      includedInputCount={
        activePackage?.inputs?.filter((input) => input.included_in_merge !== false).length || 0
      }
      activeSubmissionId={activePackageId || undefined}
      mergedData={mergedData}
      isMergedDataLoading={isMergedDataLoading}
      uploadedRows={uploadedRows}
      isUploading={isUploading}
      uploadStatus={statusText}
      message={message}
      error={workflowError || mergedDataError}
      activePackageName={activePackage?.name}
      onUploadMore={triggerFileUpload}
      onRemoveRow={removeRow}
      onViewFile={handleViewFile}
      onSaveMergedData={handleSaveMergedData}
      onApproveReview={handleApproveReview}
      isReviewApproved={reviewApproved}
      isApprovingReview={isApprovingReview}
      onOpenIntegrations={() => setIsIntegrationModalOpen(true)}
      canSendToIntegration={Boolean(activePackageId && reviewDataReady && reviewApproved && !isMergedDataLoading)}
      FileUploadDropZoneComponent={FileUploadDropZone}
    />
    {outputState.packageId === activePackageId && (outputState.message || outputState.error) && (
      <div className={`mt-3 rounded-lg border px-4 py-2 text-sm ${
        outputState.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}>
        {outputState.error || outputState.message}
      </div>
    )}
  </div>
</div>
        </div>
        </div>
      </div>
      <GenerateOutputsModal
  isOpen={isGenerateModalOpen}
  onClose={() => {
    setIsGenerateModalOpen(false)
    refreshClient()
  }}
  availableTemplates={availableTemplates}
  selectedTemplateIds={selectedTemplateIds}
  onToggleTemplate={toggleTemplateSelection}
  onSelectAllTemplates={selectAllTemplates}
  onDeselectAllTemplates={deselectAllTemplates}
  mergedData={mergedData}
  submissionId={activePackageId || ''}
  inputIds={selectedInputsByPackage[activePackageId || ''] || []}
/>

<SendToAmsModal
  isOpen={isIntegrationModalOpen}
  onClose={() => setIsIntegrationModalOpen(false)}
  clientId={clientId}
  submissionId={activePackageId || ''}
  submissionName={activePackage?.name}
/>

<DeleteConfirmationModal
        isOpen={deleteModal?.isOpen || false}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        title={
          deleteModal?.type === 'submission'
            ? 'Delete Submission'
            : deleteModal?.type === 'output'
            ? 'Delete Output'
            : 'Delete File'
        }
        message={
          deleteModal?.type === 'submission'
            ? 'Are you sure you want to delete this submission and all its files?'
            : deleteModal?.type === 'output'
            ? 'Are you sure you want to delete this output file?'
            : 'Are you sure you want to delete this file?'
        }
        itemName={deleteModal?.itemName}
        deleteType={deleteModal?.type}
        isDeleting={isDeleting}
      />

<CreateSubmissionModal
  isOpen={isCreateModalOpen}
  onClose={handleCloseCreateModal}
  onConfirm={handleConfirmCreateSubmission}
  suggestedName={`Submission ${packages.length + 1}`}
  isCreating={isCreating}
  existingNames={packages.map(p => p.name)}
/>
    </div>
  )
}

export default ClientDetailView
