/**
 * Entity Transformer
 * Converts backend CanonicalOutput entities to frontend nested structure
 * 
 * Used by: api-client.ts getSubmission() function
 * 
 * Flow:
 * 1. Receives entities: Dict[str, List[EntityValue]] from backend
 * 2. For each field, looks up mapping in mfc-mapping.ts
 * 3. Extracts values, applies transformers if needed
 * 4. Builds nested object structure for frontend
 * 5. Extracts confidence scores for each field
 */

import type { EntityValue, CanonicalOutput,NestedData,MailingAddress, ProducerInfo,DeductibleStructure,GrossSalesStructure} from '@/types'
import { getFieldMapping, hasCustomTransformer } from './mfc-mapping'


/**
 * Transformation result returned to api-client
 */
export interface TransformationResult {
  /** Nested data structure for frontend */
  data: NestedData
  
  /** Field confidence scores (path → confidence) */
  field_confidence: Record<string, number>
  
  /** Overall extraction confidence */
  overall_confidence: number
  
  /** Warnings about low confidence or missing data */
  warnings: string[]
}

/**
 * Main transformation function
 * Converts CanonicalOutput entities to frontend structure
 * 
 * @param entities - Backend entities Dict[fieldId, List[EntityValue]]
 * @returns Transformed data, confidences, warnings
 */
export function transformEntities(
  entities: Record<string, EntityValue[]>
): TransformationResult {
  const data: NestedData = {}
  const field_confidence: Record<string, number> = {}
  const warnings: string[] = []
  const all_confidences: number[] = []
  
  // Process each entity from backend
  for (const [fieldId, entityValues] of Object.entries(entities) as [string, EntityValue[]][]) {
    if (!entityValues || entityValues.length === 0) {
      continue
    }
    
    // Get mapping for this field
    const mapping = getFieldMapping(fieldId)
    
    if (!mapping) {
      // Unmapped field - store in 'other' section
      console.warn(`⚠️ Unmapped field: ${fieldId}`)
      if (!data.other) data.other = {}
      const otherObj = data.other as Record<string, unknown>
      otherObj[fieldId.toLowerCase()] = entityValues[0].value
      continue
    }
    
    // Extract raw values from EntityValues
    const values = entityValues.map(ev => ev.value)
    const confidences = entityValues.map(ev => ev.confidence)
    
    // Apply transformation based on field type
    let transformedValue: unknown
    
    if (hasCustomTransformer(fieldId)) {
      // Use custom transformer
      transformedValue = applyCustomTransformer(fieldId, values, mapping.cardinality)
    } else {
      // Default transformation based on cardinality
      transformedValue = transformByCardinality(values, mapping.cardinality)
    }
    
    // Set value in nested structure
    setNestedValue(data, mapping.path, transformedValue)
    
    // Calculate and store field confidence
    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    field_confidence[mapping.path] = avgConfidence
    all_confidences.push(...confidences)
    
    // Add warning if low confidence
    if (avgConfidence < 0.7) {
      warnings.push(`Low confidence for ${fieldId}: ${Math.round(avgConfidence * 100)}%`)
    }
  }
  
  // Calculate overall confidence
  const overall_confidence = all_confidences.length > 0
    ? all_confidences.reduce((sum, c) => sum + c, 0) / all_confidences.length
    : 0
  
  return {
    data,
    field_confidence,
    overall_confidence,
    warnings
  }
}

/**
 * Transform values based on cardinality
 * 
 * @param values - Array of extracted values
 * @param cardinality - 'one' or 'many'
 * @returns Single value or filtered array
 */
function transformByCardinality(values: unknown[], cardinality: 'one' | 'many'): unknown | unknown[] {
  if (cardinality === 'many') {
    // Return array, filter out empty values
    return values.filter(v => 
      v !== null && 
      v !== undefined && 
      v !== '' && 
      v !== 'N/A'
    )
  } else {
    // Return first value
    return values[0] || null
  }
}

/**
 * Apply custom transformer for specific fields
 * These handle complex transformations that can't be done generically
 * 
 * @param fieldId - MFC field ID
 * @param values - Array of values from EntityValues
 * @param cardinality - Field cardinality
 * @returns Transformed value
 */
function applyCustomTransformer(
  fieldId: string, 
  values: unknown[], 
  cardinality: 'one' | 'many'
): unknown {
  switch (fieldId) {
    case 'MailingAddress':
      return transformMailingAddress(values)
    
    case 'InsuredName':
      return transformInsuredName(values)
    
    case 'ProducerName':
      return transformProducerName(values)
    
    case 'Deductible':
      return transformDeductible(values)
    
    case 'GrossSales':
      return transformGrossSales(values)
    
    case 'Classification':
      return transformClassification(values)
    
    case 'EffectiveDate':
      return transformEffectiveDate(values)
    
    case 'LineOfBusiness':
      return transformLineOfBusiness(values)
    
    default:
      // Fallback to default transformation
      return transformByCardinality(values, cardinality)
  }
}

// ============================================================================
// CUSTOM TRANSFORMERS
// ============================================================================
/**
 * MailingAddress: [street, city, state, zip, country] → object
 */
function transformMailingAddress(values: unknown[]): MailingAddress {
  if (values.length >= 5) {
    return {
      street: values[0] || '',
      city: values[1] || '',
      state: values[2] || '',
      zip: values[3] || '',
      country: values[4] || ''
    } as MailingAddress
  }
  // Partial data - return what we have
  return {
    street: values[0] || '',
    city: values[1] || '',
    state: values[2] || '',
    zip: values[3] || '',
    country: values[4] || ''
  } as MailingAddress
}

/**
 * InsuredName: [company, DBA, contact, date] → take first as company name
 * Other values can be accessed separately if needed
 */
function transformInsuredName(values: unknown[]): string {
  // Return first value as primary company name
  // Filter out N/A values
  const filtered = values.filter(v => v && v !== 'N/A')
  return filtered[0] as string || ''
}


/**
 * ProducerName: [name, location_code, hazard_code, license, FEIN] → object
 */
function transformProducerName(values: unknown[]): ProducerInfo | string {
  if (values.length >= 5) {
    return {
      name: values[0] || '',
      location_code: values[1] || '',
      hazard_code: values[2] || '',
      license_number: values[3] || '',
      fein: values[4] || ''
    } as ProducerInfo
  }
  // Fallback: just return name
  return values[0] as string || ''
}

/**
 * Deductible: [property_damage, bodily_injury, general_aggregate] → object
 */
function transformDeductible(values: unknown[]): DeductibleStructure | number | unknown[] {
  if (values.length === 3) {
    return {
      property_damage: values[0] || 0,
      bodily_injury: values[1] || 0,
      general_aggregate: values[2] || 0
    } as DeductibleStructure
  } else if (values.length === 1) {
    return values[0] as number
  }
  // Return array as-is
  return values
}

/**
 * GrossSales: [current, projected] → object or single value
 */
function transformGrossSales(values: unknown[]): GrossSalesStructure | number {
  if (values.length >= 2) {
    return {
      current: values[0] || 0,
      projected: values[1] || 0
    } as GrossSalesStructure
  }
  return values[0] as number || 0 
}

/**
 * Classification: Filter out empty objects
 */
function transformClassification(values: unknown[]): Record<string, unknown>[] {
  return values.filter(v => 
    v && 
    typeof v === 'object' && 
    !Array.isArray(v) &&
    Object.keys(v).length > 0
  ) as Record<string, unknown>[]
}

/**
 * EffectiveDate: Take first value (ignore review info)
 */
function transformEffectiveDate(values: unknown[]): string | null {
  return values[0] as string || null
}

/**
 * LineOfBusiness: Take first value (code)
 */
function transformLineOfBusiness(values: unknown[]): string {
  return values[0] as string || ''
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Set value in nested object using dot notation path
 * Example: setNestedValue(obj, 'applicant.mailing_address.city', 'Austin')
 * 
 * @param obj - Target object to modify
 * @param path - Dot-notation path (e.g., 'applicant.name')
 * @param value - Value to set
 */
function setNestedValue(obj: NestedData, path: string, value: unknown): void {
  const keys = path.split('.')
  let current: Record<string, unknown> = obj
  
  // Navigate to parent
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current)) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  
  // Set final value
  const lastKey = keys[keys.length - 1]
  current[lastKey] = value
}

/**
 * Get nested value from object using dot notation path
 * Used for testing/validation
 * 
 * @param obj - Source object
 * @param path - Dot-notation path
 * @returns Value at path or undefined
 */
export function getNestedValue(obj: NestedData, path: string): unknown {
  const keys = path.split('.')
  let current = obj
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key] as NestedData
    } else {
      return undefined
    }
  }
  
  return current
}