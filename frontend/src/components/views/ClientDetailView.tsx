'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
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
  TrendingUp,
  FileStack,
  Check,
  X,
  Eye,
} from 'lucide-react'
import type { Client } from '@/types'
import type { RecentSubmission } from '@/types/submission'
import { getClients, uploadPdf, getRecentSubmissions, getSubmission } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { ConfidenceBadgeCompact } from '@/components/ConfidenceBadge'

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

function formatFileSize(size: number): string {
  if (!size) return '0 KB'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
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
  const [client, setClient] = useState<Client | null>(null)
  const [submissions, setSubmissions] = useState<RecentSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null)
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [uploadedRows, setUploadedRows] = useState<UploadedRow[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tempIdRef = useRef(0)

  const getFileType = (filename: string): UploadedRow['fileType'] => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'pdf'
    if (ext === 'xlsx' || ext === 'xls') return 'excel'
    if (ext === 'csv') return 'csv'
    return 'other'
  }

  const addRow = (row: UploadedRow) => {
    setUploadedRows((prev) => [row, ...prev])
  }

  const updateRow = (submissionId: string, updates: Partial<UploadedRow>) => {
    setUploadedRows((prev) =>
      prev.map((row) =>
        row.submissionId === submissionId ? { ...row, ...updates } : row
      )
    )
  }

  const removeRow = (submissionId: string) => {
    setUploadedRows((prev) => prev.filter((row) => row.submissionId !== submissionId))
  }

  const refreshSubmissions = useCallback(async () => {
    try {
      const submissionsData = await getRecentSubmissions({
        limit: 20,
        include_files: true,
      })
      const clientSubmissions = submissionsData.filter(
        (s) => s.client_id === clientId
      )
      setSubmissions(clientSubmissions)
    } catch (err) {
      console.error('Failed to load submissions', err)
    }
  }, [clientId])

  // Load client details and submissions
  useEffect(() => {
    const loadClientData = async () => {
      try {
        setLoading(true)
        
        // Fetch client details
        const clientsData = await getClients()
        const foundClient = clientsData.find((c) => c.client_id === clientId)
        
        if (!foundClient) {
          setError('Client not found')
          return
        }
        
        setClient(foundClient)

        await refreshSubmissions()
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load client data')
      } finally {
        setLoading(false)
      }
    }

    void loadClientData()
  }, [clientId, refreshSubmissions])

  const doUpload = async (files: File[]) => {
    if (!files.length) return
    setIsUploading(true)
    setWorkflowMessage(null)
    setWorkflowError(null)
    setUploadStatusText(null)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const tempId = `tmp-${clientId}-${Date.now()}-${tempIdRef.current++}`
      const uploadedAt = new Date().toISOString()

      addRow({
        submissionId: tempId,
        filename: file.name,
        uploadedAt,
        fileType: getFileType(file.name),
        fileSize: file.size,
        uploadPercent: 0,
        extractionStatus: 'pending',
        extractionProgress: 0,
      })

      try {
        const result = await uploadPdf(file, (progress) => {
          setUploadStatusText(`Uploading ${file.name} (${progress}%)`)
          updateRow(tempId, { uploadPercent: progress })
        })

        setUploadedRows((prev) =>
          prev.map((row) =>
            row.submissionId === tempId
              ? {
                  ...row,
                  submissionId: result.submission_id,
                  uploadPercent: 100,
                  extractionStatus: 'pending',
                  extractionProgress: 0,
                }
              : row
          )
        )
        setWorkflowMessage(`Uploaded ${file.name}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        updateRow(tempId, {
          extractionStatus: 'error',
          extractionError: message,
        })
        setWorkflowError(message)
      }
    }

    setIsUploading(false)
    setUploadStatusText(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const files = Array.from(event.target.files ?? [])
    void doUpload(files)
    event.target.value = ''
  }

  const triggerFileUpload = () => {
    fileInputRef.current?.click()
  }

  const handleExtractSelected = async (selectedIds: string[]) => {
    if (!selectedIds.length) return
    setIsExtracting(true)
    setWorkflowMessage(null)
    setWorkflowError(null)

    for (const submissionId of selectedIds) {
      updateRow(submissionId, {
        extractionStatus: 'extracting',
        extractionProgress: 0,
        extractionError: undefined,
      })

      try {
        for (let progress = 20; progress <= 80; progress += 20) {
          await new Promise((resolve) => setTimeout(resolve, 120))
          updateRow(submissionId, { extractionProgress: progress })
        }

        const submission = await getSubmission(submissionId)
        updateRow(submissionId, {
          extractionStatus: 'extracted',
          extractionProgress: 100,
          confidence: submission.confidence,
        })
        setWorkflowMessage('Extraction complete')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extraction failed'
        updateRow(submissionId, {
          extractionStatus: 'error',
          extractionError: message,
        })
        setWorkflowError(message)
      }
    }

    await refreshSubmissions()
    setIsExtracting(false)
  }

  // Calculate stats
  const stats = {
    total: submissions.length,
    active: submissions.filter((s) => 
      s.status === 'extracting' || s.status === 'uploaded' || s.status === 'ready'
    ).length,
    completed: submissions.filter((s) => s.status === 'filled' || s.status === 'extracted').length,
    errors: submissions.filter((s) => s.status === 'error').length,
  }

  const successRate = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0

  // Get status badge config
  const getStatusBadge = (status: string) => {
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading client details...</p>
        </div>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {error || 'Client not found'}
          </h3>
          <button
            onClick={onNavigateBack}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Clients
          </button>
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
                {clientName || client.name}
              </h1>
              <p className="text-sm text-gray-600">Client ID: {clientId}</p>
            </div>
          </div>
          <button
            onClick={triggerFileUpload}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload Documents
              </>
            )}
          </button>
        </div>

        {/* Client Info Row */}
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>Created {formatDate(client.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileStack className="w-4 h-4" />
            <span>{stats.total} submissions</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Total Documents</span>
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Active</span>
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.active}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Completed</span>
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.completed}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Success Rate</span>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{successRate}%</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Document workflow</h2>
              <p className="text-sm text-gray-600">
                Upload files, then run extraction when ready.
              </p>
            </div>
            <button
              onClick={triggerFileUpload}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              disabled={isUploading}
            >
              <Upload className="w-4 h-4" />
              {isUploading ? 'Uploading…' : 'Upload files'}
            </button>
          </div>
          <ClientWorkflowPanel
            rows={uploadedRows}
            isUploading={isUploading}
            isExtracting={isExtracting}
            uploadStatus={uploadStatusText}
            message={workflowMessage}
            error={workflowError}
            onUploadMore={triggerFileUpload}
            onExtract={handleExtractSelected}
            onRemove={removeRow}
            onView={onFileClick}
          />
        </div>

        {/* Submissions List */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Submissions</h2>
          </div>

          {submissions.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No submissions yet
              </h3>
              <p className="text-gray-600 mb-6">
                Upload documents to get started with this client
              </p>
              <button
                onClick={triggerFileUpload}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Upload First Document
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {submissions.map((submission) => {
                const statusBadge = getStatusBadge(submission.status)
                const StatusIcon = statusBadge.icon

                return (
                  <button
                    key={submission.submission_id}
                    onClick={() => onFileClick?.(submission.submission_id, submission.name)}
                    className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          <h3 className="font-medium text-gray-900 truncate">
                            {submission.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>{submission.file_count} file{submission.file_count !== 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span>Updated {formatDate(submission.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusBadge.color}`}>
                          <StatusIcon className={`w-4 h-4 ${submission.status === 'extracting' ? 'animate-spin' : ''}`} />
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
