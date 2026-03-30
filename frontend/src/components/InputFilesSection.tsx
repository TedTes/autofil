'use client'

import { InputFile } from '@/types/folder'
import { Submission } from '@/types'
import InputFileCard from './InputFileCard'
import { Upload, AlertCircle, FolderOpen } from 'lucide-react'

function getTemplateDisplay(
  templateType?: string,
  templateMetadata?: { name?: string; template_id?: string }
): string | null {
  if (templateMetadata?.name) {
    return templateMetadata.name
  }
  if (!templateType) return null

  const legacyLabels: Record<string, string> = {
    property_renewal: 'Property Renewal',
    wc_quote: 'Workers Comp Quote',
    gl_new_business: 'GL New Business',
    custom: 'Custom Submission',
  }

  return legacyLabels[templateType] || templateType.replaceAll('_', ' ').toUpperCase()
}

interface InputFilesSectionProps {
  files: InputFile[]
  activeSubmission: Submission | null  // ADDED
  onUpload: () => void
  onRemove: (fileId: string) => void
  onPreview: (fileId: string) => void
  onViewExtraction?: (fileId: string) => void
}

export default function InputFilesSection({
  files,
  activeSubmission,  // ADDED
  onUpload,
  onRemove,
  onPreview,
  onViewExtraction,
}: InputFilesSectionProps) {
  const templateDisplay = getTemplateDisplay(
    activeSubmission?.template_type,
    activeSubmission?.template_metadata,
  )

  // If no submission selected, show prompt
  if (!activeSubmission) {
    return (
      <section className="mb-6">
        <div className="border-2 border-dashed border-orange-300 bg-orange-50/50 rounded-xl p-12">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-orange-600" />
            </div>
            <h4 className="text-base font-semibold text-gray-900 mb-2">
              Select a submission first
            </h4>
            <p className="text-sm text-gray-600 mb-4 max-w-md">
              Files need to be organized under a client submission. Please select an existing submission from the sidebar or create a new one.
            </p>
            <div className="flex items-center gap-2 text-sm text-orange-700 bg-orange-100 px-4 py-2 rounded-lg">
              <FolderOpen className="w-4 h-4" />
              <span>Choose submission in sidebar →</span>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mb-6">
      {/* File List or Drop Zone */}
      {files.length === 0 ? (
        // Empty state drop zone (with context)
        <button
          onClick={onUpload}
          className="w-full border-2 border-dashed border-gray-300 rounded-xl p-12 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 group"
        >
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            
            {/* Show submission context */}
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1">Uploading to:</p>
              <p className="text-sm font-semibold text-gray-900">
                {activeSubmission.name}
              </p>
              {templateDisplay && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {templateDisplay}
                </p>
              )}
            </div>

            <h4 className="text-base font-semibold text-gray-900 mb-2">
              Upload Files
            </h4>
            <p className="text-sm text-gray-500 mb-4">
              Click to browse or drag and drop your PDF files here
            </p>
            <div className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg group-hover:bg-blue-700 transition-colors">
              Browse Files
            </div>
          </div>
        </button>
      ) : (
        // List when files exist
        <div className="space-y-3">
          {/* Context header above file list */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                {activeSubmission.name}
              </span>
              {templateDisplay && (
                <span className="text-xs text-gray-500">
                  • {templateDisplay}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* File cards */}
          {files.map((file) => (
            <InputFileCard
              key={file.id}
              file={file}
              onRemove={() => onRemove(file.id)}
              onPreview={() => onPreview(file.id)}
              onViewExtraction={onViewExtraction ? () => onViewExtraction(file.id) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )
}
