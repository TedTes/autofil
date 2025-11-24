'use client'

import React, { useRef,useState,useEffect } from 'react'
import { formatDate } from '@/lib/utils'
import { useClientSubmissions } from '@/hooks/useClientSubmissions'
import type { ClientSubmissionPackage } from '@/types'
import { ConfidenceBadgeCompact } from '@/components/ConfidenceBadge'
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
  Check,
  X,
  Eye,
  Download,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Table,
  FolderOpen,
  Folder,
} from 'lucide-react'


type UploadedRow = {
  submissionId: string
  filename: string
  uploadedAt: string
  fileType: 'pdf' | 'excel' | 'csv' | 'other'
  fileSize: number
  uploadPercent: number
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'error'
  extractionProgress: number
  extractionError?: string
  confidence?: number
}
function getFileIcon(filename: string) {
  if(!filename) return;
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
function ClientWorkflowPanel({
  rows,
  isUploading,
  isExtracting,
  uploadStatus,
  message,
  error,
  onUploadMore,
  onExtract,
  onRemove,
  onView,
}: {
  rows: UploadedRow[]
  isUploading: boolean
  isExtracting: boolean
  uploadStatus: string | null
  message: string | null
  error: string | null
  onUploadMore: () => void
  onExtract: (selectedIds: string[]) => Promise<void> | void
  onRemove: (submissionId: string) => void
  onView?: (submissionId: string, filename?: string) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>()
      rows.forEach((row) => {
        if (prev.has(row.submissionId)) {
          next.add(row.submissionId)
        }
      })
      return next
    })
  }, [rows])

  const selectableIds = rows
    .filter((row) => row.extractionStatus !== 'extracting')
    .map((row) => row.submissionId)
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.has(id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableIds))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleExtract = async () => {
    if (selectedIds.size === 0) return
    await onExtract(Array.from(selectedIds))
    setSelectedIds(new Set())
  }

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center">
        <p className="text-gray-600 mb-4">
          No client documents uploaded yet. Start by adding files.
        </p>
        <button
          onClick={onUploadMore}
          className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold"
          disabled={isUploading}
        >
          <Upload className="w-4 h-4" />
          {isUploading ? 'Uploading…' : 'Upload files'}
        </button>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl">
      <div className="px-5 py-3 border-b border-gray-100 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                allSelected
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
              title={allSelected ? 'Clear selection' : 'Select all'}
            >
              {allSelected && <Check className="w-3 h-3 text-white" />}
            </button>
            <span className="text-sm font-semibold text-gray-900">
              {rows.length} file{rows.length !== 1 ? 's' : ''}
            </span>
          </div>
          {uploadStatus && (
            <p className="text-xs text-gray-500 mt-1">{uploadStatus}</p>
          )}
          {message && (
            <p className="text-xs text-green-600 mt-1">{message}</p>
          )}
          {error && (
            <p className="text-xs text-red-600 mt-1">{error}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onUploadMore}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload more
          </button>
          <button
            onClick={handleExtract}
            disabled={selectedIds.size === 0 || isExtracting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:bg-gray-300 transition-colors"
          >
            {isExtracting ? 'Extracting…' : 'Extract'}
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 max-h-[400px] overflow-y-auto">
        {rows.map((row) => (
          <WorkflowRow
            key={row.submissionId}
            row={row}
            isSelected={selectedIds.has(row.submissionId)}
            onToggleSelect={() => toggleSelect(row.submissionId)}
            onRemove={() => onRemove(row.submissionId)}
            onView={onView}
          />
        ))}
      </div>
    </div>
  )
}

function WorkflowRow({
  row,
  isSelected,
  onToggleSelect,
  onRemove,
  onView,
}: {
  row: UploadedRow
  isSelected: boolean
  onToggleSelect: () => void
  onRemove: () => void
  onView?: (submissionId: string, filename?: string) => void
}) {
  const selectable = row.extractionStatus !== 'extracting'

  const renderStatus = () => {
    if (row.uploadPercent < 100) {
      return (
        <p className="text-xs font-medium text-gray-500 mt-1">
          Uploading — {row.uploadPercent}%
        </p>
      )
    }

    switch (row.extractionStatus) {
      case 'pending':
        return (
          <p className="text-xs font-medium text-gray-400 mt-1">
            Ready to extract
          </p>
        )
      case 'extracting':
        return (
          <p className="text-xs font-medium text-blue-600 mt-1">
            Extracting — {row.extractionProgress}%
          </p>
        )
      case 'extracted':
        return (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-medium text-green-600">
              Extracted
            </span>
            {row.confidence !== undefined && (
              <ConfidenceBadgeCompact confidence={row.confidence} />
            )}
            {onView && (
              <button
                onClick={() => onView(row.submissionId, row.filename)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Eye className="w-3.5 h-3.5" />
                View data
              </button>
            )}
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-2 text-xs text-red-600 mt-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{row.extractionError || 'Failed'}</span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl">
      <button
        onClick={onToggleSelect}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-1 transition-colors ${
          isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
        }`}
        disabled={!selectable}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{row.filename}</p>
        <p className="text-xs text-gray-500">
          {formatFileType(row.fileType)} • {formatFileSize(row.fileSize)} • {formatDate(row.uploadedAt)}
        </p>
        {renderStatus()}
      </div>
      {selectable && (
        <button
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
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
function ClientSubmissionPackages({
  submissions,
  activeId,
  onToggle,
  onViewFile,
  onDownloadFile,
}: {
  submissions: ClientSubmissionPackage[]
  activeId?: string | null
  onToggle?: (pkg: ClientSubmissionPackage) => void
  onViewFile?: (submissionId: string, filename: string) => void
  onDownloadFile?: (submissionId: string, filename: string) => void
}) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const toggleFolder = (submissionId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(submissionId)) {
        next.delete(submissionId)
      } else {
        next.add(submissionId)
      }
      return next
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Folders & Files</h2>
          <p className="text-sm text-gray-600">
            Each folder (package) contains input files and generated outputs
          </p>
        </div>
        <span className="text-sm font-medium text-gray-500">
          {submissions.length} {submissions.length === 1 ? 'folder' : 'folders'}
        </span>
      </div>

      {submissions.length === 0 ? (
        <div className="p-10 text-center text-sm text-gray-600">
          <FolderOpen className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="font-medium mb-1">No folders yet</p>
          <p className="text-xs text-gray-500">Create a package to start organizing files</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {submissions.map((submission) => {
            const badge = statusBadgeFor(submission.status)
            const StatusIcon = badge.icon
            const isExpanded = expandedFolders.has(submission.submission_id)
            const isActive = activeId === submission.submission_id
            const totalFiles = (submission.inputs?.length || 0) + (submission.outputs?.length || 0)
            const lastUpdated = submission.updated_at || submission.uploaded_at

            return (
              <div key={submission.submission_id} className={isActive ? 'bg-blue-50/30' : ''}>
                {/* Folder Header */}
                <div className="flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition-colors">
                  <button
                    onClick={() => toggleFolder(submission.submission_id)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    )}
                  </button>

                  <button
                    onClick={() => onToggle?.(submission)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                    {isExpanded ? (
                      <FolderOpen className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    ) : (
                      <Folder className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-base font-semibold text-gray-900 truncate">
                          {submission.name}
                        </p>
                        {isActive && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {totalFiles} {totalFiles === 1 ? 'file' : 'files'} • Updated {formatDate(lastUpdated)}
                      </p>
                    </div>
                  </button>

                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
                    <StatusIcon className={`w-4 h-4 ${submission.status === 'extracting' ? 'animate-spin' : ''}`} />
                    {badge.label}
                  </span>
                </div>

                {/* Folder Contents */}
                {isExpanded && (
                  <div className="px-6 pb-4 bg-gray-50/50">
                    <div className="ml-8 space-y-4">
                      {/* Input Files */}
                      {submission.inputs && submission.inputs.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2 px-2">
                            <Upload className="w-3.5 h-3.5 text-gray-500" />
                            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                              Input Files ({submission.inputs.length})
                            </h4>
                          </div>
                          <div className="space-y-1">
                            {submission.inputs.map((file, idx) => (
                              <div
                                key={`${submission.submission_id}-in-${idx}`}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-white rounded-lg transition-colors group"
                              >
                                <div className="flex-shrink-0">
                                  {getFileIcon(file.filename)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {file.filename}
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {file.file_size && (
                                      <span className="text-xs text-gray-500">
                                        {formatFileSize(file.file_size)}
                                      </span>
                                    )}
                                    {file.uploaded_at && (
                                      <>
                                        <span className="text-xs text-gray-400">•</span>
                                        <span className="text-xs text-gray-500">
                                          {formatDate(file.uploaded_at)}
                                        </span>
                                      </>
                                    )}
                                    {file.extraction_status === 'extracted' && (
                                      <>
                                        <span className="text-xs text-gray-400">•</span>
                                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                          <CheckCircle2 className="w-3 h-3" />
                                          Extracted
                                        </span>
                                      </>
                                    )}
                                    {file.extraction_status === 'extracting' && (
                                      <>
                                        <span className="text-xs text-gray-400">•</span>
                                        <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Extracting
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                  {onViewFile && (
                                    <button
                                      onClick={() => onViewFile(submission.submission_id, file.filename)}
                                      className="p-1.5 hover:bg-gray-200 rounded"
                                      title="View file"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-gray-600" />
                                    </button>
                                  )}
                                  {onDownloadFile && (
                                    <button
                                      onClick={() => onDownloadFile(submission.submission_id, file.filename)}
                                      className="p-1.5 hover:bg-gray-200 rounded"
                                      title="Download file"
                                    >
                                      <Download className="w-3.5 h-3.5 text-gray-600" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Output Files */}
                      {submission.outputs && submission.outputs.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2 px-2">
                            <FileStack className="w-3.5 h-3.5 text-gray-500" />
                            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                              Output Files ({submission.outputs.length})
                            </h4>
                          </div>
                          <div className="space-y-1">
                            {submission.outputs.map((file, idx) => (
                              <div
                                key={`${submission.submission_id}-out-${idx}`}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-white rounded-lg transition-colors group"
                              >
                                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {file.filename}
                                  </p>
                                  {file.file_size && (
                                    <p className="text-xs text-gray-500">
                                      {formatFileSize(file.file_size)}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                  {onViewFile && (
                                    <button
                                      onClick={() => onViewFile(submission.submission_id, file.filename)}
                                      className="p-1.5 hover:bg-gray-200 rounded"
                                      title="View file"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-gray-600" />
                                    </button>
                                  )}
                                  {onDownloadFile && (
                                    <button
                                      onClick={() => onDownloadFile(submission.submission_id, file.filename)}
                                      className="p-1.5 hover:bg-gray-200 rounded"
                                      title="Download file"
                                    >
                                      <Download className="w-3.5 h-3.5 text-gray-600" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Empty State */}
                      {(!submission.inputs || submission.inputs.length === 0) &&
                        (!submission.outputs || submission.outputs.length === 0) && (
                          <div className="text-center py-6 text-sm text-gray-500">
                            <FileText className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                            <p>No files in this folder yet</p>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
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

    uploadedRows,
    isUploading,
    isExtracting,
    statusText,
    message,
    workflowError,
    removeRow,

    createFolder,
    uploadFilesToActiveFolder,
    extractSelected,

    stats,
    successRate,
  } = useClientSubmissions(clientId)

  const triggerFileUpload = () => fileInputRef.current?.click()

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
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

  const handleViewFile = (submissionId: string, filename: string) => {
    onFileClick?.(submissionId, filename)
  }

  if (loading) {
    // keep your existing loading UI
  }

  if (error || !client) {
    // keep your existing error UI
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        multiple
        accept=".pdf,.csv,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onNavigateBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Back to Clients"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {clientName || client && client.name}
              </h1>
              <p className="text-sm text-gray-600">Client ID: {clientId}</p>
            </div>
          </div>
          <button
            onClick={handleCreatePackageClick}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Folder className="w-4 h-4" />
            New Folder
          </button>
        </div>

        {/* Client Info Row */}
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>Created {client && formatDate(client.created_at) || 'Recently'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4" />
            <span>{stats.total} {stats.total === 1 ? 'folder' : 'folders'}</span>
          </div>
        </div>
      </div>

      {/* Content: 2-column layout */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {/* 1) Stats row – keep your cards */}
        {/* ... same as you have, but reading from stats & successRate ... */}

        {/* 2) Main layout: left = folders, right = active folder + workflow */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)] gap-6">
          {/* Left: Folders & files tree */}
          <ClientSubmissionPackages
            submissions={packages}
            activeId={activePackageId}
            onToggle={(pkg: ClientSubmissionPackage) =>
              setActivePackageId(prev =>
                prev === pkg.submission_id ? null : pkg.submission_id
              )
            }
            onViewFile={handleViewFile}
            onDownloadFile={(submissionId, filename) => {
              // plug your download logic here
            }}
          />

          {/* Right: Active folder upload/extract workflow */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              {activePackage ? `Upload to: ${activePackage.name}` : 'No folder selected'}
            </h2>
            <ClientWorkflowPanel
              rows={uploadedRows}
              isUploading={isUploading}
              isExtracting={isExtracting}
              uploadStatus={statusText}
              message={message}
              error={workflowError}
              onUploadMore={triggerFileUpload}
              onExtract={extractSelected}
              onRemove={removeRow}
              onView={(submissionId, filename) => {
                if (filename) {
                  handleViewFile(submissionId, filename)
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
