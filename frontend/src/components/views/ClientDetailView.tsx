'use client'

import React, { useRef, useState, useEffect } from 'react'
import { formatDate } from '@/lib/utils'
import { useClientSubmissions, type UploadedRow } from '@/hooks/useClientSubmissions'
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

// Compact folder list component
function CompactFolderList({
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

  const toggleFolder = (submissionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedFolders((prev) => {
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
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">
          Folders ({submissions.length})
        </h2>
      </div>

      {submissions.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">
          <FolderOpen className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="font-medium">No folders yet</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 max-h-[calc(100vh-300px)] overflow-y-auto">
          {submissions.map((submission) => {
            const badge = statusBadgeFor(submission.status)
            const StatusIcon = badge.icon
            const isExpanded = expandedFolders.has(submission.submission_id)
            const isActive = activeId === submission.submission_id
            const totalFiles =
              (submission.inputs?.length || 0) + (submission.outputs?.length || 0)

            return (
              <div
                key={submission.submission_id}
                className={`transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                {/* Folder Header - Compact */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={(e) => toggleFolder(submission.submission_id, e)}
                    className="p-0.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                    )}
                  </button>

                  <button
                    onClick={() => onToggle?.(submission)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    {isExpanded ? (
                      <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {submission.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {totalFiles} {totalFiles === 1 ? 'file' : 'files'}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isActive && (
                      <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    )}
                    <StatusIcon
                      className={`w-3.5 h-3.5 ${badge.color.split(' ')[0]} ${
                        submission.status === 'extracting' ? 'animate-spin' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Expanded Files - Compact */}
                {isExpanded && (
                  <div className="px-3 pb-2 bg-gray-50/50">
                    <div className="ml-6 space-y-2 text-xs">
                      {/* Input Files */}
                      {submission.inputs && submission.inputs.length > 0 && (
                        <div>
                          {/* <div className="flex items-center gap-1.5 mb-1 text-gray-600">
                            <Upload className="w-3 h-3" />
                            <span className="font-medium">Inputs ({submission.inputs.length})</span>
                          </div> */}
                          <div className="space-y-0.5">
                            {submission.inputs.map((file, idx) => (
                              <div
                                key={`${submission.submission_id}-in-${idx}`}
                                className="flex items-center gap-1.5 px-2 py-1 hover:bg-white rounded transition-colors group"
                              >
                                {getFileIcon(file.filename)}
                                <span className="flex-1 truncate text-gray-700">
                                  {file.filename}
                                </span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {onViewFile && (
                                    <button
                                      onClick={() =>
                                        onViewFile(submission.submission_id, file.filename)
                                      }
                                      className="p-1 hover:bg-gray-200 rounded"
                                      title="View"
                                    >
                                      <Eye className="w-3 h-3 text-gray-600" />
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
                          <div className="flex items-center gap-1.5 mb-1 text-gray-600">
                            <FileStack className="w-3 h-3" />
                            <span className="font-medium">
                              Outputs ({submission.outputs.length})
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {submission.outputs.map((file, idx) => (
                              <div
                                key={`${submission.submission_id}-out-${idx}`}
                                className="flex items-center gap-1.5 px-2 py-1 hover:bg-white rounded transition-colors group"
                              >
                                <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                                <span className="flex-1 truncate text-gray-700">
                                  {file.filename}
                                </span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {onViewFile && (
                                    <button
                                      onClick={() =>
                                        onViewFile(submission.submission_id, file.filename)
                                      }
                                      className="p-1 hover:bg-gray-200 rounded"
                                      title="View"
                                    >
                                      <Eye className="w-3 h-3 text-gray-600" />
                                    </button>
                                  )}
                                  {onDownloadFile && (
                                    <button
                                      onClick={() =>
                                        onDownloadFile(submission.submission_id, file.filename)
                                      }
                                      className="p-1 hover:bg-gray-200 rounded"
                                      title="Download"
                                    >
                                      <Download className="w-3 h-3 text-gray-600" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
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

// File upload drop zone component
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
  onView?: (submissionId: string, filename?: string) => void
  activePackageName?: string
}) {
  const [isDragging, setIsDragging] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    // Handle file drop - you'll need to integrate this with your upload logic
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      // Trigger your file upload handler
      console.log('Files dropped:', files)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">
          {activePackageName ? `Upload to: ${activePackageName}` : 'Select a folder'}
        </h2>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {rows.length === 0 ? (
          <div
            ref={dropZoneRef}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`flex-1 m-4 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="text-center p-8">
              <Upload
                className={`w-12 h-12 mx-auto mb-4 transition-colors ${
                  isDragging ? 'text-blue-500' : 'text-gray-400'
                }`}
              />
              <p className="text-sm font-medium text-gray-900 mb-1">
                {isDragging ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="text-xs text-gray-500 mb-4">
                or click the button below
              </p>
              <button
                onClick={onUploadMore}
                disabled={isUploading || !activePackageName}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                {isUploading ? 'Uploading…' : 'Choose Files'}
              </button>
              {!activePackageName && (
                <p className="text-xs text-amber-600 mt-3">
                  ⚠ Please select a folder first
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Action bar */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="text-xs font-medium text-gray-700">
                {rows.length} recent upload{rows.length === 1 ? '' : 's'}
              </div>
              <button
                onClick={onUploadMore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add more
              </button>
            </div>

            {/* Status messages */}
            {(uploadStatus || message || error) && (
              <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0">
                {uploadStatus && (
                  <p className="text-xs text-gray-600">{uploadStatus}</p>
                )}
                {message && <p className="text-xs text-green-600">{message}</p>}
                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {rows.map((row) => (
                <div
                  key={row.submissionId}
                  className="px-4 py-3 border-b border-gray-100 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {row.filename}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileType(row.fileType)} • {formatFileSize(row.fileSize)} •{' '}
                        {formatDate(row.uploadedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemove(row.submissionId)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    {row.uploadPercent < 100 ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        <span>Uploading {row.uploadPercent}%</span>
                      </>
                    ) : row.extractionStatus === 'extracted' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-600 font-medium">Extraction complete</span>
                        {row.confidence !== undefined && (
                          <span className="text-gray-500">
                            • Confidence {(row.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                        {onView && (
                          <button
                            onClick={() => onView(row.submissionId, row.filename)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                          >
                            <Eye className="w-3 h-3" />
                            Open in reviewer
                          </button>
                        )}
                      </>
                    ) : row.extractionStatus === 'error' ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        <span className="text-red-600 font-medium">
                          {row.extractionError || 'Extraction failed'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        <span>Pending extraction</span>
                      </>
                    )}
                  </div>

                  {row.extractionData && (
                    <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 overflow-auto max-h-40">
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(row.extractionData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
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
    statusText,
    message,
    workflowError,
    removeRow,
    createFolder,
    uploadFilesToActiveFolder,
    stats,
  } = useClientSubmissions(clientId)

  const triggerFileUpload = () => fileInputRef.current?.click()

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (
    event
  ) => {
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
          <p className="text-sm text-gray-900 font-medium mb-1">
            Failed to load client
          </p>
          <p className="text-sm text-gray-600">{error || 'Unknown error'}</p>
        </div>
      </div>
    )
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

      {/* Header - Responsive */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
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
                {clientName || (client && client.name)}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600">ID: {clientId}</p>
            </div>
          </div>
          <button
            onClick={handleCreatePackageClick}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            New Folder
          </button>
        </div>

        {/* Client Info - Responsive */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Created {(client && formatDate(client.created_at)) || 'Recently'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>
              {stats.total} {stats.total === 1 ? 'folder' : 'folders'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content - Responsive Grid */}
      <div className="flex-1 overflow-hidden p-4 sm:p-6">
        <div className="h-full grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[380px_1fr] gap-4 sm:gap-6">
          {/* Left: Compact Folders */}
          <div className="h-full overflow-hidden">
            <CompactFolderList
              submissions={packages}
              activeId={activePackageId}
              onToggle={(pkg: ClientSubmissionPackage) =>
                setActivePackageId((prev) =>
                  prev === pkg.submission_id ? null : pkg.submission_id
                )
              }
              onViewFile={handleViewFile}
              onDownloadFile={(submissionId, filename) => {
                // Implement download logic
                console.log('Download:', submissionId, filename)
              }}
            />
          </div>

          {/* Right: File Upload Drop Zone */}
          <div className="h-full overflow-hidden">
            <FileUploadDropZone
              rows={uploadedRows}
              isUploading={isUploading}
              uploadStatus={statusText}
              message={message}
              error={workflowError}
              onUploadMore={triggerFileUpload}
              onRemove={removeRow}
              onView={(submissionId, filename) => {
                if (filename) {
                  handleViewFile(submissionId, filename)
                }
              }}
              activePackageName={activePackage?.name}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
