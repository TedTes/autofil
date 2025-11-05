'use client'

import React, { useRef, useState } from 'react'
import { 
  CheckSquare, Calendar, Download, FileText, TrendingUp, Zap, Clock, 
  CheckCircle2, Upload, File, FileSpreadsheet, X, Eye, Check
} from 'lucide-react'
import { uploadPdf, getSubmission, downloadPdf } from '@/lib/api-client'
import { ConfidenceBadgeCompact } from '@/components/ConfidenceBadge'

type Phase = 'upload' | 'extract' | 'export'

type UploadedRow = {
  submissionId: string
  filename: string
  uploadedAt: string
  fileType?: 'pdf' | 'excel' | 'csv' | 'other'
  fileSize?: number
  confidence?:number
}

type HomeViewProps = {
  totalSubmissions: number
  onUploadComplete?: (uploadedCount: number) => void
  onGoToFile?: (submissionId: string, filename?: string) => void
}

export function HomeView({ totalSubmissions, onUploadComplete, onGoToFile }: HomeViewProps) {
  if (totalSubmissions === 0) {
    return (
      <EmptyDashboardState
        onUploadComplete={onUploadComplete}
        onGoToFile={onGoToFile}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-sm p-8 text-white">
        <h2 className="text-3xl font-bold mb-2">Welcome to AutoFil</h2>
        <p className="text-blue-100 text-lg">
          Intelligent document processing with automated extraction, version control, and export capabilities
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total Submissions" value="0" color="blue" />
        <StatCard icon={TrendingUp} label="Avg Confidence" value="0%" color="green" />
        <StatCard icon={CheckSquare} label="Completed Today" value="0" color="purple" />
        <StatCard icon={Calendar} label="This Week" value="0" color="orange" />
      </div>
    </div>
  )
}

function EmptyDashboardState({
  onUploadComplete,
  onGoToFile,
}: {
  onUploadComplete?: (uploadedCount: number) => void
  onGoToFile?: (submissionId: string, filename?: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState<Record<number, number>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>('upload')
  const [uploaded, setUploaded] = useState<UploadedRow[]>([])

  const triggerFilePicker = () => fileInputRef.current?.click()

  // Helper to detect file type
  const getFileType = (filename: string): UploadedRow['fileType'] => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'pdf'
    if (ext === 'xlsx' || ext === 'xls') return 'excel'
    if (ext === 'csv') return 'csv'
    return 'other'
  }

  const doUpload = async (files: File[]) => {
    if (!files.length) return
    setIsUploading(true)
    setError(null)
    setMessage(null)
    setProgress({})

    try {
      const rows: UploadedRow[] = []

      for (let i = 0; i < files.length; i++) {
        const res = await uploadPdf(files[i], (p) => {
          setProgress((prev) => ({ ...prev, [i]: p }))
        })
        rows.push({
          submissionId: res.submission_id,
          filename: files[i].name,
          uploadedAt: new Date().toISOString(),
          fileType: getFileType(files[i].name),
          fileSize: files[i].size,
        })
      }

      setUploaded((prev) => [...rows, ...prev])
      setMessage(`Uploaded ${rows.length} file${rows.length > 1 ? 's' : ''} successfully.`)
      onUploadComplete?.(rows.length)

      // Advance to EXTRACT view
      setPhase('extract')
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Upload failed'
      setError(errorMessage)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = Array.from(e.target.files ?? [])
    await doUpload(files)
  }

  const handleDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files ?? [])
    await doUpload(files)
  }

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
  }

  const percentOverall =
    Object.keys(progress).length > 0
      ? Math.floor(Object.values(progress).reduce((a, b) => a + b, 0) / Object.keys(progress).length)
      : 0

  const removeFile = (submissionId: string) => {
    setUploaded((prev) => prev.filter((r) => r.submissionId !== submissionId))
    if (uploaded.length === 1) {
      setPhase('upload')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Main upload/extract box */}
      <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              multiple
              accept=".pdf,.csv,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        {phase === 'upload' ? (
          <div
            className="relative"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
          
           

            {/* Upload zone */}
            <div
              className="px-8 py-16 text-center cursor-pointer"
              onClick={triggerFilePicker}
            >
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex items-center justify-center">
                <Upload className="w-10 h-10 text-blue-600" />
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Upload your documents
              </h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Drag and drop your PDFs here, or click to browse
              </p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  triggerFilePicker()
                }}
                className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all duration-150 disabled:opacity-60"
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Choose files
                  </>
                )}
              </button>

              <p className="text-sm text-gray-500 mt-6">PDF, Excel, CSV • Up to 50 MB per file</p>

              {(isUploading || message || error) && (
                <div className="mt-8 max-w-md mx-auto">
                  {isUploading && (
                    <div className="space-y-2">
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 bg-blue-600 transition-all duration-300 rounded-full"
                          style={{ width: `${percentOverall}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-600 text-center">{percentOverall}% complete</p>
                    </div>
                  )}
                  {message && (
                    <div className="flex items-center gap-2 justify-center text-green-700 bg-green-50 rounded-lg px-4 py-3">
                      <CheckCircle2 className="w-5 h-5" />
                      <p className="text-sm font-medium">{message}</p>
                    </div>
                  )}
                  {error && (
                    <div className="flex items-center gap-2 justify-center text-red-700 bg-red-50 rounded-lg px-4 py-3">
                      <X className="w-5 h-5" />
                      <p className="text-sm font-medium">{error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

          
          </div>
        ) : (
          <ExtractPanel
            rows={uploaded}
            phase={phase}
            onExtractSelected={async (selectedIds) => {
              if (selectedIds.length === 1) {
                // Single file - navigate directly
                const row = uploaded.find((r) => r.submissionId === selectedIds[0])
                if (row && onGoToFile) {
                  onGoToFile(row.submissionId, row.filename)
                }
              } else {
                // Multiple files - show success message
                setMessage(`✓ Ready to view ${selectedIds.length} files`)
                setPhase('export')
              }
            }}
            onRemove={removeFile}
            onUploadMore={triggerFilePicker}
          />
        )}
      </div>

      {/* Separator */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-gray-50 text-gray-500 font-medium">Features</span>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="grid md:grid-cols-3 gap-6">
        <FeatureHighlight
          icon={CheckCircle2}
          iconColor="text-green-600"
          bgColor="bg-green-50"
          title="95%+ Accuracy"
          description="AI-powered extraction with high confidence scoring"
        />
        <FeatureHighlight
          icon={Clock}
          iconColor="text-purple-600"
          bgColor="bg-purple-50"
          title="Version Control"
          description="Track every change with complete audit history"
        />
        <FeatureHighlight
          icon={Zap}
          iconColor="text-orange-600"
          bgColor="bg-orange-50"
          title="Instant Results"
          description="Process documents in seconds, not hours"
        />
      </div>
    </div>
  )
}

/* ===================== */
/*  Mini Steps (in box)  */
/* ===================== */
function MiniStep({ 
  active, 
  complete, 
  label 
}: { 
  active: boolean
  complete: boolean
  label: string 
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all ${
          complete
            ? 'bg-blue-600 text-white'
            : active
            ? 'bg-blue-100 text-blue-600'
            : 'bg-gray-100 text-gray-400'
        }`}
      >
        {complete ? <Check className="w-3 h-3" /> : label.charAt(0)}
      </div>
      <span
        className={`text-xs font-medium ${
          active || complete ? 'text-gray-700' : 'text-gray-400'
        }`}
      >
        {label}
      </span>
    </div>
  )
}

/* ===================== */
/*  Extract Panel with Toast-like Files */
/* ===================== */
function ExtractPanel({
  rows,
  phase,
  onExtractSelected,
  onRemove,
  onUploadMore,
}: {
  rows: UploadedRow[]
  phase: Phase
  onExtractSelected: (selectedIds: string[]) => Promise<void>
  onRemove: (submissionId: string) => void
  onUploadMore: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isExtracting, setIsExtracting] = useState(false)

  const allSelected = rows.length > 0 && selectedIds.size === rows.length

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.submissionId)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleExtract = async () => {
    if (selectedIds.size === 0) return
    
    setIsExtracting(true)
    try {
      await onExtractSelected(Array.from(selectedIds))
      setSelectedIds(new Set())
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div className="relative">
      {/* Header with batch actions */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Select All Checkbox */}
            <button
              onClick={toggleSelectAll}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                allSelected
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              {allSelected && <Check className="w-3 h-3 text-white" />}
            </button>

            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} files ready`}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.size > 0 ? (
              <>
                <button
                  onClick={handleExtract}
                  disabled={isExtracting}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {isExtracting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Extract {selectedIds.size > 1 ? `${selectedIds.size}` : ''}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Clear
                </button>
              </>
            ):(
              <button
                onClick={onUploadMore}
                className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium border border-blue-200"
              >
                <Upload className="w-4 h-4" />
                Upload more
              </button>
            )
            }
          </div>
        </div>
      </div>

      {/* Toast-like file list */}
      <div className="px-4 py-3 max-h-96 overflow-y-auto">
        <div className="space-y-2">
          {rows.map((row) => (
            <FileToast
              key={row.submissionId}
              row={row}
              isSelected={selectedIds.has(row.submissionId)}
              onToggleSelect={() => toggleSelect(row.submissionId)}
              onRemove={() => onRemove(row.submissionId)}
            />
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
</div>
    </div>
  )
}

function FileToast({
  row,
  isSelected,
  onToggleSelect,
  onRemove,
}: {
  row: UploadedRow
  isSelected: boolean
  onToggleSelect: () => void
  onRemove: () => void
}) {
  const FileIcon = getFileIcon(row.fileType)
  const fileColor = getFileColor(row.fileType)

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:shadow-sm group ${
        isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
      onClick={onToggleSelect}
    >
      {/* Checkbox */}
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          isSelected
            ? 'bg-blue-600 border-blue-600'
            : 'border-gray-300 group-hover:border-blue-400'
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>

      {/* File icon */}
      <div className={`w-10 h-10 ${fileColor.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
        <FileIcon className={`w-5 h-5 ${fileColor.text}`} />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div>
        <h4 className="text-sm font-semibold text-gray-900 truncate" title={row.filename}>
          {row.filename}
        </h4>
        {row.confidence && <ConfidenceBadgeCompact confidence={row.confidence} />}
        </div>
       
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className={`font-medium ${fileColor.text}`}>
            {row.fileType?.toUpperCase() || 'FILE'}
          </span>
          <span>•</span>
          <span>{formatFileSize(row.fileSize)}</span>
          <span>•</span>
          <span>{formatTimeAgo(row.uploadedAt)}</span>
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/* ===================== */
/*  Helper functions     */
/* ===================== */
function getFileIcon(type?: UploadedRow['fileType']) {
  switch (type) {
    case 'pdf':
      return FileText
    case 'excel':
      return FileSpreadsheet
    case 'csv':
      return FileSpreadsheet
    default:
      return File
  }
}

function getFileColor(type?: UploadedRow['fileType']) {
  switch (type) {
    case 'pdf':
      return { bg: 'bg-red-50', text: 'text-red-600' }
    case 'excel':
      return { bg: 'bg-green-50', text: 'text-green-600' }
    case 'csv':
      return { bg: 'bg-blue-50', text: 'text-blue-600' }
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-600' }
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'
  return Math.floor(seconds / 86400) + 'd ago'
}

/* ===================== */
/*  Presentational bits  */
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
