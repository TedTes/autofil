/**
 * Workflow types for upload → extract → review → save flow
 */

/**
 * Main workflow steps in the upload/extraction process
 */
export type WorkflowStep = 'upload' | 'extract' | 'review' | 'save'


/**
 * File status throughout the workflow
 */
export type FileWorkflowStatus = 
  | 'pending'        // Just uploaded, not yet processed
  | 'uploading'      // Upload in progress
  | 'uploaded'       // Upload complete
  | 'extracting'     // Extraction in progress
  | 'extracted'      // Extraction complete, ready for review
  | 'reviewing'      // User is reviewing/editing
  | 'saving'         // Saving to Documents in progress
  | 'saved'          // Saved to Documents section
  | 'error'          // Error occurred

/**
 * Submission status (backend)
 */
export type SubmissionStatus = 
  | 'uploaded'       // File uploaded to backend
  | 'extracted'      // Data extracted, ready for review
  | 'saved'          // Saved to Documents
  | 'finalized'      // Exported/completed

/**
 * File being processed in workflow
 */
export interface WorkflowFile {
  id: string
  file: File
  filename: string
  fileType: 'pdf' | 'csv' | 'excel' | 'other'
  fileSize: number
  status: FileWorkflowStatus
  uploadProgress: number
  
  // Extraction results
  submissionId?: string
  extractedData?: Record<string, unknown>
  confidence?: number
  warnings?: string[]
  
  // Error state
  error?: string
  
  // Timestamps
  uploadedAt?: string
  extractedAt?: string
  savedAt?: string
}

/**
 * Workflow state
 */
export interface WorkflowState {
  currentStep: WorkflowStep
  files: WorkflowFile[]
  selectedFileIds: Set<string>
  hasUnsavedChanges: boolean
  isProcessing: boolean
}

/**
 * Workflow actions
 */
export type WorkflowAction = 
  | { type: 'SET_STEP'; payload: WorkflowStep }
  | { type: 'ADD_FILES'; payload: File[] }
  | { type: 'UPDATE_FILE'; payload: { id: string; updates: Partial<WorkflowFile> } }
  | { type: 'REMOVE_FILE'; payload: string }
  | { type: 'SELECT_FILE'; payload: string }
  | { type: 'DESELECT_FILE'; payload: string }
  | { type: 'SELECT_ALL' }
  | { type: 'DESELECT_ALL' }
  | { type: 'MARK_UNSAVED_CHANGES'; payload: boolean }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'RESET' }

/**
 * Step validation result
 */
export interface StepValidation {
  canProceed: boolean
  reason?: string
}

/**
 * Workflow transitions
 */
export const WORKFLOW_TRANSITIONS: Record<WorkflowStep, WorkflowStep | null> = {
  upload: 'extract',
  extract: 'review',
  review: 'save',
  save: null, // Final step
}

/**
 * File status transitions
 */
export const FILE_STATUS_TRANSITIONS: Record<FileWorkflowStatus, FileWorkflowStatus[]> = {
  pending: ['uploading', 'error'],
  uploading: ['uploaded', 'error'],
  uploaded: ['extracting', 'error'],
  extracting: ['extracted', 'error'],
  extracted: ['reviewing', 'saving', 'error'],
  reviewing: ['saving', 'extracted', 'error'],
  saving: ['saved', 'error'],
  saved: ['reviewing'], // Can re-edit
  error: ['pending', 'uploaded', 'extracted'], // Can retry
}