/**
 * Folder types for file organization.
 */
import { SubmissionDetail } from "./api";


export interface IFolderInputFiles {
    submission_id: string;
    filename: string;
    uploaded_at: string;
    status: string;
    confidence?:number;
}
export interface Folder {
  id?: string;  // Keep for frontend compatibility
  folder_id: string;  // Backend uses this
  name: string;
  created_at: string;
  file_count: number;
  submissions?: IFolderInputFiles[]
  submissions_detailed?: SubmissionDetail[]
}

export interface InputFile {
  id: string
  folder_id: string
  filename: string
  size: number
  status: 'uploading' | 'uploaded' | 'extracting' | 'ready' | 'error' | 'filled'
  uploadedAt: string
  confidence?: number
  document_type?: string
  progress?: number
  progressMessage?: string  // "Uploading file...", "Extracting data...", etc.
}
export type UploadedRow = {
  submissionId: string
  filename: string
  uploadedAt: string
  fileType: 'pdf' | 'excel' | 'csv' | 'other'
  status?: 'totalFiles' | 'totalFiles' | 'statusFile' | 'extractedFile' | 'outputFile' | 'uploaded' | 'extracting' | 'error' | 'uploading' | 'extracted'
  fileSize: number
  uploadPercent: number
  extractionStatus: 'pending' | 'extracted' | 'error'
  extractionProgress: number
  extractionError?: string
  confidence?: number
  extractionData?: Record<string, unknown>
}
  export interface OutputFile {
    id: string
    folderId: string
    inputFileId: string
    inputFilename: string
    filename: string
    size: number
    status: 'generating' | 'ready' | 'error' | 'filled'
    generatedAt: string
    fieldsWritten?: number
    fieldsSkipped?: number
  }
