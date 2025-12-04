'use client'

import React, { useMemo, useState } from 'react'
import {
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
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

import { calculateTemplateReadiness } from '@/lib'
import { fillMultipleTemplates } from '@/lib/api-client'
import TemplateFillStatusCard from './TemplateFillStatusCard'

interface GenerateOutputsModalProps {
  isOpen: boolean
  onClose: () => void
  submissionId: string // NEW: Required for API calls
  availableTemplates: OutputTemplate[]
  selectedTemplateIds: string[]
  onToggleTemplate: (templateId: string) => void
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
  mergedData,
  inputIds,
}: GenerateOutputsModalProps) {
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [templateResults, setTemplateResults] = useState<TemplateFillResult[]>([])
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [batchResults, setBatchResults] = useState<MultipleFillResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Calculate availability for each template
  const templateAvailabilities = useMemo(() => {
    return availableTemplates.map(template => {
      const readiness = calculateTemplateReadiness(
        template.requiredDataSections,
        template.optionalDataSections || [],
        mergedData
      )
      
      return {
        template,
        ...readiness,
        estimatedFields: Math.round((template.estimatedFields * readiness.completeness) / 100),
      }
    })
  }, [availableTemplates, mergedData])
  
  const availableOnly = templateAvailabilities.filter(t => t.canGenerate)
  const unavailableOnly = templateAvailabilities.filter(t => !t.canGenerate)
  const selectedCount = selectedTemplateIds.length
  
  // Get selected templates
  const selectedTemplates = availableTemplates
    .filter(t => selectedTemplateIds.includes(t.id))
    .map(t => ({ id: t.id, name: t.name }))
  
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
          onTemplateStart: (templateId, templateName) => {
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
          onTemplateComplete: (result) => {
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
        <ModalContent onClose={handleClose}>
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
          
          {/* Available Templates */}
          {availableOnly.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Available Templates
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedCount} of {availableOnly.length} selected
                </p>
              </div>
              
              {availableOnly.map(({ template, completeness, estimatedFields }) => (
                <TemplateSelectionCard
                  key={template.id}
                  template={template}
                  completeness={completeness}
                  estimatedFields={estimatedFields}
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
              {unavailableOnly.map(({ template, completeness, missingRequired }) => (
                <TemplateSelectionCard
                  key={template.id}
                  template={template}
                  completeness={completeness}
                  estimatedFields={0}
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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TemplateProgressView({
  templateResults,
  activeTemplateId,
  onDownload,
}: {
  templateResults: TemplateFillResult[]
  activeTemplateId: string | null
  onDownload: (url: string, filename: string) => void
}) {
  return (
    <>
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Generating Documents...
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Processing {templateResults.length} template{templateResults.length !== 1 ? 's' : ''}
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
  return (
    <>
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              results.failed === 0 ? 'bg-green-100' : 'bg-yellow-100'
            }`}>
              <CheckCircle2 className={`w-6 h-6 ${
                results.failed === 0 ? 'text-green-600' : 'text-yellow-600'
              }`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {results.failed === 0 ? 'All Documents Generated!' : 'Generation Complete'}
              </h2>
              <p className="text-sm text-gray-500">
                {results.successful} successful, {results.failed} failed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <div className="px-6 py-4 max-h-[65vh] overflow-y-auto space-y-3">
        {templateResults.map(result => (
          <TemplateFillStatusCard
            key={result.template_id}
            result={result}
            onDownload={onDownload}
          />
        ))}
      </div>
      
      <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
        <button
          onClick={onClose}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Done
        </button>
      </div>
    </>
  )
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
  onClose 
}: { 
  children: React.ReactNode
  onClose?: () => void 
}) {
  return (
    <div 
      className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
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
  isSelected,
  onToggle,
  disabled = false,
  warning,
}: {
  template: OutputTemplate
  completeness: number
  estimatedFields: number
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
                {template.name}
              </h4>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {template.description}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-500">Fields</p>
              <p className="text-sm font-semibold text-gray-900">
                {estimatedFields}/{template.estimatedFields}
              </p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mb-2">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  completeness >= 80
                    ? 'bg-green-500'
                    : completeness >= 60
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${completeness}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gray-500">
                {completeness}% complete
              </span>
              {template.estimatedSize && (
                <span className="text-xs text-gray-400">
                  ~{template.estimatedSize}KB
                </span>
              )}
            </div>
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

function GeneratingView({ templates }: { templates: OutputTemplate[] }) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Creating Your Documents
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Filling {templates.length} template{templates.length !== 1 ? 's' : ''} with your merged data...
      </p>
      
      <div className="space-y-2 max-w-md mx-auto">
        {templates.map(template => (
          <div 
            key={template.id}
            className="flex items-center gap-3 text-left bg-gray-50 rounded-lg p-3"
          >
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {template.name}
              </p>
              <p className="text-xs text-gray-500">Processing...</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
