/**
 * CreateSubmissionModal.tsx
 * 
 * A modal for creating new submissions with name input and validation.
 * Replaces browser prompt() with better UX.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { FolderPlus, X, AlertCircle } from 'lucide-react'

interface CreateSubmissionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (name: string) => void
  suggestedName?: string
  isCreating?: boolean
  existingNames?: string[]
}

export function CreateSubmissionModal({
  isOpen,
  onClose,
  onConfirm,
  suggestedName = '',
  isCreating = false,
  existingNames = [],
}: CreateSubmissionModalProps) {
  const [submissionName, setSubmissionName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSubmissionName(suggestedName)
      setError(null)
      // Focus input after a short delay to ensure modal is rendered
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 100)
    }
  }, [isOpen, suggestedName])

  const validateName = (name: string): string | null => {
    const trimmed = name.trim()
    
    if (!trimmed) {
      return 'Submission name is required'
    }
    
    if (trimmed.length < 2) {
      return 'Submission name must be at least 2 characters'
    }
    
    if (trimmed.length > 100) {
      return 'Submission name must be less than 100 characters'
    }
    
    // Check for duplicate names (case-insensitive)
    if (existingNames.some(existing => 
      existing.toLowerCase() === trimmed.toLowerCase()
    )) {
      return 'A submission with this name already exists'
    }
    
    return null
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    
    if (isCreating) return
    
    const validationError = validateName(submissionName)
    if (validationError) {
      setError(validationError)
      return
    }
    
    onConfirm(submissionName.trim())
  }

  const handleCancel = () => {
    if (!isCreating) {
      onClose()
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isCreating) {
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isCreating) {
      onClose()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSubmissionName(e.target.value)
    // Clear error when user starts typing
    if (error) {
      setError(null)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FolderPlus className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">New Submission</h2>
          </div>
          {!isCreating && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label htmlFor="submission-name" className="block text-sm font-medium text-gray-700 mb-2">
              Submission Name
            </label>
            
            <input
              ref={inputRef}
              id="submission-name"
              type="text"
              value={submissionName}
              onChange={handleInputChange}
              disabled={isCreating}
              placeholder="e.g., Q4 2024 Reports"
              className={`w-full px-3 py-2 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                error
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300 bg-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              maxLength={100}
            />
            
            {error && (
              <div className="mt-2 flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            
            <p className="mt-2 text-xs text-gray-500">
              Choose a descriptive name to help organize your submissions
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 bg-gray-50 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isCreating}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !submissionName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4" />
                  <span>Create Submission</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}