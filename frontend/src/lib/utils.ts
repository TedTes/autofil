/**
 * Utility functions
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {ExtractedField,CanonicalOutput,WorkflowStep,FileWorkflowStatus,WorkflowFile,StepValidation,WORKFLOW_TRANSITIONS,FILE_STATUS_TRANSITIONS} from "../types";
import { 
  Upload, 
  Zap, 
  Eye, 
  Save,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock
} from 'lucide-react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper function to transform API data to form fields
export function transformApiFieldsToForm(apiData: Record<string, unknown>): ExtractedField[] {
  const fields: ExtractedField[] = []

  // Define field sections and types based on common ACORD fields
  const fieldMapping: Record<string, { section: string; type: ExtractedField['field_type']; required?: boolean }> = {
    // General Information
    insured_name: { section: 'General Information', type: 'text', required: true },
    policy_number: { section: 'General Information', type: 'text', required: true },
    effective_date: { section: 'General Information', type: 'date', required: true },
    expiration_date: { section: 'General Information', type: 'date', required: true },
    
    // Policy Details
    coverage_type: { section: 'Policy Details', type: 'text' },
    premium_amount: { section: 'Policy Details', type: 'number' },
    deductible: { section: 'Policy Details', type: 'number' },
    policy_limit: { section: 'Policy Details', type: 'number' },
    
    // Contact Information
    agent_name: { section: 'Contact Information', type: 'text' },
    agent_phone: { section: 'Contact Information', type: 'text' },
    agent_email: { section: 'Contact Information', type: 'text' },
    
    // Additional Details
    notes: { section: 'Additional Details', type: 'text' },
    special_conditions: { section: 'Additional Details', type: 'text' },
  }

  // Transform each field from API data
  for (const [key, value] of Object.entries(apiData)) {
    const mapping = fieldMapping[key] || { section: 'Other', type: 'text' }
    
    fields.push({
      field_name: key,
      field_value: String(value),
      confidence: hasNumericConfidence(value) ? value.confidence : undefined,
      field_type: mapping.type,
      section: mapping.section,
      required: mapping.required,
    })
  }

  // Sort fields by section
  fields.sort((a, b) => {
    const sectionOrder = ['General Information', 'Policy Details', 'Contact Information', 'Additional Details', 'Other']
    const sectionA = sectionOrder.indexOf(a.section || 'Other')
    const sectionB = sectionOrder.indexOf(b.section || 'Other')
    return sectionA - sectionB
  })

  return fields
}

function hasNumericConfidence(value: unknown): value is { confidence: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['confidence'] === 'number'
  )
}

// Helper function to transform form fields back to API data
export function transformFormFieldsToApi(fields: ExtractedField[]): Record<string, unknown> {
  const apiData: Record<string, unknown> = {}

  for (const field of fields) {
    // Use field_value directly, but handle special cases
    let value = field.field_value  as string | number | null

    // Convert empty strings to null
    if (value === '') {
      value = null
    }

    // Convert string numbers to actual numbers if field type is number
    if (field.field_type === 'number' && typeof value === 'string') {
      value = parseFloat(value) || null
    }

    // Store the value
    apiData[field.field_name] = value
  }

  return apiData
}


export const formatDate = (dateString: string): string => {
  try {
    if(!dateString) return 'Recently';
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  } catch {
    return 'Recently'
  }
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
// Helper function for file type display
export function formatFileType(type?: string): string {
  if (!type) return 'PDF'
  return type.toUpperCase()
}

export function flattenObjectToFields(
  obj: Record<string, unknown>,
  confidences?: Record<string, number>,
  hints?: Record<string, string>,
  parentKey: string = ''
): ExtractedField[] {
  const fields: ExtractedField[] = []
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key
    
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        if (typeof item === 'object') {
          fields.push(...flattenObjectToFields(item, confidences, hints, `${fullKey}[${idx}]`))
        } else {
          fields.push({
            field_name: `${fullKey}[${idx}]`,
            field_value: String(item),
            confidence: confidences?.[`${fullKey}[${idx}]`],
            field_type: 'text',
            section: parentKey || 'General'
          })
        }
      })
    } else if (typeof value === 'object' && value !== null) {
      fields.push(
        ...flattenObjectToFields(
          value as Record<string, unknown>,
          confidences,
          hints,
          fullKey
        )
      )
    } else {
      fields.push({
        field_name: fullKey,
        field_value: String(value),
        confidence: confidences?.[fullKey],
        field_type: inferFieldType(value),
        section: parentKey || 'General'
      })
    }
  }
  
  return fields
}

function inferFieldType(value: unknown): ExtractedField['field_type'] {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
  return 'text'
}

// Helper function
export function fieldsToNestedObject(fields: ExtractedField[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  
  fields.forEach(field => {
    const keys = field.field_name.split('.')
    let current = result
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {}
      current = current[keys[i]] as Record<string,unknown>
    }
    
    current[keys[keys.length - 1]] = field.field_value
  })
  
  return result
}

export function isCanonicalOutput(data: CanonicalOutput) {
  return (
    data &&
    typeof data === 'object' &&
    'job_id' in data &&
    'source' in data &&
    'entities' in data &&
    'metadata' in data &&
    typeof data.entities === 'object'
  )
}
/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  from: FileWorkflowStatus,
  to: FileWorkflowStatus
): boolean {
  return FILE_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Get next step in workflow
 */
export function getNextStep(currentStep: WorkflowStep): WorkflowStep | null {
  return WORKFLOW_TRANSITIONS[currentStep]
}

/**
 * Check if files are ready for a step
 */
export function canProceedToStep(
  step: WorkflowStep,
  files: WorkflowFile[]
): StepValidation {
  if (files.length === 0) {
    return { canProceed: false, reason: 'No files uploaded' }
  }

  switch (step) {
    case 'extract':
      const uploadedFiles = files.filter(f => f.status === 'uploaded')
      if (uploadedFiles.length === 0) {
        return { canProceed: false, reason: 'No files ready for extraction' }
      }
      return { canProceed: true }

    case 'review':
      const extractedFiles = files.filter(f => f.status === 'extracted')
      if (extractedFiles.length === 0) {
        return { canProceed: false, reason: 'No files extracted yet' }
      }
      return { canProceed: true }

    case 'save':
      const reviewedFiles = files.filter(f => 
        f.status === 'extracted' || f.status === 'reviewing'
      )
      if (reviewedFiles.length === 0) {
        return { canProceed: false, reason: 'No files ready to save' }
      }
      return { canProceed: true }

    default:
      return { canProceed: true }
  }
}

/**
 * Get files by status
 */
export function getFilesByStatus(
  files: WorkflowFile[],
  status: FileWorkflowStatus | FileWorkflowStatus[]
): WorkflowFile[] {
  const statuses = Array.isArray(status) ? status : [status]
  return files.filter(f => statuses.includes(f.status))
}

/**
 * Get step progress percentage
 */
export function getStepProgress(step: WorkflowStep): number {
  const steps: WorkflowStep[] = ['upload', 'extract', 'review', 'save']
  const index = steps.indexOf(step)
  return ((index + 1) / steps.length) * 100
}

/**
 * Check if step is completed
 */
export function isStepCompleted(
  step: WorkflowStep,
  currentStep: WorkflowStep
): boolean {
  const steps: WorkflowStep[] = ['upload', 'extract', 'review', 'save']
  const stepIndex = steps.indexOf(step)
  const currentIndex = steps.indexOf(currentStep)
  return stepIndex < currentIndex
}

/**
 * Get step status for UI
 */
export function getStepStatus(
  step: WorkflowStep,
  currentStep: WorkflowStep
): 'completed' | 'current' | 'upcoming' {
  const steps: WorkflowStep[] = ['upload', 'extract', 'review', 'save']
  const stepIndex = steps.indexOf(step)
  const currentIndex = steps.indexOf(currentStep)

  if (stepIndex < currentIndex) return 'completed'
  if (stepIndex === currentIndex) return 'current'
  return 'upcoming'
}


/**
 * Workflow constants and configuration
 */


/**
 * Step metadata for UI display
 */
export const WORKFLOW_STEPS: Record<WorkflowStep, {
  label: string
  description: string
  icon: typeof Upload
  color: string
}> = {
  upload: {
    label: 'Upload',
    description: 'Select and upload your documents',
    icon: Upload,
    color: 'blue',
  },
  extract: {
    label: 'Extract',
    description: 'AI extracts data from documents',
    icon: Zap,
    color: 'purple',
  },
  review: {
    label: 'Review',
    description: 'Review and edit extracted data',
    icon: Eye,
    color: 'orange',
  },
  save: {
    label: 'Save',
    description: 'Save to Documents section',
    icon: Save,
    color: 'green',
  },
}

/**
 * File status metadata for UI display
 */
export const FILE_STATUS_META: Record<FileWorkflowStatus, {
  label: string
  icon: typeof CheckCircle2
  color: string
  bgColor: string
  textColor: string
}> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
  },
  uploading: {
    label: 'Uploading',
    icon: Loader2,
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
  },
  uploaded: {
    label: 'Uploaded',
    icon: CheckCircle2,
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
  },
  extracting: {
    label: 'Extracting',
    icon: Loader2,
    color: 'purple',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
  },
  extracted: {
    label: 'Extracted',
    icon: CheckCircle2,
    color: 'purple',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
  },
  reviewing: {
    label: 'Reviewing',
    icon: Eye,
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
  },
  saving: {
    label: 'Saving',
    icon: Loader2,
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
  },
  saved: {
    label: 'Saved',
    icon: CheckCircle2,
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
  },
}

/**
 * Allowed file types for upload
 */
export const ALLOWED_FILE_TYPES = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  excel: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  image: ['image/png', 'image/jpeg', 'image/jpg'],
}

/**
 * Flattened allowed MIME types
 */
export const ALLOWED_MIME_TYPES = [
  ALLOWED_FILE_TYPES.pdf,
  ALLOWED_FILE_TYPES.csv,
  ...ALLOWED_FILE_TYPES.excel,
  ...ALLOWED_FILE_TYPES.image,
]

/**
 * File extensions
 */
export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.csv',
  '.xls',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
]

/**
 * Max file size (50 MB)
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024

/**
 * Max files per upload
 */
export const MAX_FILES_PER_UPLOAD = 10

/**
 * Auto-save interval (ms)
 */
export const AUTO_SAVE_INTERVAL = 30000 // 30 seconds

/**
 * Toast durations (ms)
 */
export const TOAST_DURATION = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
}

/**
 * Confidence thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.9,
  medium: 0.7,
  low: 0.5,
}

/**
 * Get confidence level from score
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return 'high'
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return 'medium'
  return 'low'
}

/**
 * Get confidence color
 */
export function getConfidenceColor(confidence: number): string {
  const level = getConfidenceLevel(confidence)
  return {
    high: 'green',
    medium: 'yellow',
    low: 'red',
  }[level]
}

/**
 * Workflow messages
 */
export const WORKFLOW_MESSAGES = {
  upload: {
    empty: 'Drop files here or click to browse',
    dragActive: 'Drop files here',
    uploading: 'Uploading files...',
    success: (count: number) => `✓ Uploaded ${count} file${count > 1 ? 's' : ''}`,
    error: 'Upload failed',
  },
  extract: {
    pending: 'Ready to extract',
    extracting: (current: number, total: number) => 
      `Extracting ${current}/${total} files...`,
    success: (count: number) => 
      `✓ Extracted ${count} file${count > 1 ? 's' : ''} successfully`,
    error: (count: number) => 
      `Failed to extract ${count} file${count > 1 ? 's' : ''}`,
  },
  review: {
    empty: 'No files to review',
    unsavedChanges: 'You have unsaved changes',
    lowConfidence: (count: number) => 
      `${count} field${count > 1 ? 's' : ''} with low confidence`,
  },
  save: {
    saving: (count: number) => 
      `Saving ${count} file${count > 1 ? 's' : ''}...`,
    success: (count: number) => 
      `✓ Saved ${count} file${count > 1 ? 's' : ''} to Documents`,
    error: 'Failed to save',
  },
}

/**
 * Navigation warning
 */
export const UNSAVED_CHANGES_WARNING = {
  title: 'Unsaved Changes',
  message: (count: number) => 
    `You have ${count} extracted file${count > 1 ? 's' : ''} that haven't been saved. What would you like to do?`,
  actions: {
    save: 'Save & Continue',
    discard: 'Discard',
    cancel: 'Cancel',
  },
}

/**
 * Helper: Extract actual value from object structure
 */
export function extractFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  
  // If it's an object with a 'value' property, extract it
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return String((value as { value: unknown }).value)
  }
  
  // If it's an array, join the values (limit to first 3)
  if (Array.isArray(value)) {
    const extracted = value.map(item => extractFieldValue(item)).filter(Boolean)
    if (extracted.length > 3) {
      return `${extracted.slice(0, 3).join(', ')}... (+${extracted.length - 3} more)`
    }
    return extracted.join(', ')
  }
  
  // If it's a plain object, stringify it
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  
  return String(value)
}

/**
 * Helper: Extract confidence from object structure
 */
export function extractConfidence(value: unknown): number | undefined {
  if (typeof value === 'object' && value !== null && 'confidence' in value) {
    return (value as { confidence: number }).confidence
  }
  return undefined
}