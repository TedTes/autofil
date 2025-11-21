'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  FileText,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users,
  FolderOpen,
  Upload,
  Check,
  X,
  Eye,
  AlertCircle,
} from 'lucide-react'

import {
  getRecentSubmissions,
  getClients,
  uploadPdf,
  getSubmission,
} from '@/lib/api-client'
import type { RecentSubmission, Client } from '@/types'
import { ConfidenceBadgeCompact } from '@/components/ConfidenceBadge'
import RecentSubmissionsCard from './dashboard/RecentSubmissionsCard'
import { formatDate } from '@/lib/utils'

type UploadedRow = {
  submissionId: string
  filename: string
  uploadedAt: string
  fileType: 'pdf' | 'excel' | 'csv' | 'other'
  fileSize: number
  confidence?: number
  uploadPercent?: number
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'error'
  extractionProgress: number
  extractionError?: string
}

type HomeViewProps = {
  totalSubmissions: number
  onGoToFile?: (submissionId: string, filename?: string) => void
  onNavigateToDocuments?: () => void
  onNavigateToClients?: () => void
}

export function HomeView({
  totalSubmissions,
  onGoToFile,
  onNavigateToDocuments,
  onNavigateToClients,
}: HomeViewProps) {
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(false)

  useEffect(() => {
    loadRecentSubmissions()
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      setLoadingClients(true)
      const data = await getClients()
      setClients(data)
    } catch (error) {
      console.error('Failed to load clients:', error)
    } finally {
      setLoadingClients(false)
    }
  }

  const loadRecentSubmissions = async () => {
    try {
      setLoadingRecent(true)
      const data = await getRecentSubmissions({ 
        limit: 5,
        include_files: true 
      })
      setRecentSubmissions(data)
    } catch (error) {
      console.error('Failed to load recent submissions:', error)
    } finally {
      setLoadingRecent(false)
    }
  }

  const handleRecentSubmissionClick = (submissionId: string) => {
    if (onGoToFile) {
      onGoToFile(submissionId)
    }
  }

  if (totalSubmissions === 0 && clients.length === 0) {
    return (
      <EmptyDashboardState
        onGoToFile={onGoToFile}
        onNavigateToDocuments={onNavigateToDocuments}
        onNavigateToClients={onNavigateToClients}
      />
    )
  }

  // Calculate real stats
  const activeSubmissions = recentSubmissions.filter(s => 
    s.status === 'extracting' || s.status === 'uploaded' || s.status === 'ready'
  ).length

  const completedSubmissions = recentSubmissions.filter(s => 
    s.status === 'filled' || s.status === 'extracted'
  ).length

  const successRate = totalSubmissions > 0
    ? Math.round((completedSubmissions / totalSubmissions) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Stats Grid - REAL DATA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Users} 
          label="Total Clients" 
          value={loadingClients ? '...' : clients.length.toString()} 
          color="blue" 
        />
        <StatCard 
          icon={FileText} 
          label="Active Submissions" 
          value={activeSubmissions.toString()} 
          color="purple" 
        />
        <StatCard 
          icon={CheckCircle2} 
          label="Completed" 
          value={completedSubmissions.toString()} 
          color="green" 
        />
        <StatCard 
          icon={TrendingUp} 
          label="Success Rate" 
          value={`${successRate}%`} 
          color="orange" 
        />
      </div>

      {/* Quick Access Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Access</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={onNavigateToClients}
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
          >
            <Users className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900">Clients</div>
              <div className="text-xs text-gray-500">Manage clients & upload</div>
            </div>
          </button>
          
          <button
            onClick={onNavigateToDocuments}
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
          >
            <FolderOpen className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900">Documents</div>
              <div className="text-xs text-gray-500">Browse all documents</div>
            </div>
          </button>

          <button
            onClick={onNavigateToDocuments}
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
          >
            <Clock className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900">Recent</div>
              <div className="text-xs text-gray-500">View recent activity</div>
            </div>
          </button>
        </div>
      </div>

      {/* Recent Submissions */}
      <RecentSubmissionsCard
        limit={5}
        onSubmissionClick={handleRecentSubmissionClick}
        onViewAll={onNavigateToDocuments}
      />
    </div>
  )
}
function EmptyDashboardState({
  onGoToFile,
  onNavigateToDocuments,
  onNavigateToClients,
}: {
  onGoToFile?: (submissionId: string, filename?: string) => void
  onNavigateToDocuments?: () => void
  onNavigateToClients?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<UploadedRow[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const getFileType = (filename: string): UploadedRow['fileType'] => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'pdf'
    if (ext === 'xlsx' || ext === 'xls') return 'excel'
    if (ext === 'csv') return 'csv'
    return 'other'
  }

  const addRow = (row: UploadedRow) => {
    setRows((prev) => [row, ...prev])
  }

  const updateRow = (submissionId: string, updates: Partial<UploadedRow>) => {
    setRows((prev) =>
      prev.map((row) =>
        row.submissionId === submissionId ? { ...row, ...updates } : row
      )
    )
  }

  const removeRow = (submissionId: string) => {
    setRows((prev) => prev.filter((row) => row.submissionId !== submissionId))
  }

  const doUpload = async (files: File[]) => {
    if (!files.length) return
    setIsUploading(true)
    setMessage(null)
    setError(null)

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const tempId = `tmp-${Date.now()}-${i}`
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

        setUploadStatus(`Uploading ${file.name} (0%)`)

        try {
          const res = await uploadPdf(file, (progress) => {
            setUploadStatus(`Uploading ${file.name} (${progress}%)`)
            updateRow(tempId, { uploadPercent: progress })
          })

          updateRow(tempId, {
            submissionId: res.submission_id,
            uploadPercent: 100,
            extractionStatus: 'pending',
            extractionProgress: 0,
          })

          setMessage(`Uploaded ${file.name}`)
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Upload failed'
          updateRow(tempId, {
            extractionStatus: 'error',
            extractionError: errorMessage,
          })
          setError(errorMessage)
        }
      }
    } finally {
      setIsUploading(false)
      setUploadStatus(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const files = Array.from(event.target.files ?? [])
    void doUpload(files)
  }

  const handleExtractSelected = async (selectedIds: string[]) => {
    if (!selectedIds.length) return
    setIsExtracting(true)
    setError(null)
    setMessage(null)

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
        setMessage('Extraction complete')
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Extraction failed'
        updateRow(submissionId, {
          extractionStatus: 'error',
          extractionError: message,
        })
        setError(message)
      }
    }

    setIsExtracting(false)
  }

  const emptyState = rows.length === 0

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        multiple
        accept="application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,.pdf,.csv,.xlsx,.xls"
      />

      {emptyState ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 shadow-sm p-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Upload className="w-10 h-10 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Upload your first files
          </h2>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Choose ACORD forms or other client documents. We will extract the data and
            get them ready for filling.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={triggerFilePicker}
              className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all"
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Select files'}
            </button>
            <button
              onClick={onNavigateToClients}
              className="inline-flex items-center gap-2 px-6 py-3 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              <Users className="w-5 h-5" />
              Manage clients
            </button>
          </div>
        </div>
      ) : (
        <ExtractPanel
          rows={rows}
          isUploading={isUploading}
          isExtracting={isExtracting}
          uploadStatus={uploadStatus}
          message={message}
          error={error}
          onExtractSelected={handleExtractSelected}
          onRemove={removeRow}
          onUploadMore={triggerFilePicker}
          onGoToFile={onGoToFile}
          onNavigateToDocuments={onNavigateToDocuments}
        />
      )}
    </div>
  )
}
function ExtractPanel({
  rows,
  isUploading,
  isExtracting,
  uploadStatus,
  message,
  error,
  onExtractSelected,
  onRemove,
  onUploadMore,
  onGoToFile,
  onNavigateToDocuments,
}: {
  rows: UploadedRow[]
  isUploading: boolean
  isExtracting: boolean
  uploadStatus: string | null
  message: string | null
  error: string | null
  onExtractSelected: (selectedIds: string[]) => Promise<void> | void
  onRemove: (submissionId: string) => void
  onUploadMore: () => void
  onGoToFile?: (submissionId: string, filename?: string) => void
  onNavigateToDocuments?: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedIds((prev) => {
      const retained = new Set<string>()
      rows.forEach((row) => {
        if (prev.has(row.submissionId)) {
          retained.add(row.submissionId)
        }
      })
      return retained
    })
  }, [rows])

  const toggleSelectAll = () => {
    const selectable = rows
      .filter((row) => row.extractionStatus !== 'extracting')
      .map((row) => row.submissionId)

    if (selectable.length === 0) {
      setSelectedIds(new Set())
      return
    }

    const allSelected = selectable.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectable))
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
    await onExtractSelected(Array.from(selectedIds))
    setSelectedIds(new Set())
  }

  const selectableCount = rows.filter(
    (row) => row.extractionStatus !== 'extracting'
  ).length
  const allSelected =
    selectableCount > 0 &&
    selectableCount === selectedIds.size

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
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
              <h3 className="text-sm font-semibold text-gray-900">
                {rows.length} file{rows.length !== 1 ? 's' : ''} uploaded
              </h3>
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 disabled:bg-gray-300 rounded-lg transition-colors"
            >
              {isExtracting ? 'Extracting…' : 'Extract'}
            </button>
            {onNavigateToDocuments && (
              <button
                onClick={onNavigateToDocuments}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                View documents
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 max-h-[500px] overflow-y-auto">
        {rows.map((row) => (
          <FileToast
            key={row.submissionId}
            row={row}
            isSelected={selectedIds.has(row.submissionId)}
            onToggleSelect={() => toggleSelect(row.submissionId)}
            onRemove={() => onRemove(row.submissionId)}
            onView={onGoToFile}
          />
        ))}
      </div>
    </div>
  )
}

function FileToast({
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
  const showCheckbox = row.extractionStatus !== 'extracting'

  const renderStatus = () => {
    if (row.uploadPercent !== undefined && row.uploadPercent < 100) {
      return (
        <p className="text-xs font-medium text-gray-600 mt-1">
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
                View
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
      {showCheckbox ? (
        <button
          onClick={onToggleSelect}
          className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            isSelected
              ? 'bg-blue-600 border-blue-600'
              : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </button>
      ) : (
        <div className="mt-1 w-5 h-5 rounded border-2 border-blue-200 bg-blue-50" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {row.filename}
            </p>
            <p className="text-xs text-gray-500">
              {formatFileType(row.fileType)} • {formatFileSize(row.fileSize)} •{' '}
              {formatDate(row.uploadedAt)}
            </p>
          </div>
        </div>
        {renderStatus()}
      </div>

      {row.extractionStatus !== 'extracting' && (
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

/* ===================== */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  value: string
  color: 'blue' | 'green' | 'purple' | 'orange'
}) {
  const colors: Record<typeof color, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
    orange: 'bg-orange-50 border-orange-100 text-orange-700',
  }

  return (
    <div className={`${colors[color]} border rounded-lg p-6`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <p className="text-4xl font-bold">{value}</p>
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

function FeatureHighlight({
  icon: Icon,
  iconColor,
  bgColor,
  title,
  description,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  iconColor: string
  bgColor: string
  title: string
  description: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-all duration-150">
      <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center mb-4`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  )
}
