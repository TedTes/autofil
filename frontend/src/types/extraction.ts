/**
 * Extraction-specific types
 */
export interface ClassificationResult {
  document_type: string
  confidence: number
  indicators: (string | { value: string; text?: string; [key: string]: unknown })[]
  classifier_results?: Array<{
    classifier: string
    document_type: string
    confidence: number
  }>
  classified_at?: string
}
export interface ExtractionData {
  submission_id: string
  filename: string
  status: string
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