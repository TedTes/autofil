/**
 * TypeScript types for submission data.
 */
import { Submission, SubmissionFile } from './client'

export interface CardSubmission {
  id: string
  folderId: string
  filename: string
  status: 'uploaded' | 'extracted' | 'filled'
  confidence?: number
  warnings?: string[]
  data?: unknown
  outputFilename?: string
}


/**
 * Type definitions for Recent Submissions feature
 * This extends the existing submission types to support the "Recently Saved" dashboard section
 */



/**
 * Recent submission with aggregated metadata for dashboard display
 */
export interface RecentSubmission {
  submission_id: string
  client_id: string
  name: string
  template_type?: 'property_renewal' | 'wc_quote' | 'gl_new_business' | 'custom'
  created_at: string
  updated_at: string
  status: 'created' | 'uploading' | 'extracting' | 'ready' | 'filled' | 'error' | 'extracted' | 'uploaded'
  
  // Aggregated file info
  file_count: number
  files: RecentSubmissionFile[]
  
  // Computed properties for UI
  document_types_present: string[]  // e.g., ['ACORD 126', 'Loss Run', 'SOV']
  missing_document_types?: string[] // e.g., ['Financial Statement']
  completion_percentage: number      // 0-100
  has_errors: boolean
  last_activity: string              // Human-readable, e.g., "2 hours ago"
}

/**
 * Simplified file info for recent submissions list
 */
export interface RecentSubmissionFile {
  file_id: string
  filename: string
  status: 'uploading' | 'uploaded' | 'extracting' | 'ready' | 'error' | 'extracted' | 'filled'
  document_type?: string             // e.g., 'ACORD_126', 'LOSS_RUN', 'SOV'
  confidence?: number
  uploaded_at: string
  last_activity_at?:string
  last_edited_at?:string
  updated_at?:string;
  submission_id:string
  filled_at?:string
  folder_id?:string
}

/**
 * Query parameters for fetching recent submissions
 */
export interface RecentSubmissionsQuery {
  limit?: number                     // Default: 5
  include_files?: boolean            // Default: true
  status_filter?: Submission['status'][]
  sort_by?: 'updated_at' | 'created_at'
  sort_order?: 'asc' | 'desc'
}

/**
 * API response for recent submissions endpoint
 */
export interface RecentSubmissionsResponse {
  success: boolean
  data: RecentSubmission[]
  total_count: number
  error?: string
}

/**
 * Status badge configuration for UI
 */
export interface SubmissionStatusBadge {
  status: Submission['status']
  label: string
  color: 'gray' | 'blue' | 'purple' | 'green' | 'red' | 'yellow'
  icon: string  // Icon name for lucide-react
}

/**
 * Lightweight submission list item returned from /api/submissions/list
 */
export interface SubmissionListItem {
  submission_id: string
  name?: string
  filename: string
  status: Submission['status']
  uploaded_at: string
  confidence?: number
  folder_id?: string
  client_id?: string
  client_name?: string
  input_id?: string
  file_count?: number
}

export interface SubmissionListResponse {
  submissions: SubmissionListItem[]
  total: number
  limit: number
  offset: number
}

export interface SubmissionStats {
  total_submissions: number
  by_status: Record<string, number>
  average_confidence: number
  last_updated: string
}
