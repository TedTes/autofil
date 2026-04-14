'use client'

import React, { useMemo, useState } from 'react'
import {
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Download,
  Check,
} from 'lucide-react'
import type { 
  OutputTemplate, 
  MergedData 
} from '@/types'
import type { 
  TemplateFillResult, 
  MultipleFillResults 
} from '@/types'

import { calculateTemplateReadiness } from '@/lib/merged-data'
import { fillMultipleTemplates } from '@/lib/api-client'
import { safeMessage, safeNumber, safeStringField } from '@/lib/format-utils'
import TemplateFillStatusCard from './TemplateFillStatusCard'

function humanizeTemplateId(templateId: string): string {
  const normalized = templateId.replace(/[_-]+/g, ' ').trim()
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

function getTemplateDisplayName(template: Pick<OutputTemplate, 'id' | 'name' | 'formType' | 'version'>): string {
  const name = template.name?.trim()
  if (name && name !== template.id && !/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(name)) {
    return name
  }

  const formLabel = template.formType?.replace(/_/g, ' ') || humanizeTemplateId(template.id)
  const versionLabel = template.version ? ` (${template.version.replace(/_/g, '/')})` : ''
  return `${formLabel}${versionLabel}`.trim()
}

type LowConfidenceField = {
  fieldId: string
  label: string
  confidence: number
}

type GenerationWarningSummary = {
  lowConfidenceFields: LowConfidenceField[]
  missingRequiredSections: string[]
  affectedTemplateNames: string[]
}

function findLowConfidenceFields(mergedData: MergedData | null, threshold = 0.8): LowConfidenceField[] {
  if (!mergedData?.semantic_sections?.length) return []

  const fields: LowConfidenceField[] = []
  for (const section of mergedData.semantic_sections) {
    for (const field of section.fields || []) {
      const values = field.values || []
      const confidences = values
        .map((value) => value.confidence)
        .filter((confidence): confidence is number => typeof confidence === 'number')
      if (!confidences.length) continue

      const lowestConfidence = Math.min(...confidences)
      const hasUsableValue = values.some(
        (value) => value.value !== null && value.value !== undefined && value.value !== ''
      )
      if (hasUsableValue && lowestConfidence < threshold) {
        fields.push({
          fieldId: field.id,
          label: field.label || humanizeTemplateId(field.id),
          confidence: lowestConfidence,
        })
      }
    }
  }

  return fields.sort((a, b) => a.confidence - b.confidence)
}

interface GenerateOutputsModalProps {
  isOpen: boolean
  onClose: () => void
  submissionId: string // NEW: Required for API calls
  availableTemplates: OutputTemplate[]
  selectedTemplateIds: string[]
  onToggleTemplate: (templateId: string) => void
  onSelectAllTemplates: () => void
  onDeselectAllTemplates: () => void
  mergedData: MergedData | null
  inputIds?: string[] // NEW: Optional input file IDs
}

export default function GenerateOutputsModal({
  isOpen,
  onClose,
  submissionId,
  availableTemplates,
  selectedTemplateIds,
  onToggleTemplate,
  onSelectAllTemplates,
  onDeselectAllTemplates,
  mergedData,
  inputIds,
}: GenerateOutputsModalProps) {
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [templateResults, setTemplateResults] = useState<TemplateFillResult[]>([])
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [batchResults, setBatchResults] = useState<MultipleFillResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedTemplates = useMemo(
    () =>
      availableTemplates
        .filter(t => selectedTemplateIds.includes(t.id))
        .map(t => ({
          id: t.id,
          name: getTemplateDisplayName(t),
        })),
    [availableTemplates, selectedTemplateIds]
  )

  const estimateMergedFieldCount = useMemo(() => {
    if (!mergedData?.semantic_sections?.length) return 0
    return mergedData.semantic_sections.reduce((count, section) => {
      const sectionFields = Array.isArray(section.fields) ? section.fields : []
      return count + sectionFields.filter((field) =>
        Array.isArray(field.values) && field.values.some((value) =>
          value.value !== null && value.value !== undefined && value.value !== ''
        )
      ).length
    }, 0)
  }, [mergedData])
  
  // Calculate availability for each template
  const templateAvailabilities = useMemo(() => {
    return availableTemplates.map(template => {
      const readiness = calculateTemplateReadiness(
        template.requiredDataSections,
        template.optionalDataSections || [],
        mergedData
      )
      
      const baseEstimatedFields =
        template.estimatedFields > 0 ? template.estimatedFields : estimateMergedFieldCount

      return {
        template,
        ...readiness,
        estimatedFields: Math.round((baseEstimatedFields * readiness.completeness) / 100),
        totalTemplateFields: baseEstimatedFields,
      }
    })
  }, [availableTemplates, estimateMergedFieldCount, mergedData])
  
  const availableOnly = templateAvailabilities.filter(t => t.canGenerate)
  const unavailableOnly = templateAvailabilities.filter(t => !t.canGenerate)
  const selectedCount = selectedTemplateIds.length
  const generationWarnings = useMemo<GenerationWarningSummary>(() => {
    const selectedAvailability = templateAvailabilities.filter(({ template }) =>
      selectedTemplateIds.includes(template.id)
    )
    const missingRequiredSections = Array.from(
      new Set(selectedAvailability.flatMap((item) => item.missingRequired))
    ).map(humanizeTemplateId)
    const affectedTemplateNames = selectedAvailability
      .filter((item) => item.missingRequired.length > 0)
      .map(({ template }) => getTemplateDisplayName(template))

    return {
      lowConfidenceFields: findLowConfidenceFields(mergedData),
      missingRequiredSections,
      affectedTemplateNames,
    }
  }, [mergedData, selectedTemplateIds, templateAvailabilities])
  
  // Handle generate click
  const handleGenerate = async () => {
    if (selectedTemplates.length === 0) return
    
    setIsGenerating(true)
    setError(null)
    setTemplateResults([])
    setActiveTemplateId(null)
    setBatchResults(null)
    
    try {
      // Call sequential fill orchestrator
      const results = await fillMultipleTemplates(
        submissionId,
        selectedTemplates,
        {
          inputIds,
          onTemplateStart: (templateId) => {
            setActiveTemplateId(templateId)
          },
          onProgress: (current, total, result) => {
            // Update results array
            setTemplateResults(prev => {
              const index = prev.findIndex(r => r.template_id === result.template_id)
              if (index >= 0) {
                const updated = [...prev]
                updated[index] = result
                return updated
              }
              return [...prev, result]
            })
          },
          onTemplateComplete: () => {
            setActiveTemplateId(null)
          }
        }
      )
      
      // Store final batch results
      setBatchResults(results)
      setIsGenerating(false)
      
    } catch (err) {
      console.error('Generation failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate documents')
      setIsGenerating(false)
    }
  }
  
  // Handle download
  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }
  
  // Reset and close
  const handleClose = () => {
    if (!isGenerating) {
      setTemplateResults([])
      setBatchResults(null)
      setError(null)
      setActiveTemplateId(null)
      onClose()
    }
  }
  
  if (!isOpen) return null
  
  // Show success/results state
  if (batchResults && !isGenerating) {
    return (
      <ModalOverlay onClose={handleClose}>
        <ModalContent onClose={handleClose} isWide={true}>  {/* Add isWide */}
          <ResultsView 
            results={batchResults}
            templateResults={templateResults}
            onClose={handleClose}
            onDownload={handleDownload}
          />
        </ModalContent>
      </ModalOverlay>
    )
  }
  
  // Show generation progress
  if (isGenerating) {
    return (
      <ModalOverlay>
        <ModalContent>
          <TemplateProgressView
            templateResults={templateResults}
            activeTemplateId={activeTemplateId}
            selectedCount={selectedTemplates.length}
            onDownload={handleDownload}
          />
        </ModalContent>
      </ModalOverlay>
    )
  }
  
  // Show selection state
  return (
    <ModalOverlay onClose={handleClose}>
      <ModalContent onClose={handleClose}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Generate Documents
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Select templates to fill with your merged data
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Body */}
        <div className="px-6 py-4 max-h-[65vh] overflow-y-auto">
          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Generation Failed</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {selectedCount > 0 &&
            (generationWarnings.lowConfidenceFields.length > 0 ||
              generationWarnings.missingRequiredSections.length > 0) && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900">
                    Review recommended before generating
                  </p>
                  {generationWarnings.missingRequiredSections.length > 0 && (
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      Missing required data: {generationWarnings.missingRequiredSections.join(', ')}
                      {generationWarnings.affectedTemplateNames.length > 0
                        ? ` for ${generationWarnings.affectedTemplateNames.join(', ')}.`
                        : '.'}
                    </p>
                  )}
                  {generationWarnings.lowConfidenceFields.length > 0 && (
                    <>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        {generationWarnings.lowConfidenceFields.length} extracted field
                        {generationWarnings.lowConfidenceFields.length !== 1 ? 's' : ''} in merged data are below 80%
                        confidence.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {generationWarnings.lowConfidenceFields.slice(0, 5).map((field) => (
                          <span
                            key={field.fieldId}
                            className="rounded-full bg-white px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
                          >
                            {field.label}: {Math.round(field.confidence * 100)}%
                          </span>
                        ))}
                        {generationWarnings.lowConfidenceFields.length > 5 && (
                          <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                            +{generationWarnings.lowConfidenceFields.length - 5} more
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Available Templates */}
          {availableOnly.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Available Templates
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedCount} of {availableOnly.length} selected
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onSelectAllTemplates}
                    className="text-xs px-2.5 py-1.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={onDeselectAllTemplates}
                    className="text-xs px-2.5 py-1.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              {availableOnly.map(({ template, completeness, estimatedFields, totalTemplateFields }) => (
                <TemplateSelectionCard
                  key={template.id}
                  template={template}
                  completeness={completeness}
                  estimatedFields={estimatedFields}
                  totalTemplateFields={totalTemplateFields}
                  isSelected={selectedTemplateIds.includes(template.id)}
                  onToggle={() => onToggleTemplate(template.id)}
                />
              ))}
            </div>
          )}
          
          {/* Unavailable Templates */}
          {unavailableOnly.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-gray-500">
                Unavailable Templates
              </h3>
              {unavailableOnly.map(({ template, completeness, missingRequired, totalTemplateFields }) => (
                <TemplateSelectionCard
                  key={template.id}
                  template={template}
                  completeness={completeness}
                  estimatedFields={0}
                  totalTemplateFields={totalTemplateFields}
                  isSelected={false}
                  onToggle={() => {}}
                  disabled
                  warning={`Missing: ${missingRequired.join(', ')}`}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            {selectedCount > 0 ? 'Cancel' : 'Close'}
          </button>
          {selectedCount > 0 && (
            <button
              onClick={handleGenerate}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Generate {selectedCount} Document{selectedCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </ModalContent>
    </ModalOverlay>
  )
}

function TemplateProgressView({
  templateResults,
  activeTemplateId,
  selectedCount,
  onDownload,
}: {
  templateResults: TemplateFillResult[]
  activeTemplateId: string | null
  selectedCount: number
  onDownload: (url: string, filename: string) => void
}) {
  return (
    <>
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Generating Documents...
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Processing {selectedCount} template{selectedCount !== 1 ? 's' : ''}
        </p>
      </div>
      
      <div className="px-6 py-4 max-h-[65vh] overflow-y-auto space-y-3">
        {templateResults.map(result => (
          <TemplateFillStatusCard
            key={result.template_id}
            result={result}
            isActive={result.template_id === activeTemplateId}
            onDownload={onDownload}
          />
        ))}
      </div>
    </>
  )
}
function ResultsView({
  results,
  templateResults,
  onClose,
  onDownload,
}: {
  results: MultipleFillResults
  templateResults: TemplateFillResult[]
  onClose: () => void
  onDownload: (url: string, filename: string) => void
}) {
  const [selectedPreview, setSelectedPreview] = useState<string | null>(
    templateResults.find(r => r.status === 'success')?.report?.output.url || null
  )

  const selectedResult = templateResults.find(
    r => r.report?.output.url === selectedPreview
  )
  const selectedWarnings = selectedResult?.report?.warnings || []
  const reviewWarningCount = selectedWarnings.filter((warning) =>
    safeStringField(warning, 'reason') === 'source_confidence_below_threshold'
  ).length

  return (
    <div className="flex flex-col h-[95vh]">
      {/* Compact Header - Single Line */}
      <div className="px-4 sm:px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Status + Document Name */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                results.failed === 0 ? 'bg-green-100' : 'bg-yellow-100'
              }`}>
                <CheckCircle2 className={`w-4 h-4 ${
                  results.failed === 0 ? 'text-green-600' : 'text-yellow-600'
                }`} />
              </div>
            </div>

            {/* Document Tabs - styled as labels with divider */}
            <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
              {templateResults.map((result, index) => (
                result.status === 'success' && result.report?.output.url && (
                  <React.Fragment key={result.template_id}>
                    {index > 0 && <span className="text-gray-300">|</span>}
                    <button
  onClick={() => setSelectedPreview(result.report!.output.url!)}
  className={`text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
    selectedPreview === result.report.output.url
      ? 'text-blue-600'
      : 'text-gray-600 hover:text-gray-900'
  }`}
>
  <span className="truncate max-w-[250px] sm:max-w-[400px] inline-block">
    {result.template_name}
  </span>
</button>
                  </React.Fragment>
                )
              ))}
            </div>
          </div>

          {/* Right: Download + Close */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {selectedResult?.report?.output.url && (
              <button
                onClick={() =>
                  onDownload(
                    selectedResult.report!.output.url!,
                    selectedResult.report!.output.filename
                  )
                }
                className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Preview Area - Full Height */}
      <div className="flex-1 p-3 sm:p-4 bg-gray-50 overflow-hidden min-h-0">
        {selectedWarnings.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-900">
                  Review recommended
                </p>
                {reviewWarningCount > 0 && (
                  <p className="mt-0.5 text-xs text-amber-800">
                    {reviewWarningCount} filled field{reviewWarningCount !== 1 ? 's were' : ' was'} generated from
                    low-confidence source data.
                  </p>
                )}
                {reviewWarningCount === 0 && (
                  <p className="mt-0.5 text-xs text-amber-800">
                    Generated with {selectedWarnings.length} warning
                    {selectedWarnings.length !== 1 ? 's' : ''}. Review before using this output.
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selectedWarnings.slice(0, 3).map((warning, index) => (
                    <span
                      key={index}
                      className="rounded-full bg-white px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200"
                    >
                      {formatPreviewWarning(warning)}
                    </span>
                  ))}
                  {selectedWarnings.length > 3 && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">
                      +{selectedWarnings.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {selectedPreview ? (
          <div className="h-full bg-white rounded-lg shadow-lg overflow-hidden">
            <iframe
              src={selectedPreview}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm">No document selected</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatPreviewWarning(warning: unknown): string {
  const fieldName = safeStringField(warning, 'field_name')
  const confidence = warning && typeof warning === 'object'
    ? safeNumber((warning as Record<string, unknown>).confidence)
    : undefined

  if (fieldName && confidence !== undefined) {
    return `${fieldName}: ${Math.round(confidence * 100)}%`
  }

  return safeMessage(warning)
}

function ModalOverlay({ 
  children, 
  onClose 
}: { 
  children: React.ReactNode
  onClose?: () => void 
}) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      {children}
    </div>
  )
}

function ModalContent({ 
  children, 
  isWide = false
}: { 
  children: React.ReactNode
  onClose?: () => void
  isWide?: boolean
}) {
  return (
    <div 
      className={`bg-white rounded-xl shadow-2xl w-full flex flex-col overflow-hidden ${
        isWide 
          ? 'mx-2 sm:mx-4 h-[95vh] max-w-7xl' 
          : 'mx-4 max-h-[90vh] max-w-2xl'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
function TemplateSelectionCard({
  template,
  completeness,
  estimatedFields,
  totalTemplateFields,
  isSelected,
  onToggle,
  disabled = false,
  warning,
}: {
  template: OutputTemplate
  completeness: number
  estimatedFields: number
  totalTemplateFields: number
  isSelected: boolean
  onToggle: () => void
  disabled?: boolean
  warning?: string
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : disabled
          ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
            isSelected
              ? 'bg-blue-600 border-blue-600'
              : disabled
              ? 'bg-gray-100 border-gray-300'
              : 'bg-white border-gray-300'
          }`}
        >
          {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
        </div>
        
        {/* Template Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 truncate">
                {getTemplateDisplayName(template)}
              </h4>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {template.description}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-500">Fields</p>
              <p className="text-sm font-semibold text-gray-900">
                {estimatedFields}/{totalTemplateFields}
              </p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full ${disabled ? 'bg-gray-300' : 'bg-blue-500'}`}
              style={{ width: `${Math.max(0, Math.min(completeness, 100))}%` }}
            />
          </div>
          
          {/* Warning */}
          {warning && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
