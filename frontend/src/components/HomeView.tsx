'use client'

import React, { useRef, useState ,useCallback,useEffect } from 'react'
import { 
  CheckSquare, Calendar, Download, FileText, TrendingUp, Zap, Clock, 
  CheckCircle2, Upload, File, FileSpreadsheet, X, Eye, Check
} from 'lucide-react'
import { uploadPdf, getSubmission,bulkSaveSubmissions, updateSubmissionStatus,getRecentSubmissions,getClients } from '@/lib/api-client'
import { ConfidenceBadgeCompact } from '@/components/ConfidenceBadge'
import {formatDate,formatFileSize, formatFileType} from "../lib/utils";
import { ExtractionReviewPanel } from './extraction'
import type { WorkflowFile, WorkflowStep,RecentSubmission, Client  } from '@/types'
import { UnsavedChangesDialog } from './shared/UnsavedChangesDialog'
import RecentSubmissionsCard from './dashboard/RecentSubmissionsCard'

type Phase = 'upload' | 'extract' | 'export'
type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue }

type JSONObject = { [key: string]: JSONValue }
type UploadedRow = {
  submissionId: string
  filename: string
  uploadedAt: string
  fileType?: 'pdf' | 'excel' | 'csv' | 'other'
  fileSize?: number
  confidence?: number
  //Extraction status tracking
  extractionStatus?: 'pending' | 'extracting' | 'extracted' | 'error'
  extractionProgress?: number  // 0-100
  extractionError?: string
}

type HomeViewProps = {
  totalSubmissions: number
  onUploadComplete?: (uploadedCount: number) => void
  onGoToFile?: (submissionId: string, filename?: string) => void
  onUnsavedChangesUpdate?: (hasChanges: boolean) => void
  onDocumentsSaved?: (count: number) => void
  onNavigateToDocuments?: () => void
  onNavigateToClients?: () => void
}

export function HomeView({
  totalSubmissions,
  onUploadComplete,
  onGoToFile,
  onUnsavedChangesUpdate,
  onDocumentsSaved,
  onNavigateToDocuments,
  onNavigateToClients,
}: HomeViewProps) {
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([])
const [loadingRecent, setLoadingRecent] = useState(false)
const [clients, setClients] = useState<Client[]>([])
const [selectedClient, setSelectedClient] = useState<string>('')
const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
const [loadingClients, setLoadingClients] = useState(false)

useEffect(() => {
  loadRecentSubmissions()
}, [])
useEffect(() => {
  const loadClients = async () => {
    try {
      setLoadingClients(true)
      const data = await getClients()
      setClients(data)
      if (data.length > 0) setSelectedClient(data[0].client_id)
    } catch (error) {
      console.error('Failed to load clients', error)
    } finally {
      setLoadingClients(false)
    }
  }
  void loadClients()
}, [])
// Load recent submissions
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

// Handle recent submission click
const handleRecentSubmissionClick = (submissionId: string) => {
  if (onGoToFile) {
    onGoToFile(submissionId)
  }
}
  if (totalSubmissions === 0) {
    return (
      <EmptyDashboardState
        onUploadComplete={onUploadComplete}
        onGoToFile={onGoToFile}
        onUnsavedChangesUpdate={onUnsavedChangesUpdate}
        onDocumentsSaved={onDocumentsSaved}
        onRecentSubmissionClick={handleRecentSubmissionClick}
        onNavigateToDocuments={onNavigateToDocuments}
        onNavigateToClients={onNavigateToClients}
        clients={clients}
        selectedClient={selectedClient}
        onClientChange={setSelectedClient}
        loadingClients={loadingClients}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-sm p-8 text-white">
      <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
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
  onUnsavedChangesUpdate,
  onDocumentsSaved,
  onRecentSubmissionClick,
  onNavigateToDocuments,
  onNavigateToClients,
  clients,
  selectedClient,
  onClientChange,
  loadingClients,
}: {
  onUploadComplete?: (uploadedCount: number) => void
  onGoToFile?: (submissionId: string, filename?: string) => void
  onUnsavedChangesUpdate?: (hasChanges: boolean) => void
  onDocumentsSaved?: (count: number) => void,
  onRecentSubmissionClick?: (submissionId: string) => void
  onNavigateToDocuments?: () => void
  onNavigateToClients?: () => void
  clients: Client[]
  selectedClient: string
  onClientChange: (clientId: string) => void
  loadingClients: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [progress, setProgress] = useState<Record<number, number>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Workflow state
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('upload')
  const [workflowFiles, setWorkflowFiles] = useState<WorkflowFile[]>([])
  const [uploaded, setUploaded] = useState<UploadedRow[]>([])
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const selectedClientData = clients.find((c) => c.client_id === selectedClient)
  const canUpload = Boolean(selectedClient)

const triggerFilePicker = () => {
  if (!selectedClient) {
    setError('Please select a client before uploading.')
    return
  }
  handleNavigationAttempt(() => {
    fileInputRef.current?.click()
  })
}

  // Helper to detect file type
  const getFileType = (filename: string): 'pdf' | 'excel' | 'csv' | 'other' => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'pdf'
    if (ext === 'xlsx' || ext === 'xls') return 'excel'
    if (ext === 'csv') return 'csv'
    return 'other'
  }

  // Check if there are unsaved changes
const hasUnsavedChanges = useCallback(() => {
  return workflowFiles.some(f => 
    f.status === 'extracted' || f.status === 'reviewing'
  )
}, [workflowFiles])

// Handle navigation with guard
const handleNavigationAttempt = useCallback((navigationFn: () => void) => {
  if (hasUnsavedChanges()) {
    setPendingNavigation(() => navigationFn)
    setShowUnsavedDialog(true)
  } else {
    navigationFn()
  }
}, [hasUnsavedChanges])

// Handle save from dialog
const handleDialogSave = async () => {
  setShowUnsavedDialog(false)
  const extractedFileIds = workflowFiles
    .filter(f => f.status === 'extracted' || f.status === 'reviewing')
    .map(f => f.id)
  
  await handleSaveAll(extractedFileIds)
  
  // Execute pending navigation after save
  if (pendingNavigation) {
    pendingNavigation()
    setPendingNavigation(null)
  }
}

// Handle discard from dialog
const handleDialogDiscard = () => {
  setShowUnsavedDialog(false)
  
  // Clear all extracted files
  setWorkflowFiles([])
  setUploaded([])
  setWorkflowStep('upload')
  
  // Execute pending navigation
  if (pendingNavigation) {
    pendingNavigation()
    setPendingNavigation(null)
  }
}

// Handle cancel from dialog
const handleDialogCancel = () => {
  setShowUnsavedDialog(false)
  setPendingNavigation(null)
}

  const doUpload = async (files: File[]) => {
    if (!files.length) return
    setIsUploading(true)
    setError(null)
    setMessage(null)
    setProgress({})
    
    try {
      const rows: UploadedRow[] = []
      const newWorkflowFiles: WorkflowFile[] = []
      const errors: Array<{ filename: string; error: string }> = []
      
      for (let i = 0; i < files.length; i++) {
        try {
          console.log(`📤 Uploading ${i + 1}/${files.length}: ${files[i].name}`)
          
          const res = await uploadPdf(files[i], (p) => {
            setProgress((prev) => ({ ...prev, [i]: p }))
          })
          
          console.log(`✅ Success ${i + 1}`)
          
          // Add to uploaded rows
          rows.push({
            submissionId: res.submission_id,
            filename: files[i].name,
            uploadedAt: new Date().toISOString(),
            fileType: getFileType(files[i].name),
            fileSize: files[i].size,
            confidence: res.extraction?.confidence,
            extractionStatus: 'pending',
            extractionProgress: 0
          })

          // Add to workflow files
          newWorkflowFiles.push({
            id: res.submission_id,
            file: files[i],
            filename: files[i].name,
            fileType: getFileType(files[i].name),
            fileSize: files[i].size,
            status: 'uploaded',
            uploadProgress: 100,
            submissionId: res.submission_id,
            uploadedAt: new Date().toISOString(),
          })
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : 'Upload failed'
          console.error(`❌ Failed ${i + 1}: ${files[i].name}`, errorMessage)
          
          errors.push({
            filename: files[i].name,
            error: errorMessage
          })
        }
      }
      
      // Update state after ALL files processed
      if (rows.length > 0) {
        setUploaded((prev) => [...rows, ...prev])
        setWorkflowFiles((prev) => [...newWorkflowFiles, ...prev])
        onUploadComplete?.(rows.length)
        setWorkflowStep('extract')
        
        if (errors.length > 0) {
          setMessage(
            `✓ Uploaded ${rows.length}/${files.length} files. ${errors.length} failed: ${errors.map(e => e.filename).join(', ')}`
          )
        } else {
          setMessage(`✓ Uploaded ${rows.length} file${rows.length > 1 ? 's' : ''} successfully.`)
        }
      } else {
        setError(`All ${files.length} uploads failed`)
      }

      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setTimeout(() => setMessage(null), 3000)
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Upload failed'
      setError(errorMessage)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
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

  // Extract selected files
  const handleExtractSelected = async (selectedIds: string[]) => {
    setMessage(null)
    setError(null)
    
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < selectedIds.length; i++) {
      const submissionId = selectedIds[i]
      
      try {
        // Update uploaded rows status
        setUploaded(prev =>
          prev.map(row =>
            row.submissionId === submissionId
              ? { ...row, extractionStatus: 'extracting', extractionProgress: 0 }
              : row
          )
        )
        
        // Update workflow files status
        setWorkflowFiles(prev =>
          prev.map(file =>
            file.id === submissionId
              ? { ...file, status: 'extracting' }
              : file
          )
        )
        
        // Simulate progress
        for (let progress = 20; progress <= 80; progress += 20) {
          await new Promise(resolve => setTimeout(resolve, 100))
          setUploaded(prev =>
            prev.map(row =>
              row.submissionId === submissionId
                ? { ...row, extractionProgress: progress }
                : row
            )
          )
        }
        
        // Fetch extraction data
        const data = await getSubmission(submissionId)
        
        // Update uploaded rows
        setUploaded(prev =>
          prev.map(row =>
            row.submissionId === submissionId
              ? { 
                  ...row, 
                  extractionStatus: 'extracted',
                  extractionProgress: 100,
                  confidence: data.confidence || row.confidence
                }
              : row
          )
        )
        
        // Update workflow files with extracted data
        setWorkflowFiles(prev =>
          prev.map(file =>
            file.id === submissionId
              ? { 
                  ...file, 
                  status: 'extracted',
                  extractedData: data.data,
                  confidence: data.confidence,
                  warnings: data.warnings,
                  extractedAt: new Date().toISOString(),
                }
              : file
          )
        )
        
        successCount++
        
      } catch (err) {
        console.error(`Extraction failed for ${submissionId}:`, err)
        
        setUploaded(prev =>
          prev.map(row =>
            row.submissionId === submissionId
              ? { 
                  ...row, 
                  extractionStatus: 'error',
                  extractionError: err instanceof Error ? err.message : 'Extraction failed'
                }
              : row
          )
        )
        
        setWorkflowFiles(prev =>
          prev.map(file =>
            file.id === submissionId
              ? { 
                  ...file, 
                  status: 'error',
                  error: err instanceof Error ? err.message : 'Extraction failed'
                }
              : file
          )
        )
        
        errorCount++
      }
    }
    
    // Show summary and transition to review step
    if (errorCount === 0) {
      setMessage(`✓ Successfully extracted ${successCount} file${successCount > 1 ? 's' : ''}`)
      setWorkflowStep('review')
    } else {
      setMessage(`Extracted ${successCount} file${successCount > 1 ? 's' : ''}, ${errorCount} failed`)
    }
  }

// Save file to Documents
const handleSaveFile = async (fileId: string) => {
  setIsSaving(true)
  try {
    // Update file status to saving
    setWorkflowFiles(prev =>
      prev.map(file =>
        file.id === fileId
          ? { ...file, status: 'saving' }
          : file
      )
    )

    // Call API to save submission
    await updateSubmissionStatus(fileId, 'saved')
    onDocumentsSaved?.(1)
    // Update file status to saved
    setWorkflowFiles(prev =>
      prev.map(file =>
        file.id === fileId
          ? { ...file, status: 'saved', savedAt: new Date().toISOString() }
          : file
      )
    )

    setMessage(`✓ Saved to Documents`)
  } catch (err) {
    console.error('Save failed:', err)
    setError(err instanceof Error ? err.message : 'Failed to save file')
    
    // Revert status on error
    setWorkflowFiles(prev =>
      prev.map(file =>
        file.id === fileId
          ? { ...file, status: 'extracted' }
          : file
      )
    )
  } finally {
    setIsSaving(false)
  }
}

  // Save all files to Documents
// Save all files to Documents
const handleSaveAll = async (fileIds: string[]) => {
  setIsSaving(true)
  try {
    // Update all files to saving status
    setWorkflowFiles(prev =>
      prev.map(file =>
        fileIds.includes(file.id)
          ? { ...file, status: 'saving' }
          : file
      )
    )

    // Call bulk save API
    const result = await bulkSaveSubmissions(fileIds)

    if (result.success) {
      // Update successfully saved files
      setWorkflowFiles(prev =>
        prev.map(file => {
          if (fileIds.includes(file.id) && !result.failed.includes(file.id)) {
            return { ...file, status: 'saved', savedAt: new Date().toISOString() }
          }
          return file
        })
      )

      // Show success message
      if (result.failed.length === 0) {
        setMessage(`✓ Saved ${result.saved_count} file${result.saved_count > 1 ? 's' : ''} to Documents`)
      } else {
        setMessage(`✓ Saved ${result.saved_count} file${result.saved_count > 1 ? 's' : ''}, ${result.failed.length} failed`)
        setError(`Failed: ${result.failed.join(', ')}`)
      }
 // Notify parent
 onDocumentsSaved?.(result.saved_count)
  
 setMessage(`✓ Saved ${result.saved_count} file${result.saved_count > 1 ? 's' : ''} to Documents`)
      // Clear workflow after successful save
      setTimeout(() => {
        setWorkflowFiles(prev => prev.filter(f => f.status !== 'saved'))
        setUploaded(prev => prev.filter(r => !fileIds.includes(r.submissionId)))
        if (workflowFiles.filter(f => f.status !== 'saved').length === 0) {
          setWorkflowStep('upload')
        }
      }, 2000)
    } else {
      throw new Error('Bulk save operation failed')
    }
  } catch (err) {
    console.error('Bulk save failed:', err)
    setError(err instanceof Error ? err.message : 'Failed to save files')
    
    // Revert files back to extracted status
    setWorkflowFiles(prev =>
      prev.map(file =>
        fileIds.includes(file.id)
          ? { ...file, status: 'extracted' }
          : file
      )
    )
  } finally {
    setIsSaving(false)
  }
}

  // Discard file from review
  const handleDiscardFile = (fileId: string) => {
    setWorkflowFiles(prev => prev.filter(file => file.id !== fileId))
    setUploaded(prev => prev.filter(row => row.submissionId !== fileId))
    
    if (workflowFiles.length === 1) {
      setWorkflowStep('upload')
    }
  }

  // Edit field in extracted data
  const handleEditField = (
    fileId: string,
    fieldPath: string,
    value: unknown
  ) => {
    setWorkflowFiles(prev =>
      prev.map(file => {
        if (file.id !== fileId || !file.extractedData) return file
  
        const pathParts = fieldPath.split('.')
  
        // Treat extractedData as a JSON object
        const newData: JSONObject = {
          ...(file.extractedData as JSONObject),
        }
  
        let current: JSONObject = newData
  
        for (let i = 0; i < pathParts.length - 1; i++) {
          const key = pathParts[i]
          const existing = current[key]
  
          // Ensure the next level is an object
          if (
            !existing ||
            typeof existing !== 'object' ||
            Array.isArray(existing)
          ) {
            current[key] = {}
          }
  
          current = current[key] as JSONObject
        }
  
        const lastKey = pathParts[pathParts.length - 1]
        current[lastKey] = value as JSONValue
  
        return {
          ...file,
          extractedData: newData,
          status: 'reviewing' as const,
        }
      })
    )
  }

  const removeFile = (submissionId: string) => {
    setUploaded((prev) => prev.filter((r) => r.submissionId !== submissionId))
    setWorkflowFiles((prev) => prev.filter((f) => f.id !== submissionId))
    if (uploaded.length === 1) {
      setWorkflowStep('upload')
    }
  }

  // Get extracted files for review
  const extractedFiles = workflowFiles.filter(f => 
    f.status === 'extracted' || f.status === 'reviewing'
  )

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Main upload/extract box */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        multiple
        accept="text/csv,.pdf,.csv,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />

      {/* Client selection + quick links */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-700 mb-2">Upload documents for</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <select
                value={selectedClient}
                disabled={loadingClients || clients.length === 0}
                onChange={(e) => onClientChange(e.target.value)}
                className="w-full sm:w-72 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              >
                {clients.length === 0 ? (
                  <option value="">No clients available</option>
                ) : (
                  clients.map((client) => (
                    <option key={client.client_id} value={client.client_id}>
                      {client.name}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={onNavigateToClients}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Manage clients
              </button>
            </div>
            {selectedClientData && (
              <p className="mt-2 text-sm text-gray-500">
                {selectedClientData.submission_count ?? selectedClientData.submissions?.length ?? 0} submissions • Last
                updated {new Date(selectedClientData.updated_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onNavigateToDocuments}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              View documents
            </button>
          </div>
        </div>
      </div>

      {/* Show upload zone when no files or on upload step */}
      {workflowStep === 'upload' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
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
                {selectedClientData ? `Upload for ${selectedClientData.name}` : 'Upload your documents'}
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
                disabled={isUploading || !canUpload}
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
              {!canUpload && (
                <p className="text-sm text-red-500 mt-2">
                  Select or create a client before uploading documents.
                </p>
              )}

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
        </div>
      )}

      {/* Extract Panel */}
      {workflowStep === 'extract' && (
        <ExtractPanel
          rows={uploaded}
          phase="extract"
          onExtractSelected={handleExtractSelected}
          onRemove={removeFile}
          onUploadMore={triggerFilePicker}
          onGoToFile={onGoToFile}
        />
      )}

      {/* Review Panel */}
      {workflowStep === 'review' && extractedFiles.length > 0 && (
        <ExtractionReviewPanel
          files={extractedFiles}
          onSaveFile={handleSaveFile}
          onSaveAll={handleSaveAll}
          onDiscardFile={handleDiscardFile}
          onEditField={handleEditField}
          isSaving={isSaving}
        />
      )}
      {/* Recent Submissions Section  */}
      <div className="mt-8">
        <RecentSubmissionsCard
          limit={5}
          onSubmissionClick={onRecentSubmissionClick}
          onViewAll={onNavigateToDocuments}
        />
      </div>
      {/* Separator */}
      {workflowStep === 'upload' && (
        <>
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
        </>
      )}
       <UnsavedChangesDialog
      isOpen={showUnsavedDialog}
      fileCount={workflowFiles.filter(f => 
        f.status === 'extracted' || f.status === 'reviewing'
      ).length}
      onSave={handleDialogSave}
      onDiscard={handleDialogDiscard}
      onCancel={handleDialogCancel}
    />
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
  onGoToFile,
}: {
  rows: UploadedRow[]
  phase: Phase
  onExtractSelected: (selectedIds: string[]) => Promise<void>
  onRemove: (submissionId: string) => void
  onUploadMore: () => void,
  onGoToFile?: (submissionId: string, filename: string) => void
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
    onView={onGoToFile} 
  />
))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
</div>
    </div>
  )
}


/* ===================== */
/*  File Toast Component */
/* ===================== */
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
  onView?: (submissionId: string, filename: string) => void
}) {
  // Determine status display
  const getStatusDisplay = () => {
    switch (row.extractionStatus) {
      case 'extracting':
        return (
          <div className="flex items-center gap-2 text-blue-600 mt-1">
            <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">
              Extracting... {row.extractionProgress || 0}%
            </span>
          </div>
        )
      
      case 'extracted':
        return (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Extracted</span>
            </div>
            {row.confidence !== undefined && (
              <ConfidenceBadgeCompact confidence={row.confidence} />
            )}
            {onView && (
              <button
                onClick={() => onView(row.submissionId, row.filename)}
                className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors ml-1"
              >
                <Eye className="w-3 h-3" />
                View
              </button>
            )}
          </div>
        )
      
      case 'error':
        return (
          <div className="flex items-center gap-2 text-red-600 mt-1">
            <X className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">
              {row.extractionError || 'Failed'}
            </span>
          </div>
        )
      
      default: // 'pending'
        return (
          <div className="flex items-center gap-2 text-gray-400 mt-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Ready to extract</span>
          </div>
        )
    }
  }

  return (
    <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
      {/* Checkbox */}
      <button
        onClick={onToggleSelect}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mt-0.5 ${
          isSelected
            ? 'bg-blue-600 border-blue-600'
            : 'border-gray-300 hover:border-blue-400'
        }`}
        disabled={row.extractionStatus === 'extracting'}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </button>

      {/* File Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {row.extractionStatus === 'extracted' ? (
          <FileText className="w-5 h-5 text-green-600" />
        ) : row.extractionStatus === 'error' ? (
          <FileText className="w-5 h-5 text-red-600" />
        ) : row.extractionStatus === 'extracting' ? (
          <FileText className="w-5 h-5 text-blue-600" />
        ) : (
          <FileText className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {row.filename}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatFileType(row.fileType)} • {formatFileSize(row.fileSize)} • {formatDate(row.uploadedAt)}
        </p>
        
        {/* Status Display */}
        {getStatusDisplay()}
      </div>

      {/* Remove Button - Hide during extraction */}
      {row.extractionStatus !== 'extracting' && (
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
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
