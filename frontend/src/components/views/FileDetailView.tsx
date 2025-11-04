'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Download, Save, Loader2 } from 'lucide-react'
import { PdfPreview } from '@/components/PdfPreview'
import { ExtractionDataForm, type ExtractionData } from '@/components/ExtractionDataForm'
import {type ExtractedField} from "../../types";
import { ConfidenceBadge } from '@/components/ConfidenceBadge'
import { getSubmission, getInputPreviewUrl,updateSubmission } from '@/lib/api-client'
import {transformApiFieldsToForm,transformFormFieldsToApi} from "../../lib";

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
      const data = await getSubmission(submissionId)
      
      // Transform API response to ExtractionData format
      const transformedData: ExtractionData = {
        overall_confidence: data.confidence || 0,
        warnings: data.warnings || [],
        fields: transformApiFieldsToForm(data.data || {}),
      }

      setExtractionData(transformedData)
    } catch (err) {
      console.error('Failed to fetch submission:', err)
      setError(err instanceof Error ? err.message : 'Failed to load document')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFieldsChange = (updatedFields: ExtractedField[]) => {
    if (!extractionData) return

    setExtractionData({
      ...extractionData,
      fields: updatedFields,
    })
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!extractionData || !hasChanges) return
  
    setIsSaving(true)
    setError(null)
  
    try {
      // Transform fields back to API format
      const updatedData = transformFormFieldsToApi(extractionData.fields)
  
      // Call API to update submission
      const result = await updateSubmission(submissionId, updatedData)
  
      if (result.success) {
        setHasChanges(false)
        showSuccessMessage('Changes saved successfully!')
        
        // Optionally refetch to get server-side updates
        // await fetchSubmissionData()
      } else {
        throw new Error(result.message || 'Save failed')
      }
    } catch (err) {
      console.error('Failed to save:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to save changes'
      showErrorMessage(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    try {
      // TODO: Implement export in next commit
      console.log('Exporting PDF...')
      alert('Export functionality coming in next commit!')
    } catch (err) {
      console.error('Failed to export:', err)
      alert('Failed to export PDF')
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
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">
                  {filename || 'Document Details'}
                </h2>
                {extractionData?.overall_confidence !== undefined && (
                  <ConfidenceBadge
                    confidence={extractionData.overall_confidence}
                    variant="pill"
                    showLabel={true}
                  />
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">Submission ID: {submissionId}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                hasChanges && !isSaving
                  ? 'text-white bg-blue-600 hover:bg-blue-700'
                  : 'text-gray-400 bg-gray-100 cursor-not-allowed'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Changes indicator */}
        {hasChanges && (
          <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
            <p className="text-sm text-yellow-800">
              You have unsaved changes
            </p>
            <button
              onClick={() => {
                if (confirm('Discard unsaved changes?')) {
                  fetchSubmissionData()
                  setHasChanges(false)
                }
              }}
              className="text-sm text-yellow-800 hover:text-yellow-900 underline"
            >
              Discard
            </button>
          </div>
        )}
        {/* Success message */}
{successMessage && (
  <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
    <p className="text-sm text-green-800">{successMessage}</p>
  </div>
)}

{/* Error message */}
{errorMessage && (
  <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p className="text-sm text-red-800">{errorMessage}</p>
  </div>
)}
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Left Column: PDF Preview */}
          <div className="bg-gray-900 border-r border-gray-700 overflow-hidden">
            <PdfPreview
              fileUrl={getInputPreviewUrl(submissionId)}
              filename={filename}
              onDownload={handleDownloadOriginal}
            />
          </div>

          {/* Right Column: Extracted Data */}
          <div className="bg-white overflow-y-auto">
            <div className="p-8">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Extracted Data</h3>
                <p className="text-sm text-gray-600">
                  Review and edit the extracted information below
                </p>
              </div>

              {extractionData ? (
                <ExtractionDataForm
                  data={extractionData}
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
      </div>
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