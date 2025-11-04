'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Download, Save, Loader2 } from 'lucide-react'
import { PdfPreview } from '@/components/PdfPreview'
import { ExtractionDataForm, type ExtractionData } from '@/components/ExtractionDataForm'
interface FileDetailViewProps {
  submissionId: string
  filename?: string
  onBack?: () => void
}

export function FileDetailView({ submissionId, filename, onBack }: FileDetailViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [extractionData, setExtractionData] = useState<ExtractionData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Simulate loading extraction data
    const timer = setTimeout(() => {
      setIsLoading(false)
      
      // Mock data for testing
      setExtractionData({
        overall_confidence: 92,
        warnings: ['Date format may need verification'],
        fields: [
          {
            field_name: 'insured_name',
            field_value: 'ABC Insurance Corp',
            confidence: 95,
            field_type: 'text',
            section: 'General Information',
            required: true,
          },
          {
            field_name: 'policy_number',
            field_value: 'POL-2024-12345',
            confidence: 98,
            field_type: 'text',
            section: 'General Information',
            required: true,
          },
          {
            field_name: 'effective_date',
            field_value: '2024-01-15',
            confidence: 88,
            field_type: 'date',
            section: 'Policy Details',
          },
          {
            field_name: 'premium_amount',
            field_value: '2500',
            confidence: 65,
            field_type: 'number',
            section: 'Policy Details',
          },
          {
            field_name: 'coverage_type',
            field_value: 'Comprehensive',
            confidence: 92,
            field_type: 'select',
            section: 'Coverage',
            options: ['Liability', 'Comprehensive', 'Collision', 'Full'],
          },
          {
            field_name: 'auto_renewal',
            field_value: true,
            confidence: 100,
            field_type: 'boolean',
            section: 'Policy Details',
          },
        ],
      })
    }, 1000)
  
    return () => clearTimeout(timer)
  }, [submissionId])

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
              <h2 className="text-xl font-bold text-gray-900">
                {filename || 'Document Details'}
              </h2>
              <p className="text-sm text-gray-500">Submission ID: {submissionId}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
              disabled
            >
              <Save className="w-4 h-4" />
              <span className="text-sm font-medium">Save</span>
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              disabled
            >
              <Download className="w-4 h-4" />
              <span className="text-sm font-medium">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Left Column: PDF Preview */}
          <div className="bg-gray-100 border-r border-gray-200 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-200 rounded-xl flex items-center justify-center mx-auto mb-4">
              <div className="bg-gray-900 border-r border-gray-700 overflow-hidden">
  <PdfPreview
    fileUrl={`/api/submissions/${submissionId}/preview`}
    filename={filename}
    onDownload={() => {
      // TODO: Implement download 
      console.log('Download clicked')
    }}
  />
</div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">PDF Preview</h3>
              <p className="text-sm text-gray-600">Preview will load here</p>
            </div>
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
        isEditable={false}
        onChange={(updatedFields) => {
          console.log('Fields updated:', updatedFields)
        }}
      />
    ) : (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-sm text-gray-600">
          Loading extraction data...
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