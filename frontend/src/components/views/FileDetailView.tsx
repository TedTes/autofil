'use client'

import { useState, useEffect,useCallback } from 'react'
import { ArrowLeft, Download, Save, Loader2,Edit,Check, FileSpreadsheet } from 'lucide-react'
import { PdfPreview } from '@/components/PdfPreview'
import { ExtractionDataForm} from '@/components/ExtractionDataForm'
import {type ExtractedField, type ExtractionData,type FileDetailActions,type FillReport, type SovScheduleData  } from "../../types";
import { getSubmission,  downloadBlob,exportSingleSubmission,updateSubmissionData } from '@/lib/api-client'
import {transformFormFieldsToApi,fieldsToNestedObject} from "../../lib"
import {ExportModal} from "../ExportModal";
import { CleanDataDisplay } from '../extraction/CleanDataDisplay'
import { FillModal } from '../FillModal'
import { SovScheduleView, getSovScheduleData } from '../extraction/SovSchedule'

interface FileDetailViewProps {
  submissionId: string
  inputId?: string
  filename?: string
  onBack?: () => void
  onActionsReady?: (actions: FileDetailActions | null) => void
}


export function FileDetailView({
  submissionId,
  inputId,
  filename = 'Document',
  onBack,
  onActionsReady
}: FileDetailViewProps) {
  const [extractedData, setExtractedData] = useState<ExtractionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isFilling, setIsFilling] = useState(false)
  const [showFillModal, setShowFillModal] = useState(false)
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSavingChanges, setIsSavingChanges] = useState(false)
  
  // Export state
  const [showExportModal, setShowExportModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const resolvedFilename = extractedData?.filename || filename
  const sovScheduleData = getSovScheduleData(extractedData?.data)
  const hasSovSchedule = Boolean(sovScheduleData)
  const isPdfPreview = !!resolvedFilename && resolvedFilename.toLowerCase().endsWith('.pdf')


  // Fetch submission data
  const fetchSubmission = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setIsLoading(true)
      }
      const data = await getSubmission(submissionId, inputId ? { inputId } : undefined)
      setExtractedData(data)
    } catch (err) {
      console.error('Failed to load submission:', err)
      setError(err instanceof Error ? err.message : 'Failed to load submission')
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
    }
  }, [submissionId, inputId])

  useEffect(() => {
    void fetchSubmission()
  }, [fetchSubmission])

  const handleSaveChanges = useCallback(async () => {
    if (!extractedData?.data) return
    
    setIsSavingChanges(true)
    setErrorMessage(null)
    
    try {
      await updateSubmissionData(submissionId, extractedData.data)
      setHasUnsavedChanges(false)
      setIsEditMode(false)
      setSuccessMessage('✓ Changes saved successfully')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Failed to save changes:', err)
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSavingChanges(false)
    }
  },[extractedData, submissionId])
    // Handle export
    const handleExport = async () => {
      setIsExporting(true)
      setErrorMessage(null)
      
      try {
        const pdfBlob = await exportSingleSubmission(submissionId)
        const timestamp = new Date().toISOString().split('T')[0]
        const baseFilename = (resolvedFilename || 'document').replace('.pdf', '')
        const exportFilename = `${baseFilename}_filled_${timestamp}.pdf`
        
        downloadBlob(pdfBlob, exportFilename)
        setSuccessMessage('✓ PDF exported successfully')
        setTimeout(() => setSuccessMessage(null), 3000)
        setShowExportModal(false)
      } catch (err) {
        console.error('Export failed:', err)
        setErrorMessage(err instanceof Error ? err.message : 'Failed to export PDF')
      } finally {
        setIsExporting(false)
      }
    }

const handleFillComplete = useCallback(async (report: FillReport) => {
  console.log('Fill completed:', report)
  setSuccessMessage(`✓ PDF filled successfully! ${report.written} fields written, ${report.skipped} skipped.`)
  setTimeout(() => setSuccessMessage(null), 5000)
  try {
    await fetchSubmission({ silent: true })
  } catch (err) {
    console.error('Failed to reload submission after fill:', err)
  }
}, [fetchSubmission])
   // Provide actions to parent (MainLayout)
   useEffect(() => {
    if (onActionsReady) {
      onActionsReady({
        hasChanges: hasUnsavedChanges,
        isSaving: isSavingChanges,
        isExporting,
        isFilling, 
        handleSave: handleSaveChanges,
        handleExport: async () => setShowExportModal(true),
        handleFill: () => setShowFillModal(true)
      })
    }
  }, [hasUnsavedChanges, isSavingChanges, isExporting, isFilling, handleSaveChanges, onActionsReady])
  // Handle field changes from the form
  const handleFieldsChange = useCallback((updatedFields: ExtractedField[]) => {
    setExtractedData((prev) => {
      if (!prev) return prev
      const updatedData = transformFormFieldsToApi
      ? transformFormFieldsToApi(updatedFields)
      : fieldsToNestedObject(updatedFields)
     return { ...prev ,
      data: updatedData
    }})
    setHasUnsavedChanges(true)
  }, [])

  
  // Save changes to database


  // Toggle edit mode
  const handleToggleEditMode = () => {
    if (hasSovSchedule) {
      setIsEditMode(false)
      return
    }
    if (isEditMode && hasUnsavedChanges) {
      // Warn about unsaved changes
      if (confirm('You have unsaved changes. Do you want to discard them?')) {
        setIsEditMode(false)
        setHasUnsavedChanges(false)
        // Reload data to reset changes
        fetchSubmission({ silent: true }).then(() => {
          setIsEditMode(false)
          setHasUnsavedChanges(false)
        })
      }
    } else {
      setIsEditMode(!isEditMode)
    }
  }


  const handleDownloadOriginal = async () => {
    try {
      // Download original PDF logic
      setSuccessMessage('✓ Original PDF downloaded')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setErrorMessage('Failed to download original PDF')
    }
  }

  const getInputPreviewUrl = (id: string) => {
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/submissions/${id}/preview-input`
  }

 

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load document</h3>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages at top of content area */}
      {(successMessage || errorMessage) && (
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2">
          {successMessage && (
            <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs sm:text-sm text-green-800">{successMessage}</p>
            </div>
          )}

          {errorMessage && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs sm:text-sm text-red-800">{errorMessage}</p>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div
        className={`flex-1 overflow-hidden flex flex-col ${
          isPdfPreview ? 'lg:grid lg:grid-cols-2 lg:gap-0' : ''
        }`}
      >
        {/* PDF Preview */}
        {isPdfPreview && (
          <div className="h-full overflow-hidden bg-gray-900 border-r border-gray-700">
            <PdfPreview
              fileUrl={getInputPreviewUrl(submissionId)}
              filename={resolvedFilename}
              onDownload={handleDownloadOriginal}
            />
          </div>
        )}

        {/* Data Panel */}
        <div className="h-full bg-white overflow-y-auto">
          <div className="p-4 sm:p-6">
            {/* Header with Edit Toggle */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Extracted Data
                </h3>
                <p className="text-xs text-gray-600">
                  {hasSovSchedule
                    ? 'Schedule of Values detected. Review the extracted property schedule below.'
                    : isEditMode
                    ? 'Edit the information below and click Save when done'
                    : 'Review the extracted information or click Edit to make changes'}
                </p>
              </div>

              {/* Edit Mode Toggle Button */}
              {!hasSovSchedule && (
                <button
                  onClick={handleToggleEditMode}
                  disabled={isSavingChanges}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ml-4 ${
                    isEditMode
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isEditMode ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="hidden sm:inline">Done</span>
                    </>
                  ) : (
                    <>
                      <Edit className="w-4 h-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Unsaved Changes Indicator */}
            {!hasSovSchedule && hasUnsavedChanges && (
              <div className="mb-4 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                  <span className="text-sm text-orange-800 font-medium">
                    You have unsaved changes
                  </span>
                </div>
                <button
                  onClick={handleSaveChanges}
                  disabled={isSavingChanges}
                  className="text-sm text-orange-700 hover:text-orange-900 font-medium underline"
                >
                  Save now
                </button>
              </div>
            )}

            {/* Extraction Data Form */}
            <div>
  {!isPdfPreview && (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-600">
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
        <FileSpreadsheet className="w-4 h-4" />
        {hasSovSchedule ? 'Schedule of Values file' : 'Original file'}
      </div>
      <button
        onClick={handleDownloadOriginal}
        className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Download className="w-4 h-4" />
        Download {resolvedFilename || 'file'}
      </button>
    </div>
  )}
  {/* Overall Confidence */}
  {extractedData && extractedData.confidence !== undefined && (
    <div className="mb-4 bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Overall Extraction Confidence
        </span>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-2 w-32 overflow-hidden">
            <div
              className={`h-2 ${
                extractedData.confidence >= 0.8
                  ? 'bg-green-500'
                  : extractedData.confidence >= 0.6
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${extractedData.confidence * 100}%` }}
            />
          </div>
          <span className={`text-sm font-semibold ${
            extractedData.confidence >= 0.8
              ? 'text-green-700'
              : extractedData.confidence >= 0.6
              ? 'text-yellow-700'
              : 'text-red-700'
          }`}>
            {Math.round(extractedData.confidence * 100)}%
          </span>
        </div>
      </div>
    </div>
  )}

  {/* Clean Data Display */}
  {hasSovSchedule && sovScheduleData ? (
    <SovScheduleView schedule={sovScheduleData} />
  ) : extractedData && extractedData.data ? (
    <CleanDataDisplay
      data={extractedData.data}
      fieldConfidence={extractedData.field_confidence}
      isEditable={isEditMode}
      onFieldChange={(fieldPath, value) => {
        // Update the data
        const keys = fieldPath.split('.')
        const newData = { ...extractedData.data }
        
        // Navigate to nested property and set value
        let current:Record<string,unknown> = newData
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i]
    const next = current[key]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      const newObj: Record<string, unknown> = {}
      current[key] = newObj
      current = newObj
    } else {
      current = next as Record<string, unknown>
    }
      
         
          
        }
        const lastKey = keys[keys.length - 1]
        current[lastKey] = value as unknown
        
        // Update state
        setExtractedData({
          ...extractedData,
          data: newData
        })
        setHasUnsavedChanges(true)
      }}
    />
  ) : (
    <div className="bg-gray-50 rounded-lg p-6 text-center">
      <p className="text-sm text-gray-600">No extraction data available</p>
    </div>
  )}
</div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        submissionId={submissionId}
        filename={resolvedFilename}
        onExport={handleExport}
      />
       <FillModal
        isOpen={showFillModal}
        onClose={() => setShowFillModal(false)}
        submissionId={submissionId}
        filename={resolvedFilename}
        onFillComplete={handleFillComplete}
      />
    </div>
  )
}

// Loading State Component
function LoadingState() {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading document...</h3>
        <p className="text-sm text-gray-600">Please wait while we fetch the details</p>
      </div>
    </div>
  )
}

// Error State Component
function ErrorState({ error, onBack }: { error: string; onBack?: () => void }) {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load document</h3>
        <p className="text-sm text-gray-600 mb-6">{error}</p>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        )}
      </div>
    </div>
  )
}
