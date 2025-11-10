/**
 * Inline Field Editor
 * Allows editing field values directly without navigation
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { Check, X, Calendar, DollarSign } from 'lucide-react'

interface InlineFieldEditorProps {
  fieldPath: string
  label: string
  value: unknown
  fieldType?: 'text' | 'number' | 'date' | 'boolean' | 'email' | 'tel'
  onSave: (value: unknown) => void
  onCancel: () => void
  className?: string
}

export function InlineFieldEditor({
  fieldPath,
  label,
  value,
  fieldType = 'text',
  onSave,
  onCancel,
  className = '',
}: InlineFieldEditorProps) {
  const [editValue, setEditValue] = useState(formatValueForEdit(value, fieldType))
  const [isValid, setIsValid] = useState(true)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const selectRef = useRef<HTMLSelectElement | null>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editValue, onCancel])

  const handleSave = () => {
    const parsed = parseValue(editValue, fieldType)
    
    if (parsed.isValid) {
      onSave(parsed.value)
    } else {
      setIsValid(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditValue(e.target.value)
    setIsValid(true)
  }

  // Render based on field type
  const renderInput = () => {
    const baseClasses = `
      w-full px-2 py-1 text-sm border rounded
      ${isValid ? 'border-blue-500 focus:ring-2 focus:ring-blue-500' : 'border-red-500 focus:ring-2 focus:ring-red-500'}
      focus:outline-none
    `

    switch (fieldType) {
      case 'number':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="number"
            value={editValue}
            onChange={handleChange}
            className={baseClasses}
            step="any"
          />
        )

      case 'date':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="date"
            value={editValue}
            onChange={handleChange}
            className={baseClasses}
          />
        )

      case 'email':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="email"
            value={editValue}
            onChange={handleChange}
            className={baseClasses}
          />
        )

      case 'tel':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="tel"
            value={editValue}
            onChange={handleChange}
            className={baseClasses}
          />
        )

      case 'boolean':
        return (
          <select
           ref={selectRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className={baseClasses}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        )

      case 'text':
      default:
        // Use textarea for long text
        const isLongText = String(editValue).length > 50
        
        if (isLongText) {
          return (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={handleChange}
              className={`${baseClasses} resize-none`}
              rows={3}
            />
          )
        }

        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={handleChange}
            className={baseClasses}
          />
        )
    }
  }

  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <div className="flex-1 min-w-0">
        {renderInput()}
        {!isValid && (
          <p className="text-xs text-red-600 mt-1">Invalid value format</p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 mt-1">
        <button
          onClick={handleSave}
          className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
          title="Save (Enter)"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={onCancel}
          className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Cancel (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * Format value for editing
 */
function formatValueForEdit(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (fieldType === 'boolean') {
    return String(!!value)
  }

  if (fieldType === 'date') {
    // Convert various date formats to YYYY-MM-DD
    const dateStr = String(value)
    
    // Try to parse and format
    try {
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch {
      // Return as-is if parsing fails
    }
  }

  // Array or object - stringify
  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Parse edited value back to appropriate type
 */
function parseValue(
  value: string,
  fieldType: string
): { isValid: boolean; value: unknown } {
  const trimmed = value.trim()

  if (trimmed === '') {
    return { isValid: true, value: null }
  }

  switch (fieldType) {
    case 'number':
      const num = parseFloat(trimmed)
      if (isNaN(num)) {
        return { isValid: false, value: trimmed }
      }
      return { isValid: true, value: num }

    case 'boolean':
      return {
        isValid: true,
        value: trimmed === 'true',
      }

    case 'date':
      // Validate date format
      const date = new Date(trimmed)
      if (isNaN(date.getTime())) {
        return { isValid: false, value: trimmed }
      }
      return { isValid: true, value: trimmed }

    case 'email':
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(trimmed)) {
        return { isValid: false, value: trimmed }
      }
      return { isValid: true, value: trimmed }

    case 'tel':
      // Basic phone validation (10+ digits)
      const phoneRegex = /\d{10,}/
      if (!phoneRegex.test(trimmed.replace(/\D/g, ''))) {
        return { isValid: false, value: trimmed }
      }
      return { isValid: true, value: trimmed }

    case 'text':
    default:
      return { isValid: true, value: trimmed }
  }
}

/**
 * Clickable Field Value
 * Shows value and switches to editor on click
 */
interface ClickableFieldValueProps {
  fieldPath: string
  label: string
  value: unknown
  fieldType?: 'text' | 'number' | 'date' | 'boolean' | 'email' | 'tel'
  onEdit: (value: unknown) => void
  className?: string
}

export function ClickableFieldValue({
  fieldPath,
  label,
  value,
  fieldType = 'text',
  onEdit,
  className = '',
}: ClickableFieldValueProps) {
  const [isEditing, setIsEditing] = useState(false)

  const handleSave = (newValue: unknown) => {
    onEdit(newValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  // Format display value
  const displayValue = formatDisplayValue(value, fieldType)

  if (isEditing) {
    return (
      <InlineFieldEditor
        fieldPath={fieldPath}
        label={label}
        value={value}
        fieldType={fieldType}
        onSave={handleSave}
        onCancel={handleCancel}
        className={className}
      />
    )
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`
        px-2 py-1 rounded cursor-pointer
        hover:bg-blue-50 hover:text-blue-700
        transition-colors text-sm
        ${className}
      `}
      title="Click to edit"
    >
      {displayValue}
    </div>
  )
}

/**
 * Format value for display
 */
function formatDisplayValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  if (fieldType === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (fieldType === 'date') {
    try {
      const date = new Date(String(value))
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString()
      }
    } catch {
      // Fall through to default
    }
  }

  if (fieldType === 'number') {
    const num = parseFloat(String(value))
    if (!isNaN(num)) {
      return num.toLocaleString()
    }
  }

  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}