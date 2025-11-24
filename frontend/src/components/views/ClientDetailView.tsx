'use client'

import React, { useRef, useState, useEffect } from 'react'
import { formatDate } from '@/lib/utils'
import { useClientSubmissions, type UploadedRow } from '@/hooks/useClientSubmissions'
import { fillPdf, downloadPDF } from '@/lib/api-client'
import type { ClientSubmissionPackage } from '@/types'
import {
  ArrowLeft,
  Building2,
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
  Plus,
  Combine,
} from 'lucide-react'

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
  // Auto-remove extracted files after a delay
  useEffect(() => {
    const extractedRows = rows.filter(row => row.extractionStatus === 'extracted')
    if (extractedRows.length > 0) {
      const timer = setTimeout(() => {
        extractedRows.forEach(row => {
          onRemove(row.submissionId)
        })
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [rows, onRemove])

  const activeRows = rows.filter(row => 
    row.extractionStatus !== 'extracted' || row.extractionProgress < 100
  )

  return (
    <div className="h-full min-h-[360px] flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header - FIXED */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Upload Files</h3>
            {activePackageName && (
              <p className="text-xs text-gray-500">to {activePackageName}</p>
            )}
          </div>
          <button
            onClick={onUploadMore}
            disabled={isUploading || !activePackageName}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5" />
            Add Files
          </button>
        </div>
      </div>

      {/* Content Area - FLEXIBLE WITH PROPER CONSTRAINTS */}
      <div className="flex-1 min-h-0 flex flex-col p-4">
        {/* Messages - FIXED */}
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex-shrink-0">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {message && !error && (
          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg flex-shrink-0">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-700">{message}</p>
            </div>
          </div>
        )}

        {isUploading && uploadStatus && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex-shrink-0">
            <div className="flex items-start gap-2">
              <Loader2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
              <p className="text-sm text-blue-700">{uploadStatus}</p>
            </div>
          </div>
        )}

        {/* File List or Empty State - THIS IS THE KEY FIX */}
        {activeRows.length === 0 && !isUploading ? (
          // Empty State - FLEXIBLE
          <div
            role="button"
            tabIndex={activePackageName ? 0 : -1}
            onClick={() => {
              if (activePackageName) onUploadMore()
            }}
            onKeyDown={(event) => {
              if (!activePackageName) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onUploadMore()
              }
            }}
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl transition-all duration-200 ${
              activePackageName
                ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 group'
                : 'cursor-not-allowed opacity-70'
            }`}
          >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-base font-semibold text-gray-900 mb-2">
              {activePackageName ? 'Drop files here' : 'Select a package first'}
            </p>
            <p className="text-sm text-gray-500">
              {activePackageName ? 'or click to browse' : 'Then upload your files'}
            </p>
            {activePackageName && (
              <p className="text-xs text-gray-400 mt-2">
                PDF, Excel, CSV supported
              </p>
            )}
          </div>
        ) : (
  
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-2">
              {activeRows.map(row => (
                <div
                  key={row.submissionId}
                  className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-white hover:shadow-sm transition-shadow"
                >
                  {getFileIcon(row.filename)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{row.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-500">
                        {formatFileType(row.fileType)} • {formatFileSize(row.fileSize)}
                      </p>
                      {row.status === 'uploading' && row.uploadPercent < 100 && (
                        <span className="text-xs text-blue-600">
                          {row.uploadPercent}%
                        </span>
                      )}
                    </div>
                    {(row.status === 'uploading' || row.status === 'extracting') && (
                      <div className="mt-1.5 w-full bg-gray-200 rounded-full h-1">
                        <div
                          className={`h-1 rounded-full transition-all duration-300 ${
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
                    )}
                  </div>
                  <div className="flex items-center gap-1">
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
                    {row.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                    <button
                      onClick={() => onRemove(row.submissionId)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer - FIXED */}
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
  selectedInputsByPackage,
  selectedOutputsByPackage,
  onToggle,
  onViewFile,
  onDownloadFile,
  onToggleInput,
  onSelectAllInputs,
  onToggleOutput,
  onSelectAllOutputs,
  onFillPackage,
  onMergePackage,
  fillingPackageId,
  mergingPackageId,
  fillMessage,
  mergeMessage,
}: {
  submissions: ClientSubmissionPackage[]
  activeId?: string | null
  selectedInputsByPackage: Record<string, string[]>
  selectedOutputsByPackage: Record<string, string[]>
  onToggle?: (pkg: ClientSubmissionPackage) => void
  onViewFile?: (submissionId: string, filename?: string) => void
  onDownloadFile?: (submissionId: string, filename: string) => void
  onToggleInput?: (submissionId: string, inputId: string) => void
  onSelectAllInputs?: (submissionId: string, inputIds: string[]) => void
  onToggleOutput?: (submissionId: string, filename: string) => void
  onSelectAllOutputs?: (submissionId: string, filenames: string[]) => void
  onFillPackage?: (submissionId: string) => void
  onMergePackage?: (submissionId: string) => void
  fillingPackageId?: string | null
  mergingPackageId?: string | null
  fillMessage?: string | null
  mergeMessage?: string | null
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    pkg: ClientSubmissionPackage
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle?.(pkg)
    }
  }

  const renderPackageCard = (pkg: ClientSubmissionPackage) => {
    const isActive = activeId === pkg.submission_id
    const isExpanded = expandedIds.has(pkg.submission_id)
    const badge = statusBadgeFor(pkg.status)
    const StatusIcon = badge.icon
    
    const selectedInputIds = selectedInputsByPackage[pkg.submission_id] || []
    const inputFiles = pkg.inputs || []
    const selectableInputIds = inputFiles.map(f => f.input_id || f.filename)
    const allInputsSelected = selectableInputIds.length > 0 && selectableInputIds.every(
      id => selectedInputIds.includes(id)
    )
    const isFilling = fillingPackageId === pkg.submission_id
    
    const selectedOutputFilenames = selectedOutputsByPackage[pkg.submission_id] || []
    const outputFiles = pkg.outputs || []
    const totalOutputs = outputFiles.length
    const allOutputsSelected = totalOutputs > 0 && outputFiles.every(
      file => selectedOutputFilenames.includes(file.filename)
    )
    const isMerging = mergingPackageId === pkg.submission_id

    return (
      <div key={pkg.submission_id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onToggle?.(pkg)}
          onKeyDown={(event) => handleRowKeyDown(event, pkg)}
          className={`w-full flex items-center gap-2 px-3 py-2.5 transition-all ${
            isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
          }`}
        >
          <button
            onClick={e => {
              e.stopPropagation()
              toggleExpanded(pkg.submission_id)
            }}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
          <Folder className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{pkg.name}</p>
            <p className="text-xs text-gray-500">
              {pkg.inputs?.length || 0} input{(pkg.inputs?.length || 0) === 1 ? '' : 's'} • {pkg.outputs?.length || 0} output{(pkg.outputs?.length || 0) === 1 ? '' : 's'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
            <StatusIcon className="w-3 h-3" />
          </span>
        </div>

        {isExpanded && (
          <div className="bg-gray-50 border-t border-gray-200">
            {pkg.inputs && pkg.inputs.length > 0 && (
              <div className="p-3 space-y-2 border-b border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">
                    {pkg.inputs.length} file{pkg.inputs.length === 1 ? '' : 's'}
                  </p>
                  <button
                    onClick={() => onSelectAllInputs?.(pkg.submission_id, selectableInputIds)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {allInputsSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="space-y-1">
                  {pkg.inputs.map(file => {
                    const fileId = file.input_id || file.filename
                    const isSelected = selectedInputIds.includes(fileId)
                    return (
                      <div
                        key={fileId}
                        className="flex items-center gap-2 px-2 py-1.5 bg-white rounded border border-gray-200 hover:border-gray-300 group transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleInput?.(pkg.submission_id, fileId)}
                          className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        {getFileIcon(file.filename)}
                        <button
                          onClick={() => onViewFile?.(pkg.submission_id, file.filename)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-xs font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                            {file.filename}
                          </p>
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 space-y-1">
                  {fillMessage && fillingPackageId === pkg.submission_id && (
                    <p className="text-xs text-green-600 text-center">{fillMessage}</p>
                  )}
                  <button
                    onClick={() => onFillPackage?.(pkg.submission_id)}
                    disabled={isFilling || inputFiles.length === 0}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-xs font-medium shadow-sm"
                  >
                    {isFilling ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Filling...
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        {selectedInputIds.length > 0 ? `Fill with ${selectedInputIds.length} selected` : 'Fill all'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {pkg.outputs && pkg.outputs.length > 0 && (
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">
                    {pkg.outputs.length} output{pkg.outputs.length === 1 ? '' : 's'}
                  </p>
                  <button
                    onClick={() => onSelectAllOutputs?.(
                      pkg.submission_id,
                      pkg.outputs.map(f => f.filename)
                    )}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {allOutputsSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="space-y-1">
                  {pkg.outputs.map(file => {
                    const isSelected = selectedOutputFilenames.includes(file.filename)
                    return (
                      <div
                        key={file.filename}
                        className="flex items-center gap-2 px-2 py-1.5 bg-white rounded border border-gray-200 hover:border-gray-300 group transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleOutput?.(pkg.submission_id, file.filename)}
                          className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        {getFileIcon(file.filename)}
                        <button
                          onClick={() => onViewFile?.(pkg.submission_id, file.filename)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-xs font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                            {file.filename}
                          </p>
                        </button>
                        <button
                          onClick={() => onDownloadFile?.(pkg.submission_id, file.filename)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 space-y-1">
                  {mergeMessage && mergingPackageId === pkg.submission_id && (
                    <p className="text-xs text-green-600 text-center">{mergeMessage}</p>
                  )}
                  <button
                    onClick={() => onMergePackage?.(pkg.submission_id)}
                    disabled={isMerging || totalOutputs === 0}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-xs font-medium shadow-sm"
                  >
                    {isMerging ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Merging...
                      </>
                    ) : (
                      <>
                        <Combine className="w-3.5 h-3.5" />
                        {selectedOutputFilenames.length > 0 ? `Merge ${selectedOutputFilenames.length} selected` : 'Merge all'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {(!pkg.inputs || pkg.inputs.length === 0) && (!pkg.outputs || pkg.outputs.length === 0) && (
              <div className="p-6 text-center">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No files in this package yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (!submissions.length) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="font-medium">No packages yet</p>
        <p className="text-xs text-gray-500 mt-1">Create a package to organize your submissions</p>
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
  onNavigateBack?: () => void
  onFileClick?: (submissionId: string, filename?: string) => void
}

export function ClientDetailView({
  clientId,
  clientName,
  onNavigateBack,
  onFileClick,
}: ClientDetailViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    client,
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
  } = useClientSubmissions(clientId)

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

  const triggerFileUpload = () => fileInputRef.current?.click()

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = event => {
    const files = Array.from(event.target.files ?? [])
    void uploadFilesToActiveFolder(files)
    event.target.value = ''
  }

  const handleCreatePackageClick = async () => {
    const defaultName = `Package ${packages.length + 1}`
    const name = window.prompt('Enter folder name', defaultName)
    if (!name) return
    await createFolder(name)
  }

  const handleViewFile = (submissionId: string, filename?: string) => {
    if (filename) {
      onFileClick?.(submissionId, filename)
    }
  }

  useEffect(() => {
    setFillState(prev => ({ ...prev, message: null, error: null }))
    setMergeState(prev => ({ ...prev, message: null, error: null }))
  }, [activePackageId])

  const handleFillPackage = async (packageId: string) => {
    const pkg = packages.find(p => p.submission_id === packageId)
    if (!pkg) return
    
    setFillState({ loading: true, message: null, error: null, packageId })
    try {
      const selected = selectedInputsByPackage[packageId] || []
      const report = await fillPdf(packageId, {
        inputIds: selected,
      })
      await refreshClient()
      const filledCount = report.written ?? 0
      const selectionHint = selected.length
        ? ` using ${selected.length} input${selected.length === 1 ? '' : 's'}`
        : ''
      setFillState({
        loading: false,
        message: `Filled ${filledCount} field${filledCount === 1 ? '' : 's'}${selectionHint}.`,
        error: null,
        packageId: null,
      })
    } catch (err) {
      setFillState({
        loading: false,
        message: null,
        error: err instanceof Error ? err.message : 'Fill failed',
        packageId: null,
      })
    }
  }

  const handleMergeOutputsForPackage = async (packageId: string) => {
    const pkg = packages.find(p => p.submission_id === packageId)
    if (!pkg) return
    
    setMergeState({ loading: true, message: null, error: null, packageId })
    
    try {
      const selected = selectedOutputsByPackage[packageId] || []
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const mergedCount = selected.length > 0 ? selected.length : (pkg.outputs?.length || 0)
      const selectionHint = selected.length > 0
        ? ` (${selected.length} selected)`
        : ' (all files)'
      
      setMergeState({
        loading: false,
        message: `Merged ${mergedCount} file${mergedCount === 1 ? '' : 's'}${selectionHint}.`,
        error: null,
        packageId: null,
      })
      
      await refreshClient()
    } catch (err) {
      setMergeState({
        loading: false,
        message: null,
        error: err instanceof Error ? err.message : 'Merge failed',
        packageId: null,
      })
    }
  }

  const handleDownloadOutput = async (submissionId: string, filename: string) => {
    try {
      await downloadPDF(submissionId, filename)
      setFillState(prev => ({ ...prev, error: null }))
      setMergeState(prev => ({ ...prev, error: null }))
    } catch (err) {
      setFillState(prev => ({
        ...prev,
        message: null,
        error: err instanceof Error ? err.message : 'Download failed',
      }))
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading client data...</p>
        </div>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-gray-900 font-medium mb-1">Failed to load client</p>
          <p className="text-sm text-gray-600">{error || 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        multiple
        accept=".pdf,.csv,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              title="Back to Clients"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                {   client.name || clientName}
              </h1>
              <p className="text-sm text-gray-600">
                {stats.totalFiles} file{stats.totalFiles === 1 ? '' : 's'} •{' '}
                {stats.totalPackages} package{stats.totalPackages === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCreatePackageClick}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Package</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-600 mb-0.5">Total Files</p>
            <p className="text-lg font-semibold text-gray-900">{stats.totalFiles}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-600 mb-0.5">Extracted</p>
            <p className="text-lg font-semibold text-gray-900">{stats.extractedFiles}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-600 mb-0.5">Outputs</p>
            <p className="text-lg font-semibold text-gray-900">{stats.outputFiles}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-600 mb-0.5">Packages</p>
            <p className="text-lg font-semibold text-gray-900">{stats.totalPackages}</p>
          </div>
        </div>
      </div>

      {/* Main Content - TWO COLUMN LAYOUT WITH PROPER SCROLLING */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
          {/* LEFT PANEL: Packages - SCROLLABLE */}
       {/* LEFT PANEL: Packages - SCROLLABLE */}
<div className="lg:col-span-1 h-full min-h-0">
  <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-full max-h-[calc(100vh-220px)] overflow-hidden">
    <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
      <h3 className="text-sm font-semibold text-gray-900">Packages</h3>
    </div>
    <div className="flex-1 min-h-0 p-2 overflow-y-auto">
      <CompactFolderList
        submissions={packages}
        activeId={activePackageId}
        selectedInputsByPackage={selectedInputsByPackage}
        selectedOutputsByPackage={selectedOutputsByPackage}
        onToggle={pkg =>
          setActivePackageId(prev =>
            prev === pkg.submission_id ? null : pkg.submission_id
          )
        }
        onViewFile={handleViewFile}
        onDownloadFile={handleDownloadOutput}
        onToggleInput={toggleInputSelection}
        onSelectAllInputs={selectAllInputs}
        onToggleOutput={toggleOutputSelection}
        onSelectAllOutputs={selectAllOutputs}
        onFillPackage={handleFillPackage}
        onMergePackage={handleMergeOutputsForPackage}
        fillingPackageId={fillState.packageId}
        mergingPackageId={mergeState.packageId}
        fillMessage={fillState.message}
        mergeMessage={mergeState.message}
      />
    </div>
  </div>
</div>


          {/* RIGHT PANEL*/}
          <div className="lg:col-span-2 h-full min-h-0">
  <div className="h-full max-h-[calc(100vh-220px)]">
    <FileUploadDropZone
      rows={uploadedRows}
      isUploading={isUploading}
      uploadStatus={statusText}
      message={message}
      error={workflowError}
      onUploadMore={triggerFileUpload}
      onRemove={removeRow}
      onView={handleViewFile}
      activePackageName={activePackage?.name}
    />
  </div>
</div>

        </div>
      </div>
    </div>
  )
}

export default ClientDetailView