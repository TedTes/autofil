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
export function transformApiFieldsToForm(apiData: Record<string, string> | object): ExtractedField[] {
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
      field_value: value,
      confidence: typeof value === 'object' && value["confidence"] ? value["confidence"] : undefined,
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