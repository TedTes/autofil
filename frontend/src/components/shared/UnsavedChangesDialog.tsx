/**
 * Unsaved Changes Dialog
 * Warns user before navigating away from unsaved work
 */

'use client'

import { X, AlertTriangle, Save, Trash2 } from 'lucide-react'

interface UnsavedChangesDialogProps {
  isOpen: boolean
  fileCount: number
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function UnsavedChangesDialog({
  isOpen,
  fileCount,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-gray-200">
          <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">
              Unsaved Changes
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              You have {fileCount} extracted file{fileCount > 1 ? 's' : ''} that haven&apos;t been saved to Documents.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-gray-700 mb-6">
            What would you like to do with these files?
          </p>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Save & Continue */}
            <button
              onClick={onSave}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Save className="w-4 h-4" />
              Save & Continue
            </button>

            {/* Discard */}
            <button
              onClick={onDiscard}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Discard Changes
            </button>

            {/* Cancel */}
            <button
              onClick={onCancel}
              className="w-full px-4 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}