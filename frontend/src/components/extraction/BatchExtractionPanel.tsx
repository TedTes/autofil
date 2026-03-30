'use client'

import { useState } from 'react'
import { 
  CheckSquare, 
  Square, 
  Play, 
  Pause, 
  RotateCcw,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react'
import { CompactDocumentBadge } from './DocumentTypeBadge'
import type { UploadedExtractionFile } from '@/types/extraction'

interface BatchExtractionPanelProps {
  files: UploadedExtractionFile[]
  onExtractBatch: (fileIds: string[]) => Promise<void>
  onRetry: (fileId: string) => void
  isProcessing?: boolean
  className?: string
}

export default function BatchExtractionPanel({
  files,
  onExtractBatch,
  onRetry,
  isProcessing = false,
  className = '',
}: BatchExtractionPanelProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [extracting, setExtracting] = useState(false)

  // Filter files that are ready for extraction (classified but not extracted)
  const extractableFiles = files.filter(
    f =>
      (f.status === 'classified' || f.status === 'uploaded')
      && f.classification?.is_supported !== false
  )

  const extractedFiles = files.filter(f => f.status === 'extracted')
  const failedFiles = files.filter(f => f.status === 'error')
  const reviewFiles = files.filter(f => f.classification?.needs_review)

  // Toggle individual file selection
  const toggleFile = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(fileId)) {
        newSet.delete(fileId)
      } else {
        newSet.add(fileId)
      }
      return newSet
    })
  }

  // Select all extractable files
  const selectAll = () => {
    setSelectedFiles(new Set(extractableFiles.map(f => f.id)))
  }

  // Deselect all
  const deselectAll = () => {
    setSelectedFiles(new Set())
  }

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedFiles.size === extractableFiles.length) {
      deselectAll()
    } else {
      selectAll()
    }
  }

  // Handle batch extraction
  const handleExtractBatch = async () => {
    if (selectedFiles.size === 0) return

    setExtracting(true)
    try {
      await onExtractBatch(Array.from(selectedFiles))
      setSelectedFiles(new Set()) // Clear selection after success
    } finally {
      setExtracting(false)
    }
  }

  // Calculate statistics
  const totalFiles = files.length
  const progress = totalFiles > 0 ? (extractedFiles.length / totalFiles) * 100 : 0

  return (
    <div className={`bg-white border-2 border-gray-200 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Batch Extraction
            </h3>
            <p className="text-sm text-gray-600">
              {extractableFiles.length} files ready • {extractedFiles.length} completed • {failedFiles.length} failed
              {reviewFiles.length > 0 && ` • ${reviewFiles.length} need review`}
            </p>
          </div>

          {/* Progress */}
          {totalFiles > 0 && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {Math.round(progress)}%
                </p>
                <p className="text-xs text-gray-500">
                  {extractedFiles.length}/{totalFiles}
                </p>
              </div>
              <div className="w-16 h-16 relative">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-gray-200"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
                    className="text-green-500 transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Batch Controls */}
      {extractableFiles.length > 0 && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {selectedFiles.size === extractableFiles.length ? (
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
                <span>
                  {selectedFiles.size === extractableFiles.length
                    ? 'Deselect All'
                    : 'Select All'}
                </span>
              </button>

              {selectedFiles.size > 0 && (
                <span className="text-sm text-gray-600">
                  ({selectedFiles.size} selected)
                </span>
              )}
            </div>

            <button
              onClick={handleExtractBatch}
              disabled={selectedFiles.size === 0 || extracting || isProcessing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Extract Selected ({selectedFiles.size})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* File List */}
      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {/* Extractable Files */}
        {extractableFiles.length > 0 && (
          <div>
            {extractableFiles.map(file => (
              <BatchFileItem
                key={file.id}
                file={file}
                isSelected={selectedFiles.has(file.id)}
                onToggle={() => toggleFile(file.id)}
                onRetry={() => onRetry(file.id)}
                disabled={extracting || isProcessing}
              />
            ))}
          </div>
        )}

        {/* Extracted Files */}
        {extractedFiles.length > 0 && (
          <div>
            <div className="px-6 py-2 bg-green-50">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                Completed ({extractedFiles.length})
              </p>
            </div>
            {extractedFiles.map(file => (
              <BatchFileItem
                key={file.id}
                file={file}
                isSelected={false}
                onToggle={() => {}}
                disabled={true}
                showCheckbox={false}
              />
            ))}
          </div>
        )}

        {/* Failed Files */}
        {failedFiles.length > 0 && (
          <div>
            <div className="px-6 py-2 bg-red-50">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                Failed ({failedFiles.length})
              </p>
            </div>
            {failedFiles.map(file => (
              <BatchFileItem
                key={file.id}
                file={file}
                isSelected={false}
                onToggle={() => {}}
                onRetry={() => onRetry(file.id)}
                disabled={extracting || isProcessing}
                showCheckbox={false}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {files.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No files uploaded yet</p>
          </div>
        )}
        {files.length > 0 && extractableFiles.length === 0 && extractedFiles.length === 0 && failedFiles.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No supported files are ready for extraction</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Batch File Item Component
interface BatchFileItemProps {
  file: UploadedExtractionFile
  isSelected: boolean
  onToggle: () => void
  onRetry?: () => void
  disabled?: boolean
  showCheckbox?: boolean
}

function BatchFileItem({
  file,
  isSelected,
  onToggle,
  onRetry,
  disabled = false,
  showCheckbox = true,
}: BatchFileItemProps) {
  const getStatusIcon = () => {
    switch (file.status) {
      case 'uploading':
      case 'classifying':
      case 'extracting':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'extracted':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Checkbox */}
        {showCheckbox && (
          <button
            onClick={onToggle}
            disabled={disabled}
            className="flex-shrink-0"
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-blue-600" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
            )}
          </button>
        )}

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {file.name}
            </p>
            {file.classification && (
              <CompactDocumentBadge
                documentType={file.classification.document_type}
                confidence={file.classification.confidence}
              />
            )}
          </div>

          {/* Progress or Status */}
          {file.status === 'uploading' && file.uploadProgress > 0 && (
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${file.uploadProgress}%` }}
              />
            </div>
          )}

          {file.status === 'extracted' && file.extractionResult && (
            <p className="text-xs text-gray-500">
              {Object.keys(file.extractionResult.data).length} fields • {' '}
              {Math.round(file.extractionResult.confidence * 100)}% confidence
            </p>
          )}

          {file.classification?.message && (
            <p
              className={`text-xs mt-1 ${
                file.classification.is_supported === false ? 'text-red-600' : 'text-yellow-700'
              }`}
            >
              {file.classification.message}
            </p>
          )}

          {file.error && (
            <p className="text-xs text-red-600 mt-1">{file.error}</p>
          )}
        </div>

        {/* Status Icon */}
        <div className="flex-shrink-0">
          {getStatusIcon()}
        </div>

        {/* Retry Button */}
        {file.status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            disabled={disabled}
            className="flex-shrink-0 p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-md transition-colors disabled:opacity-50"
            title="Retry extraction"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
