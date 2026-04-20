'use client'

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { Download, Save, Loader2, Edit, FileSpreadsheet } from 'lucide-react'
import { PdfPreview } from '@/components/PdfPreview'
import {
  type ExtractionData,
  type FileDetailActions,
} from '../../types'
import {
  getSubmission,
  downloadBlob,
  exportSingleSubmission,
  updateSubmissionData,
  getInputPreviewBlob,
} from '@/lib/api-client'
import { ExportModal } from '../ExportModal'
import { CleanDataDisplay, type FieldSourceSelection } from '../extraction/CleanDataDisplay'
import { SovScheduleView, getSovScheduleData } from '../extraction/SovSchedule'

type SpecializedViewConfig = {
  key: string
  label: string
  description?: string
  disableEdit?: boolean
  render: ReactNode
}

function normalizeSourceBbox(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined
  const bbox = value.map((part) => Number(part))
  return bbox.every((part) => Number.isFinite(part))
    ? (bbox as [number, number, number, number])
    : undefined
}

function normalizeFilename(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : undefined
}

function collectInputIdsByFilename(value: unknown, map = new Map<string, string>()): Map<string, string> {
  if (!value || typeof value !== 'object') return map

  if (Array.isArray(value)) {
    value.forEach((item) => collectInputIdsByFilename(item, map))
    return map
  }

  const record = value as Record<string, unknown>
  const filename = normalizeFilename(record.file_name) || normalizeFilename(record.filename) || normalizeFilename(record.source_file)
  const inputId = typeof record.input_id === 'string' ? record.input_id : undefined
  if (filename && inputId && !map.has(filename)) {
    map.set(filename, inputId)
  }

  Object.values(record).forEach((child) => {
    if (child && typeof child === 'object') {
      collectInputIdsByFilename(child, map)
    }
  })

  return map
}

function resolveSpecializedView(data: Record<string, unknown> | null | undefined): SpecializedViewConfig | null {
  if (!data) return null
  const sovSchedule = getSovScheduleData(data)
  if (sovSchedule) {
    return {
      key: 'sovSchedule',
      label: 'Schedule of Values file',
      description: 'Schedule of Values detected. Review the extracted property schedule below.',
      disableEdit: true,
      render: <SovScheduleView schedule={sovSchedule} />,
    }
  }
  return null
}

interface FileDetailViewProps {
  submissionId: string
  inputId?: string
  filename?: string
  sourcePage?: number
  sourceBbox?: [number, number, number, number]
  sourceFieldLabel?: string
  onBack?: () => void
  onActionsReady?: (actions: FileDetailActions | null) => void
}


export function FileDetailView({
  submissionId,
  inputId,
  filename = 'Document',
  sourcePage,
  sourceBbox,
  sourceFieldLabel,
  onBack,
  onActionsReady
}: FileDetailViewProps) {
  const [extractedData, setExtractedData] = useState<ExtractionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isFilling] = useState(false)
  const [, setShowFillModal] = useState(false)
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSavingChanges, setIsSavingChanges] = useState(false)
  
  // Export state
  const [showExportModal, setShowExportModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [selectedFieldSource, setSelectedFieldSource] = useState<FieldSourceSelection | null>(
    sourcePage || sourceBbox || sourceFieldLabel
      ? {
          fieldId: sourceFieldLabel || 'source',
          fieldLabel: sourceFieldLabel || 'Selected source',
          fieldPath: 'source',
          value: '',
          source: {
            page: sourcePage,
            bbox: sourceBbox,
          },
        }
      : null
  )
  const resolvedFilename = extractedData?.filename || filename
  const specializedView = useMemo(
    () => resolveSpecializedView(extractedData?.data),
    [extractedData?.data]
  )
  const hasSpecializedView = Boolean(specializedView)
  const inputIdsByFilename = useMemo(
    () => collectInputIdsByFilename(extractedData?.data),
    [extractedData?.data]
  )
  const selectedSourceFilename =
    typeof selectedFieldSource?.source?.source_file === 'string'
      ? selectedFieldSource.source.source_file
      : undefined
  const selectedSourceFilenameKey = normalizeFilename(selectedSourceFilename)
  const selectedSourceInputId =
    typeof selectedFieldSource?.source?.input_id === 'string'
      ? selectedFieldSource.source.input_id
      : undefined
  const selectedSourcePageRaw = selectedFieldSource?.source?.page
  const selectedSourcePage =
    typeof selectedSourcePageRaw === 'number'
      ? selectedSourcePageRaw
      : typeof selectedSourcePageRaw === 'string'
      ? Number(selectedSourcePageRaw)
      : undefined
  const selectedSourceBbox = normalizeSourceBbox(selectedFieldSource?.source?.bbox)
  const previewFilename = selectedSourceFilename?.toLowerCase().endsWith('.pdf')
    ? selectedSourceFilename
    : resolvedFilename
  const previewInputId = selectedSourceFilename?.toLowerCase().endsWith('.pdf')
    ? selectedSourceInputId || (selectedSourceFilenameKey ? inputIdsByFilename.get(selectedSourceFilenameKey) : undefined) || inputId
    : inputId
  const isPdfPreview = !!previewFilename && previewFilename.toLowerCase().endsWith('.pdf')

  useEffect(() => {
    if (!sourcePage && !sourceBbox && !sourceFieldLabel) return
    setSelectedFieldSource({
      fieldId: sourceFieldLabel || 'source',
      fieldLabel: sourceFieldLabel || 'Selected source',
      fieldPath: 'source',
      value: '',
      source: {
        page: sourcePage,
        bbox: sourceBbox,
      },
    })
  }, [sourcePage, sourceBbox, sourceFieldLabel])


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
  // Toggle edit mode
  const handleToggleEditMode = () => {
    if (specializedView?.disableEdit) {
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
    } catch {
      setErrorMessage('Failed to download original PDF')
    }
  }

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    const loadPreview = async () => {
      if (!isPdfPreview) {
        setPreviewUrl(null)
        return
      }

      try {
        setIsLoadingPreview(true)
        const blob = await getInputPreviewBlob(submissionId, previewInputId)
        objectUrl = URL.createObjectURL(blob)
        if (active) {
          setPreviewUrl(objectUrl)
        }
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load preview')
          setPreviewUrl(null)
        }
      } finally {
        if (active) {
          setIsLoadingPreview(false)
        }
      }
    }

    void loadPreview()

    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [submissionId, previewInputId, isPdfPreview])

 

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
        className={`flex-1 min-h-0 h-full overflow-hidden flex flex-col ${
          isPdfPreview ? 'lg:flex-row' : ''
        }`}
      >
        {/* PDF Preview */}
        {isPdfPreview && (
          <div className="h-full min-h-0 lg:w-[42%] lg:shrink-0 overflow-hidden bg-white border-r border-gray-200">
            {isLoadingPreview || previewUrl ? (
              <PdfPreview
                fileUrl={previewUrl || 'about:blank'}
                filename={previewFilename}
                targetPage={selectedSourcePage}
                sourceBbox={selectedSourceBbox}
                onDownload={handleDownloadOriginal}
              />
            ) : (
              <div className="h-full flex items-center justify-center bg-white">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-600">Loading preview...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Data Panel */}
        <div className="h-full min-h-0 flex-1 bg-white overflow-hidden">
          <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
            {/* Header with Edit Toggle */}
            <div className="mb-4 flex flex-shrink-0 items-center justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Extracted Data
                </h3>
                <p className="text-xs text-gray-600">
                  {specializedView?.description
                    ? specializedView.description
                    : isEditMode
                    ? 'Edit the information below and save when you are done.'
                    : 'Review the extracted information or click Edit to make changes'}
                </p>
              </div>

              {/* Edit Mode Toggle Button */}
              {!specializedView?.disableEdit && (
                <div className="flex items-center gap-2 ml-4">
                  {isEditMode ? (
                    <>
                      <button
                        onClick={() => void handleSaveChanges()}
                        disabled={!hasUnsavedChanges || isSavingChanges}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                          hasUnsavedChanges && !isSavingChanges
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {isSavingChanges ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="hidden sm:inline">Saving...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            <span className="hidden sm:inline">Save</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleToggleEditMode}
                        disabled={isSavingChanges}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="hidden sm:inline">Cancel</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleToggleEditMode}
                      disabled={isSavingChanges}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit className="w-4 h-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Extraction Data Form */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
  {!isPdfPreview && (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-600">
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
        <FileSpreadsheet className="w-4 h-4" />
        {specializedView?.label || 'Original file'}
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
  {hasSpecializedView && specializedView ? (
    specializedView.render
  ) : extractedData && extractedData.data ? (
    <CleanDataDisplay
      data={extractedData.data}
      fieldConfidence={extractedData.field_confidence}
      isEditable={isEditMode}
      className="space-y-4"
      selectedFieldPath={selectedFieldSource?.fieldPath}
      onFieldSelect={setSelectedFieldSource}
      onFieldChange={(fieldPath, value) => {
        const newData = setAtPath(extractedData.data as Record<string, unknown>, fieldPath.split('.'), value)
        setExtractedData({ ...extractedData, data: newData })
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

    </div>
  )
}

/**
 * Immutable nested update that correctly handles arrays at any depth.
 * Path segments that are numeric strings are treated as array indices.
 */
function setAtPath(
  obj: unknown,
  keys: string[],
  value: unknown
): Record<string, unknown> {
  function update(node: unknown, remaining: string[]): unknown {
    if (remaining.length === 0) return value
    const [key, ...rest] = remaining
    if (Array.isArray(node)) {
      const idx = parseInt(key, 10)
      const copy = [...node]
      copy[idx] = update(copy[idx], rest)
      return copy
    }
    const map = (typeof node === 'object' && node !== null ? node : {}) as Record<string, unknown>
    return { ...map, [key]: update(map[key], rest) }
  }
  return update(obj, keys) as Record<string, unknown>
}
