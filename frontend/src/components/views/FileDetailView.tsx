'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Download, Save, Loader2 } from 'lucide-react'
import { PdfPreview } from '@/components/PdfPreview'
import { ExtractionDataForm} from '@/components/ExtractionDataForm'
import {type ExtractedField, type ExtractionData } from "../../types";
import { ConfidenceBadge } from '@/components/ConfidenceBadge'
import { getSubmission, getInputPreviewUrl,updateSubmission ,exportFilledPdf, downloadBlob } from '@/lib/api-client'
import {transformApiFieldsToForm,transformFormFieldsToApi,fieldsToNestedObject} from "../../lib";
import {ExportModal} from "../ExportModal";
interface FileDetailViewProps {
  submissionId: string
  filename?: string
  onBack?: () => void
}

export function FileDetailView({ submissionId, filename, onBack }: FileDetailViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [extractionData, setExtractionData] = useState<ExtractionData | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  // Fetch submission data
  useEffect(() => {
    fetchSubmissionData()
  }, [submissionId])

  const showSuccessMessage = (message: string) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(null), 3000)
  }
  
  const showErrorMessage = (message: string) => {
    setErrorMessage(message)
    setTimeout(() => setErrorMessage(null), 5000)
  }

  const fetchSubmissionData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const submission = await getSubmission(submissionId)
      setExtractionData({
        submission_id: submission.submission_id,
        filename: submission.filename,
        status: submission.status,
        uploaded_at:submission.uploaded_at,
        data: submission.data || {},                         
        field_confidence: submission.field_confidence,  
        confidence: submission.confidence,  
        warnings: submission.warnings,   
        field_hints: submission.field_hints,
        extraction_issues: submission.extraction_issues
      })
    } catch (err) {
      console.error('Failed to fetch submission:', err)
      setError(err instanceof Error ? err.message : 'Failed to load document')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFieldsChange = (updatedFields: ExtractedField[]) => {
    if (!extractionData) return
    const updatedData = fieldsToNestedObject(updatedFields)

    setExtractionData({
      ...extractionData,
      data:updatedData,
    })
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!extractionData || !hasChanges) return
  
    setIsSaving(true)
    setError(null)
  
    try {
  
      const result = await updateSubmission(submissionId, extractionData.data ?? {})
      
      if (result.success) {
        setHasChanges(false)
        showSuccessMessage('Changes saved successfully!')
      } else {
        throw new Error(result.message || 'Save failed')
      }
    } catch (err) {
      console.error('Failed to save:', err)
      showErrorMessage(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    // Check if there are unsaved changes
    if (hasChanges) {
      const shouldSave = confirm(
        'You have unsaved changes. Would you like to save them before exporting?'
      )
      if (shouldSave) {
        await handleSave()
        // Wait a bit for save to complete
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  
    setIsExporting(true)
    setError(null)
  
    try {
      // Call API to generate filled PDF
      const pdfBlob = await exportFilledPdf(submissionId)
  
      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0]
      const baseFilename = filename?.replace('.pdf', '') || 'document'
      const exportFilename = `${baseFilename}_filled_${timestamp}.pdf`
  
      // Download the PDF
      downloadBlob(pdfBlob, exportFilename)
  
      showSuccessMessage('PDF exported successfully!')
    } catch (err) {
      console.error('Failed to export:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to export PDF'
      showErrorMessage(errorMessage)
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownloadOriginal = () => {
    // Download the original uploaded PDF
    const url = getInputPreviewUrl(submissionId)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || 'document.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState error={error} onBack={onBack} />
  }

  return (
    <div className="h-full flex flex-col">
  {/* Header - Mobile Responsive */}
<div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
      {onBack && (
        <button
          onClick={onBack}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
            {filename || 'Document Details'}
          </h2>
          {extractionData?.confidence !== undefined && (
            <ConfidenceBadge
              confidence={extractionData.confidence}
              variant="pill"
              showLabel={false}
              size="sm"
            />
          )}
        </div>
        <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">
          ID: {submissionId}
        </p>
      </div>
    </div>

    {/* Action Buttons - Mobile Optimized */}
    <div className="flex items-center gap-2 self-end sm:self-auto">
      <button
        onClick={handleSave}
        disabled={!hasChanges || isSaving}
        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
          hasChanges && !isSaving
            ? 'text-white bg-blue-600 hover:bg-blue-700'
            : 'text-gray-400 bg-gray-100 cursor-not-allowed'
        }`}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
            <span className="hidden sm:inline">Saving...</span>
          </>
        ) : (
          <>
            <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Save</span>
          </>
        )}
      </button>
      <button
        onClick={handleExport}
        disabled={isExporting}
        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
          isExporting
            ? 'text-white bg-green-500 cursor-not-allowed'
            : 'text-white bg-green-600 hover:bg-green-700'
        }`}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
            <span className="hidden sm:inline">Exporting...</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Export</span>
          </>
        )}
      </button>
    </div>
  </div>

        {/* Changes indicator */}
     {/* Messages - Mobile Optimized */}
  {hasChanges && (
    <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <p className="text-xs sm:text-sm text-yellow-800">
        You have unsaved changes
      </p>
      <button
        onClick={() => {
          if (confirm('Discard unsaved changes?')) {
            fetchSubmissionData()
            setHasChanges(false)
          }
        }}
        className="text-xs sm:text-sm text-yellow-800 hover:text-yellow-900 underline self-start sm:self-auto"
      >
        Discard
      </button>
    </div>
  )}
  
  {successMessage && (
    <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <p className="text-xs sm:text-sm text-green-800">{successMessage}</p>
    </div>
  )}

  {errorMessage && (
    <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs sm:text-sm text-red-800">{errorMessage}</p>
    </div>
  )}
</div>

      {/* Main Content - Two Column Layout */}
    {/* Main Content - Mobile: Stack Vertically, Desktop: Side by Side */}
<div className="flex-1 overflow-hidden flex flex-col lg:grid lg:grid-cols-2 lg:gap-0">
  {/* PDF Preview - Hidden on mobile by default, toggle button to show */}
  <div className="hidden lg:block bg-gray-900 border-r border-gray-700 overflow-hidden lg:col-span-1">
    <PdfPreview
      fileUrl={getInputPreviewUrl(submissionId)}
      filename={filename}
      onDownload={handleDownloadOriginal}
    />
  </div>

  {/* Extracted Data - Full height on mobile */}
  <div className="flex-1 bg-white overflow-y-auto lg:col-span-1">
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Extracted Data</h3>
        <p className="text-xs sm:text-sm text-gray-600">
          Review and edit the extracted information below
        </p>
      </div>

      {extractionData ? (
          <ExtractionDataForm
          data={{
            submission_id: extractionData.submission_id,
            filename: extractionData.filename,
            status: extractionData.status,
            uploaded_at: extractionData.uploaded_at,
            data: extractionData.data || {},                         
            field_confidence: extractionData.field_confidence,  
            confidence: extractionData.confidence,  
            warnings: extractionData.warnings,   
            field_hints: extractionData.field_hints,
            extraction_issues: extractionData.extraction_issues
          }}
          isEditable={true}
          onChange={handleFieldsChange}
        />
      ) : (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-600">
            No extraction data available
          </p>
        </div>
      )}
    </div>
  </div>
</div>
      <ExportModal
  isOpen={showExportModal}
  onClose={() => setShowExportModal(false)}
  submissionId={submissionId}
  filename={filename}
  onExport={handleExport}
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