/**
 * Client and Submission types for hierarchical organization.
 */

export interface Client {
    client_id: string
    name: string
    created_at: string
    updated_at: string
    submission_count: number
    submissions: string[]  // Array of submission IDs
    submissions_detailed?: Submission[]  // Populated submissions
  }
  
  export interface Submission {
    submission_id: string
    client_id: string
    name: string
    template_type?: 'property_renewal' | 'wc_quote' | 'gl_new_business' | 'custom'
    created_at: string
    updated_at: string
    status: 'created' | 'uploading' | 'extracting' | 'ready' | 'filled' | 'error' | 'extracted'
    file_count: number
    files: SubmissionFile[]
  }

  export interface SubmissionFile {
    file_id: string
    filename: string
    uploaded_at: string
    status: 'uploading' | 'uploaded' | 'extracting' | 'ready' | 'error'
    confidence?: number
    document_type?: string
  }