/**
 * Extraction-specific types
 */
export interface ClassificationResult {
  document_type: string
  confidence: number
  indicators: (string | { value: string; text?: string; [key: string]: unknown })[]
  candidate_types?: Array<{ document_type: string; confidence: number; votes?: number }>
  classifier_errors?: string[]
  conflict_detected?: boolean
  is_supported?: boolean
  is_insurance_relevant?: boolean
  needs_review?: boolean
  recommended_action?: 'extract' | 'review_then_extract' | 'manual_review' | 'reject' | string
  message?: string
  review_reasons?: string[]
  keyword_hits?: string[]
  keyword_hit_count?: number
  classifier_results?: Array<{
    classifier: string
    document_type: string
    confidence: number
  }>
  classified_at?: string
}
export interface ExtractionData {
  submission_id: string
  client_id?: string,
  client_name?: string
  folder_id?:string
  input_id?:string
  filename: string
  status: string
  suggested_fixes?:string
  uploaded_at: string
  confidence?: number
  warnings?: string[]
  data?: Record<string, unknown>           // nested object
  field_confidence?: Record<string, number>
  field_hints?: Record<string, string>
  extraction_issues?: Record<string, unknown>
}
 
export interface ExtractionResult {
  success: boolean
  data: Record<string, unknown>
  confidence: number
  warnings?: string[]
  errors?: string[]
  metadata?: {
    extractor_used?: string
    document_type?: string
    extraction_date?: string
    pipeline?: Record<string, unknown>
    document_support?: {
      is_supported?: boolean
      is_insurance_relevant?: boolean
      needs_review?: boolean
      recommended_action?: string
      message?: string
      review_reasons?: string[]
    }
    review_required?: boolean
    recommended_action?: string
    review_reasons?: string[]
    low_confidence_field_count?: number
    low_confidence_fields?: Array<{ field_id: string; confidence: number }>
    validation_warning_count?: number
    classification?: ClassificationResult
    low_confidence_count?: number 
    fields_with_hints?: number
  fields_with_issues?: number
  }
  field_hints?: Record<string, string> 
extraction_issues?: Record<string, string[]>  
suggested_fixes?: Record<string, string>  
  field_confidence?: Record<string, number>  
}
  
  export interface UploadedExtractionFile {
    id: string
    file: File
    name: string
    size: number
    type: string
    uploadProgress: number
    classification?: ClassificationResult
    extractionResult?: ExtractionResult
    status: 'pending' | 'uploading' | 'uploaded' | 'classifying' | 'classified' | 'extracting' | 'extracted' | 'error'
    error?: string
  }
  
  export interface FusionResult {
    success: boolean
    data: {
      submission_id: string
      application?: Record<string, unknown>
      claims_history?: Record<string, unknown>
      property_schedule?: Record<string, unknown>
      financial_information?: Record<string, unknown>
      supplemental_documents?: Array<Record<string, unknown>>
      applicant?: Record<string, unknown>
      fusion_metadata?: Record<string, unknown>
    }
    confidence: number
    warnings?: string[]
    errors?: string[]
  }
  
  export interface ExtractionJob {
    job_id: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    progress: number
    result?: ExtractionResult
    error?: string
    created_at: string
    updated_at: string
  }
  
  export interface DocumentTypeInfo {
    value: string
    label: string
    icon?: string
    color?: string
  }


export interface BatchExtractionRequest {
  file_id: string
  document_type?: string
  extraction_options?: Record<string, unknown>
}

export interface BatchExtractionResult {
  file_id: string
  success: boolean
  data?: Record<string, unknown>
  confidence?: number
  error?: string
  warnings?: string[]
}

export interface BatchExtractionStatus {
  batch_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_files: number
  completed: number
  failed: number
  progress: number
  results: Array<{
    file_id: string
    status: string
    error?: string
  }>
  created_at: string
  updated_at: string
}

// Type definitions for extracted data
export interface ExtractedField {
  field_name: string
  field_value: string 
  confidence?: number
  field_type?: 'text' | 'number' | 'date' | 'select' | 'boolean'
  section?: string
  required?: boolean
  options?: string[] // For select fields
}
export interface MailingAddress {
  street: string
  city: string
  state: string
  zip: string
  country: string
}
export interface ProducerInfo {
  name: string
  location_code: string
  hazard_code: string
  license_number: string
  fein: string
}
export interface DeductibleStructure {
  property_damage: number
  bodily_injury: number
  general_aggregate: number
}
export interface GrossSalesStructure {
  current: number
  projected: number
}
/**
 * Nested data structure that can contain objects, arrays, primitives
 */
export type NestedData = {
  [key: string]: string | number | boolean | null | NestedData | NestedData[] | unknown[]
}

export interface SovProperty {
  location_number?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  building_value?: number
  contents_value?: number
  business_income?: number
  total_value?: number
  construction?: string
  occupancy?: string
  square_feet?: number
  stories?: number
  year_built?: number
  sprinkler?: string
  roof_type?: string
  [key: string]: unknown
}

export interface SovTotals {
  total_locations?: number
  total_building_value?: number
  total_contents_value?: number
  total_business_income?: number
  total_insured_value?: number
  [key: string]: number | undefined
}

export interface SovScheduleData {
  document_type?: 'sov'
  extraction_date?: string
  property_count?: number
  properties?: SovProperty[]
  totals?: SovTotals
  schedule_information?: Record<string, unknown>
  success?: boolean
  warnings?: string[]
  errors?: string[]
  metadata?: Record<string, unknown>
  [key: string]: unknown
}
