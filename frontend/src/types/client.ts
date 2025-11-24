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
    submissions_detailed?: ClientSubmissionPackage[]  // Populated submissions
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

  export interface ClientSubmissionPackage {
    submission_id: string
    client_id: string
    name: string
    status: string
    uploaded_at: string
    updated_at: string
    file_count: number
    inputs: SubmissionInputFile[]
    outputs: SubmissionOutputFile[]
  }

  export interface SubmissionInputFile {
    input_id?: string
    filename: string
    path?: string
    url?: string | null
    file_size?: number
    extraction_status?: 'extracted' | 'extracting' | 'error'
    uploaded_at: string
  }

  export interface SubmissionOutputFile {
    filename: string
    path?: string
    url?: string | null
    generated_at?: string
  }
