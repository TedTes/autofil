/**
 * Canonical Output Types
 * Matches backend's CanonicalOutput Pydantic model
 */

/**
 * Source reference - where the value came from in the document
 */
export interface SourceRef {
    page?: number
    row?: number
    col?: number
    text_block_index?: number
    bbox?: [number, number, number, number]  // [x0, y0, x1, y1]
    table_id?: string
    extraction_rule?: string  // e.g. "label_value", "table_row", "pdf_field"
  }
  
  /**
   * Single extracted value with confidence and source
   */
  export interface EntityValue {
    value: unknown  // Can be string, number, object, array, etc.
    confidence: number  // 0.0 to 1.0
    source: SourceRef
    tags: string[]  // e.g. ["primary", "dba", "fillable_pdf"]
  }
  
  /**
   * Metadata about the extraction
   */
  export interface Metadata {
    form_type_detected?: string  // "ACORD_126", "LOSS_RUN", etc.
    line_of_business?: string    // "General Liability", "Property", etc.
    carrier?: string
    submission_type?: string     // "New", "Renewal", "Endorsement"
    schema_version: string       // "1.0"
  }
  
  /**
   * Source file information
   */
  export interface SourceInfo {
    file_name: string
    file_type: 'pdf' | 'excel' | 'csv' | 'docx' | 'image' | 'email'
    extraction_method: string    // "fillable_pdf", "ocr", "table_extraction", etc.
    extracted_at: string         // ISO datetime string
  }
  
  /**
   * Canonical Output - The standardized format from backend extractors
   * This is what ALL extractors return
   */
  export interface CanonicalOutput {
    job_id: string
    source: SourceInfo
    entities: Record<string, EntityValue[]>  // Field ID → Array of EntityValues
    metadata: Metadata
    raw?: Record<string, unknown>  // Optional raw extraction data
  }
  
  /**
   * Type guard to check if response is CanonicalOutput format
   */
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
   * Helper to validate EntityValue structure
   */
  export function isEntityValue(value: EntityValue) {
    return (
      value &&
      typeof value === 'object' &&
      'value' in value &&
      'confidence' in value &&
      typeof value.confidence === 'number' &&
      value.confidence >= 0 &&
      value.confidence <= 1 &&
      'source' in value &&
      'tags' in value &&
      Array.isArray(value.tags)
    )
  }
  
  /**
   * Helper to extract all confidence scores from entities
   */
  export function getAllConfidences(entities: Record<string, EntityValue[]>): number[] {
    const confidences: number[] = []
    
    for (const entityValues of Object.values(entities)) {
      if (Array.isArray(entityValues)) {
        for (const entityValue of entityValues) {
          if (isEntityValue(entityValue)) {
            confidences.push(entityValue.confidence)
          }
        }
      }
    }
    
    return confidences
  }
  
  /**
   * Helper to calculate overall confidence from entities
   */
  export function calculateOverallConfidence(entities: Record<string, EntityValue[]>): number {
    const confidences = getAllConfidences(entities)
    
    if (confidences.length === 0) {
      return 0
    }
    
    const sum = confidences.reduce((acc, conf) => acc + conf, 0)
    return sum / confidences.length
  }
  
  /**
   * Helper to get entity values for a specific field
   */
  export function getEntityValues(
    entities: Record<string, EntityValue[]>,
    fieldId: string
  ): EntityValue[] {
    return entities[fieldId] || []
  }
  
  /**
   * Helper to get first/primary value for a field
   */
  export function getPrimaryValue(
    entities: Record<string, EntityValue[]>,
    fieldId: string
  ): unknown {
    const values = getEntityValues(entities, fieldId)
    return values.length > 0 ? values[0].value : null
  }
  
  /**
   * Helper to get all values for a field (array of actual values, not EntityValues)
   */
  export function getAllValues(
    entities: Record<string, EntityValue[]>,
    fieldId: string
  ): unknown[] {
    const entityValues = getEntityValues(entities, fieldId)
    return entityValues.map(ev => ev.value)
  }
  
  /**
   * Helper to filter out empty/null values
   */
  export function filterEmptyValues(values: unknown[]): unknown[] {
    return values.filter(v => 
      v !== null && 
      v !== undefined && 
      v !== '' && 
      v !== 'N/A' &&
      !(typeof v === 'object' && Object.keys(v).length === 0)
    )
  }