'use client'

import React, { useRef, useState, useEffect,useCallback } from 'react'
import { useClientSubmissions,useTemplateLibrary } from '@/hooks'
import { fillPdf, downloadPDF} from '@/lib/api-client'
import {GenerateOutputsModal,UploadOrMergedDataPanel} from "@/components/client"
import type { ClientSubmissionPackage,UploadedRow  } from '@/types'
import { CreateSubmissionModal,DeleteConfirmationModal } from '@/components'
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
  FolderPlus,
  Combine,
  Plus,
  Trash2
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
    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
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
  onDeleteInput,
  onDeleteOutput,
  onDeleteSubmission,
}: {
  submissions: ClientSubmissionPackage[]
  activeId?: string | null
  selectedInputsByPackage: Record<string, string[]>
  selectedOutputsByPackage: Record<string, string[]>
  onToggle?: (pkg: ClientSubmissionPackage) => void
  onViewFile?: (submissionId: string, filename?: string, inputId?: string) => void
  onDownloadFile?: (submissionId: string, filename: string) => void
  onToggleInput?: (submissionId: string, inputId: string) => void
  onSelectAllInputs?: (submissionId: string, inputIds: string[]) => void
  onToggleOutput?: (submissionId: string, filename: string) => void
  onSelectAllOutputs?: (submissionId: string, filenames: string[]) => void
  onFillPackage?: (pkgId: string) => void
  onMergePackage?: (pkgId: string) => void
  fillingPackageId?: string | null
  mergingPackageId?: string | null
  fillMessage?: string | null
  mergeMessage?: string | null
  onDeleteInput?: (submissionId: string, inputId: string, event: React.MouseEvent) => void
  onDeleteOutput?: (submissionId: string, outputId: string, event: React.MouseEvent) => void
  onDeleteSubmission?: (submissionId: string, event: React.MouseEvent) => void
}) {
  const renderPackageCard = (pkg: ClientSubmissionPackage) => {
    const isOpen = activeId === pkg.submission_id
    const badge = statusBadgeFor(pkg.status)
    const Icon = badge.icon

    const totalInputs = pkg.inputs?.length || 0
    const totalOutputs = pkg.outputs?.length || 0
    const selectedInputFilenames = selectedInputsByPackage[pkg.submission_id] || []
    const selectedOutputFilenames = selectedOutputsByPackage[pkg.submission_id] || []

    const isFilling = fillingPackageId === pkg.submission_id
    const isMerging = mergingPackageId === pkg.submission_id
    const hasMessage = fillMessage || mergeMessage

    return (
      <div
        key={pkg.submission_id}
        className={`border rounded-lg overflow-hidden transition-all ${
          isOpen
            ? 'bg-blue-50 border-blue-200 shadow-sm'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
      >
{/* Package Header - WITH DELETE BUTTON */}
<div className="flex items-center gap-1">
  <button
    onClick={() => onToggle?.(pkg)}
    className="flex-1 px-3 py-2.5 flex items-center gap-2 text-left hover:bg-gray-50 transition-colors"
  >
    <div className="flex-shrink-0">
      {isOpen ? (
        <ChevronDown className="w-4 h-4 text-gray-600" />
      ) : (
        <ChevronRight className="w-4 h-4 text-gray-600" />
      )}
    </div>
    <Folder className={`w-4 h-4 flex-shrink-0 ${isOpen ? 'text-blue-600' : 'text-gray-500'}`} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">{pkg.name}</p>
    </div>
    {/* Stats badges */}
    <div className="flex items-center gap-1.5">
      {totalInputs > 0 && (
        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
          {totalInputs} in
        </span>
      )}
      {totalOutputs > 0 && (
        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
          {totalOutputs} out
        </span>
      )}
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${badge.color}`} />
    </div>
  </button>
  
  {/* NEW: Delete Submission Button */}
  <button
    onClick={(e) => onDeleteSubmission?.(pkg.submission_id, e)}
    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
    title="Delete submission"
  >
    <Trash2 className="w-4 h-4" />
  </button>
</div>

        {/* Package Content */}
        {isOpen && (
          <div className="border-t border-gray-200 bg-white">
            {/* Messages */}
            {hasMessage && (
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                <p className="text-xs text-blue-700">{fillMessage || mergeMessage}</p>
              </div>
            )}

            {/* Inputs Section */}
            {pkg.inputs && pkg.inputs.length > 0 && (
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-700">Inputs</h4>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const inputIds =
                        pkg.inputs
                          ?.map(input => input.input_id || input.input_id || input.filename)
                          .filter((val): val is string => Boolean(val)) || []
                      onSelectAllInputs?.(pkg.submission_id, inputIds)
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
                  >
                    {selectedInputFilenames.length === totalInputs ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {/* Vertical list of input files */}
                <div className="space-y-1.5">
                  {pkg.inputs.map((input) => {
                    const inputKey = input.input_id || input.input_id || input.filename
                    const isSelected = inputKey ? selectedInputFilenames.includes(inputKey) : false
                    return (
                      <div
                        key={inputKey || input.filename}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <label 
                          className="flex items-center cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
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
                          {input.confidence !== undefined && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Confidence: {Math.round(input.confidence * 100)}%
                            </p>
                          )}
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
        )}
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
  onNavigateBack?: () => void
  onFileClick?: (submissionId: string, filename?: string, inputId?: string) => void
}

export function ClientDetailView({
  clientId,
  clientName,
  onNavigateBack,
  onFileClick,
}: ClientDetailViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
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
    mergedData,
    isMergedDataLoading,
    mergedDataError,

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
    deleteSubmissionPackage
  } = useClientSubmissions(clientId)
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
  const handleEditMergedField = useCallback((fieldPath: string, value: string | number | boolean) => {
    console.log('Edit merged field:', fieldPath, value)
  }, [])
  const hasExtractedFiles = activePackage?.inputs?.some(
    input => input.extraction_status === 'extracted' || input.extraction_status === 'ready'
  ) || false


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

  const triggerFileUpload = () => fileInputRef.current?.click()

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const files = Array.from(event.target.files ?? [])
    void uploadFilesToActiveFolder(files)
    event.target.value = ''
  }

  const handleCreateSubmissionClick = () => {
    setIsCreateModalOpen(true)
  }
  
  const handleConfirmCreateSubmission = async (name: string) => {
    setIsCreating(true)
    try {
      await createFolder(name)
      setIsCreateModalOpen(false)
    } catch (err) {
      console.error('Failed to create submission:', err)
      // Modal stays open so user can try again or see the error
    } finally {
      setIsCreating(false)
    }
  }
  
  const handleCloseCreateModal = () => {
    if (!isCreating) {
      setIsCreateModalOpen(false)
    }
  }

  const handleViewFile = (submissionId: string, filename?: string, inputId?: string) => {
    if (filename) {
      onFileClick?.(submissionId, filename, inputId)
    }
  }

  const handleDownloadOutput = async (submissionId: string, filename: string) => {
    try {
      await downloadPDF(submissionId, filename)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const handleMergeOutputsForPackage = async (packageId: string) => {
    const pkg = packages.find((p) => p.submission_id === packageId)
    if (!pkg) return

    setMergeState({ loading: true, message: null, error: null, packageId })

    try {
      const selected = selectedOutputsByPackage[packageId] || []
      // Implementation depends on  merge API
      // const result = await mergeOutputs(packageId, { filenames: selected })
      await refreshClient()
      setMergeState({
        loading: false,
        message: `Merged ${selected.length > 0 ? selected.length : pkg.outputs?.length || 0} file(s)`,
        error: null,
        packageId,
      })
    } catch (err) {
      setMergeState({
        loading: false,
        message: null,
        error: err instanceof Error ? err.message : 'Merge failed',
        packageId,
      })
    }
  }

  useEffect(() => {
    setFillState((prev) => ({ ...prev, message: null, error: null }))
    setMergeState((prev) => ({ ...prev, message: null, error: null }))
    setOutputState((prev) => ({ ...prev, message: null, error: null }))
  }, [activePackageId])

  const handleFillPackage = async (packageId: string) => {
    const pkg = packages.find((p) => p.submission_id === packageId)
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
        message: `Filled ${filledCount} field${filledCount === 1 ? '' : 's'}${selectionHint}`,
        error: null,
        packageId,
      })
    } catch (err) {
      setFillState({
        loading: false,
        message: null,
        error: err instanceof Error ? err.message : 'Fill failed',
        packageId,
      })
    }
  }

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

      {/* Top Bar*/}
     {/* SPLIT HEADER - Client info on left, Package info on right */}
<div className="bg-white border-b border-gray-200 px-4 py-2.5 flex-shrink-0">
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    {/* LEFT: Client Stats */}
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <button
        onClick={onNavigateBack}
        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
        title="Back to clients"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-gray-600">
        <Building2 className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium text-gray-700">{clientName || 'Client'}</span>
        <span className="text-gray-400">•</span>
        <span>{stats.totalFiles} files</span>
        <span className="text-gray-400">•</span>
        <span className="text-emerald-600 font-medium">
          {stats.extractedFiles}/{stats.totalFiles} extracted
        </span>
        <span className="text-gray-400">•</span>
        <span>{stats.totalPackages} packages</span>
      </div>
    </div>

    {/* RIGHT: Active Package Info (if merged data is shown) */}
    {hasExtractedFiles && activePackage && (
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <button
          onClick={() => setIsGenerateModalOpen(true)}
          disabled={availableTemplates.length === 0 || isMergedDataLoading}
          className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <FileText className="w-4 h-4" />
          <span>Generate</span>
          <span className="text-xs opacity-90">({selectedTemplateIds.length})</span>
        </button>
        <button
          onClick={triggerFileUpload}
          disabled={isUploading}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Files</span>
        </button>
      </div>
    )}
  </div>
</div>

      {/* Main Content - TWO COLUMN LAYOUT WITH PROPER SCROLLING */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        {/* LEFT PANEL: Submissions - SCROLLABLE */}
<div className="lg:col-span-1 h-full flex flex-col">
  <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-full max-h-[calc(100vh-90px)] overflow-hidden">
    
    {/* Submissions content with "New Submission" button at top */}
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-3 space-y-2">
        {/* New Package Button - Dashed style */}
        <button
  onClick={handleCreateSubmissionClick}
            className="w-full py-3 px-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 text-sm text-gray-600 hover:text-blue-600 transition-all flex items-center justify-center gap-2 group"
>
  <FolderPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
  <span className="font-medium">New Submission</span>  
</button>
        {packages.length === 0 ? (
      <div className="text-center py-12">
      <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500 mb-1">No submissions yet</p>
      <p className="text-xs text-gray-400">
        Create a submission to organize your files
      </p>
    </div>
    ) : (
        //  Submission List
        <CompactFolderList
          submissions={packages}
          activeId={activePackageId}
          selectedInputsByPackage={selectedInputsByPackage}
          selectedOutputsByPackage={selectedOutputsByPackage}
          onToggle={(pkg) =>
            setActivePackageId((prev) =>
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
          <div className="lg:col-span-2 h-full flex flex-col">
  <div className="h-full max-h-[calc(100vh-140px)]">
    <UploadOrMergedDataPanel
      hasExtractedFiles={hasExtractedFiles}
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
      onEditMergedField={handleEditMergedField}
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
      <GenerateOutputsModal
  isOpen={isGenerateModalOpen}
  onClose={() => setIsGenerateModalOpen(false)}
  availableTemplates={availableTemplates}
  selectedTemplateIds={selectedTemplateIds}
  onToggleTemplate={toggleTemplateSelection}
  mergedData={mergedData}
  onGenerate={async () => {
    await handleGenerateOutputs()
    // Modal will show success, user closes it
  }}
  isGenerating={isGeneratingOutputs}
  generationResult={lastGenerationResult}
  error={generateOutputsError}
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
