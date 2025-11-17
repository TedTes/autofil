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
    extraction: {
      confidence: number
      warnings: string[]
      data: unknown
    }
  }
  
  export interface FillResponse {
    submission_id: string
    written?:number | 0
    skipped? : number | 0
    coverage?:number;
    unmapped_fields?:string[];
    warnings?:string[];
    errors?:string[];
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