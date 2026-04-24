/**
 * API response types.
 */

export interface ApiResponse<T=unknown> {
    success: boolean
    data?: T
    error?: string
    message?: string
  }
  
  export interface SubmissionResponse {
    submission_id: string
    filename: string
    status: string
    uploaded_at: string
    data: Record<string, unknown>
    confidence: number
    field_confidence: Record<string, number>
    warnings: string[]
    field_hints?: Record<string, string>
    extraction_issues?: Record<string, unknown>,
    document_type?:string
    upload_index?: number
  }
  
  export interface FillResponse {
    submission_id: string
    written?: number
    skipped?: number
    coverage?: number
    unmapped_fields?: string[]
    warnings?: string[]
    errors?: string[]
    output?: {
      filename?: string
      url?: string
      template_id?: string
      generated_at?: string
    }
  }
  export interface SubmissionDetail {
    submission_id: string
    filename: string
    status: 'extracted' | 'filled'
    uploaded_at: string
    confidence?: number
    warnings?: string[]
    data?: unknown
  }



  /**
 * Fill Report Types
 * 
 * Types for the new /api/submissions/:id/fill endpoint response.
 * Represents detailed fill operation results including coverage, warnings, and errors.
 */

/**
 * Source information for a filled field
 */
export interface FieldSource {
  page?: number
  field_name?: string
  extraction_method?: string
}

/**
 * Information about a successfully filled field
 */
export interface FilledField {
  field_id: string
  field_name: string
  value: unknown
  confidence?: number
  source?: FieldSource
}

/**
 * Information about an unmapped field (exists in data but no template mapping)
 */
export interface UnmappedField {
  field_id: string
  canonical_name: string
  value: unknown
  reason?: string
}

/**
 * Warning message from fill operation
 */
export interface FillWarning {
  field_id?: string
  field_name?: string
  message: string
  severity?: 'low' | 'medium' | 'high'
  confidence?: number
  value?: unknown
  source_document?: string | null
  reason?: string
}

/**
 * Error message from fill operation
 */
export interface FillError {
  field_id?: string
  field_name?: string
  message: string
  error_type?: string
}

/**
 * Metadata about the generated output file
 */
export interface FillOutputMetadata {
  filename: string
  url?: string | null
  template_id: string
  generated_at: string
  storage?: {
    bucket?: string
    key?: string
    public_url?: string
  }
}

/**
 * Complete fill report returned from backend
 */
export interface FillReport {
  submission_id: string
  success: boolean
  
  // Field statistics
  filled_fields: number
  total_fields: number
  coverage: number  // Percentage (0-100)
  
  // Detailed field information
  filled_field_details?: FilledField[]
  unmapped_fields: UnmappedField[]
  
  // Issues
  warnings: FillWarning[]
  errors: FillError[]
  
  // Output file metadata
  output: FillOutputMetadata
}

/**
 * Status of a template fill operation
 */
export type TemplateFillStatus = 
  | 'pending'      // Not started yet
  | 'in-progress'  // Currently filling
  | 'success'      // Completed successfully
  | 'error'        // Failed with error

/**
 * Result of filling a single template
 * Combines FillReport with status tracking
 */
export interface TemplateFillResult {
  template_id: string
  template_name: string
  status: TemplateFillStatus
  
  // Present when status is 'success'
  report?: FillReport
  
  // Present when status is 'error'
  error?: string
  error_type?: 'network' | 'validation' | 'server' | 'unknown'
  
  // Timestamps
  started_at?: string
  completed_at?: string
}

/**
 * Aggregated results from filling multiple templates
 */
export interface MultipleFillResults {
  submission_id: string
  total_templates: number
  successful: number
  failed: number
  results: TemplateFillResult[]
  
  // Overall metrics
  total_filled_fields: number
  total_warnings: number
  total_errors: number
}

/**
 * Request payload for fill endpoint
 */
export interface FillPdfRequest {
  templateId: string  // Required: single template ID
  input_ids?: string[]  // Optional: specific input files to use
}

/**
 * Response from fill endpoint
 */
export interface FillPdfResponse {
  success: boolean
  data: FillReport
  error?: string
}
