/**
 * Utility functions
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {ExtractedField} from "../types";
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

// Helper Functions
export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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