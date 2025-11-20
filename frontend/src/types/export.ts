/**
 * Export and submission panel types for B11
 */

export interface ExportOptions {
    submission_ids?: string[]
    fields?: string[]
    include_pdfs?: boolean
    include_json?: boolean
    include_csv?: boolean
    pretty?: boolean
  }
  
  export interface WebhookConfig {
    webhook_url: string
    submission_ids?: string[]
    format: 'full' | 'summary' | 'ids_only'
    headers?: Record<string, string>
  }
  
  export interface WebhookResponse {
    success: boolean
    status_code?: number
    response?: string
    error?: string
    sent_at: string
  }
  
  export interface SubmissionSummary {
    submission_id: string
    filename: string
    status: 'uploaded' | 'extracted' | 'filled' | 'exported'
    uploaded_at: string
    confidence?: number
    folder_id?: string
  }
  

  
  export interface ExportManifest {
    export_id: string
    export_timestamp: string
    total_submissions: number
    submissions: Array<{
      submission_id: string
      filename: string
      status: string
      confidence?: number
    }>
    contents: {
      pdfs: number
      json_files: number
      csv_summary: boolean
    }
  }