/**
 * API client for backend communication.
 */

import axios, { AxiosError } from 'axios'
import type { 
  ApiResponse, 
  SubmissionResponse, 
  FillResponse, 
  SubmissionDetail,
  Folder,
  FillReport
} from '@/types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
})

/**
 * Error handler
 */
function handleApiError(error: unknown): never {
  console.log("handleApiError log")
  console.log(error)
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiResponse>
    
    if (axiosError.response) {
      // Server responded with error
      const message = axiosError.response.data?.error || axiosError.response.data?.message || 'Server error'
      throw new Error(message)
    } else if (axiosError.request) {
      // Request made but no response
      throw new Error('No response from server. Please check your connection.')
    } else {
      // Request setup error
      throw new Error('Failed to make request')
    }
  }
  
  throw new Error('An unexpected error occurred')
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await api.get('/health')
    return response.data.status === 'healthy'
  } catch (error) {
    return false
  }
}

/**
 * Upload PDF and extract data.
 * 
 * @param file - PDF file to upload
 * @param onProgress - Optional progress callback (0-100)
 */
export async function uploadPdf(
  file: File,
  onProgress?: (progress: number) => void
): Promise<SubmissionResponse> {
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post(
      '/submissions/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(progress)
          }
        },
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Upload failed')
    }

    const { submission_id, extraction } = response.data!;
    
    return {
      submission_id: submission_id!,
      extraction: extraction!,
    }
  } catch (error) {
    
    handleApiError(error)
  }
}

/**
 * Upload multiple PDF files.
 * 
 * @param files - Array of PDF files
 * @param onProgress - Optional progress callback per file
 */
export async function uploadMultiplePdfs(
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void
): Promise<SubmissionResponse[]> {
  const results: SubmissionResponse[] = []

  for (let i = 0; i < files.length; i++) {
    const result = await uploadPdf(files[i], (progress) => {
      onProgress?.(i, progress)
    })
    results.push(result)
  }

  return results
}

/**
 * Get submission by ID.
 */
export async function getSubmission(id: string): Promise<SubmissionDetail> {
  try {
    const response = await api.get<ApiResponse<{ submission: SubmissionDetail }>>(
      `/submissions/${id}`
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get submission')
    }

    return response.data.data!.submission
  } catch (error) {
    handleApiError(error)
  }
}



/**
 * Fill PDF with data.
 */
export async function fillPdf(id: string): Promise<FillReport> {
  try {
    const response = await api.post<ApiResponse<FillResponse>>(
      `/submissions/${id}/fill`
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Fill failed')
    }
    const {fill_report,download_url} = response.data.data!;
    return {
      ...fill_report,
      downloadUrl: download_url!,
    }
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Fill multiple PDFs.
 */
export async function fillMultiplePdfs(ids: string[]): Promise<FillReport[]> {
  const results: FillReport[] = []

  for (const id of ids) {
    const result = await fillPdf(id)
    results.push(result)
  }

  return results
}

/**
 * Download filled PDF.
 */
export async function downloadPdf(id: string, filename?: string): Promise<void> {
  try {
    const response = await api.get(`/submissions/${id}/download`, {
      responseType: 'blob',
    })

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename || 'ACORD_126_filled.pdf')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Check if backend is available.
 */
export async function checkBackendAvailability(): Promise<{
  available: boolean
  message: string
}> {
  try {
    const isHealthy = await healthCheck()
    return {
      available: isHealthy,
      message: isHealthy ? 'Backend is available' : 'Backend is not responding',
    }
  } catch (error) {
    return {
      available: false,
      message: 'Cannot connect to backend',
    }
  }
}

// ========================================
// FOLDER OPERATIONS
// ========================================
/**
 * Get all folders.
 */
export async function getFolders(): Promise<Folder[]> {
  try {
    const response = await api.get('/folders')

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get folders')
    }

    return response.data.folders || []
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Create a new folder.
 */
export async function createFolder(name: string): Promise<Folder> {
  try {
    const response = await api.post('/folders', { name })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create folder')
    }

    return response.data.folder 
  } catch (error) {
    handleApiError(error)
  }
}

export async function renameFolder(id: string, name: string) {
  try {
    const response = await api.put<ApiResponse<{ folder: Folder }>>(`/folders/${id}`, { name })
    if (!response.data.success) {
      throw new Error((response.data).error || 'Failed to rename folder')
    }
    // backend returns { success, folder }
    return (response.data as {success:boolean, folder:Folder}).folder as Folder
  } catch (error) {
    handleApiError(error)
  }
}


/**
 * Get folder by ID.
 */
export async function getFolder(id: string): Promise<Folder> {
  try {
    const response = await api.get(`/folders/${id}`)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get folder')
    }

    return response.data.folder
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Delete folder.
 */
export async function deleteFolder(id: string): Promise<void> {
  try {
    const response = await api.delete<ApiResponse>(`/folders/${id}`)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete folder')
    }
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Upload PDF to folder.
 */
export async function uploadPdfToFolder(
  folderId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<SubmissionResponse> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder_id', folderId)

    const response = await api.post( 
      '/submissions/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(progress)
          }
        },
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Upload failed')
    }

    return {
      submission_id: response.data.submission_id,
      extraction: response.data.extraction,
    }
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Upload multiple PDFs to folder.
 */
export async function uploadMultiplePdfsToFolder(
  folderId: string,
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void
): Promise<SubmissionResponse[]> {
  try {
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files[]', file)
    })
    formData.append('folder_id', folderId)

    const response = await api.post(
      '/submissions/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Upload failed')
    }
    const results = response.data.data!;
    return results || []
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Fill multiple PDFs.
 */
export async function batchFillPdfs(submissionIds: string[]): Promise<FillResponse[]> {
  try {
    const response = await api.post(
      '/submissions/batch-fill',
      { submission_ids: submissionIds }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Batch fill failed')
    }
    const {results} = response.data.results;
    return results || []
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Delete a submission.
 */
export async function deleteSubmission(id: string): Promise<void> {
  try {
    await api.delete(`/submissions/${id}`)
  } catch (error) {
    // Ignore 404 errors (endpoint might not exist yet)
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.warn('Delete endpoint not implemented on backend')
      return
    }
    handleApiError(error)
  }
}

/**
 * Get preview URL for a submission's input file.
 */
export function getInputPreviewUrl(submissionId: string): string {
  return `${API_BASE_URL}/api/submissions/${submissionId}/preview-input`
}

/**
 * Get preview URL for a submission's output file.
 */
export function getOutputPreviewUrl(submissionId: string): string {
  return `${API_BASE_URL}/api/submissions/${submissionId}/preview-output`
}

// ========================================
// EXTRACTION OPERATIONS
// ========================================

/**
 * Upload file for extraction (generic - not just ACORD)
 */
export async function uploadFileForExtraction(
  file: File,
  options?: {
    autoClassify?: boolean
    autoExtract?: boolean
    folderId?: string
  },
  onProgress?: (progress: number) => void
): Promise<{
  file_id: string
  file_name: string
  file_size: number
  mime_type: string
  classification?: {
    document_type: string
    confidence: number
    indicators: string[]
  }
}> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    
    if (options?.autoClassify !== undefined) {
      formData.append('auto_classify', options.autoClassify.toString())
    }
    if (options?.autoExtract !== undefined) {
      formData.append('auto_extract', options.autoExtract.toString())
    }
    if (options?.folderId) {
      formData.append('folder_id', options.folderId)
    }

    const response = await api.post(
      '/extraction/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(progress)
          }
        },
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Upload failed')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Upload multiple files for extraction (batch)
 */
export async function uploadBatchForExtraction(
  files: File[],
  options?: {
    autoClassify?: boolean
    groupId?: string
  },
  onProgress?: (progress: number) => void
): Promise<{
  files: Array<{
    file_id: string
    file_name: string
    classification?: string
  }>
  total_files: number
  successful_uploads: number
  failed_uploads: number
}> {
  try {
    const formData = new FormData()
    
    files.forEach((file) => {
      formData.append('files', file)
    })
    
    if (options?.autoClassify !== undefined) {
      formData.append('auto_classify', options.autoClassify.toString())
    }
    if (options?.groupId) {
      formData.append('group_id', options.groupId)
    }

    const response = await api.post(
      '/extraction/upload-batch',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(progress)
          }
        },
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Batch upload failed')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Classify a document (detect document type)
 */
export async function classifyDocument(fileId: string): Promise<{
  document_type: string
  confidence: number
  indicators: string[]
  classifier_results?: Array<{
    classifier: string
    document_type: string
    confidence: number
  }>
}> {
  try {
    const response = await api.post('/extraction/classify', { file_id: fileId })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Classification failed')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Extract data from a document
 */
export async function extractDocument(
  fileId: string,
  options?: {
    documentType?: string
    extractionOptions?: Record<string, unknown>
  }
): Promise<{
  success: boolean
  data: Record<string, unknown>
  confidence: number
  warnings?: string[]
  errors?: string[]
  metadata?: Record<string, unknown>
}> {
  try {
    const response = await api.post('/extraction/extract', {
      file_id: fileId,
      document_type: options?.documentType,
      extraction_options: options?.extractionOptions,
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Extraction failed')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Fuse multiple documents into unified submission
 */
export async function fuseDocuments(request: {
  group_id: string
  file_ids: string[]
  options?: {
    enable_cross_validation?: boolean
    conflict_resolution?: 'highest_confidence' | 'most_recent' | 'primary_source'
    include_source_tracking?: boolean
  }
}): Promise<{
  success: boolean
  data: Record<string, unknown>
  confidence: number
  warnings?: string[]
  errors?: string[]
}> {
  try {
    const response = await api.post('/extraction/fuse', request)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Fusion failed')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Get extraction job status (for async processing)
 */
export async function getExtractionJobStatus(jobId: string): Promise<{
  job_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  result?: unknown
  error?: string
  created_at: string
  updated_at: string
}> {
  try {
    const response = await api.get(`/extraction/jobs/${jobId}`)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get job status')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Get extraction diagnostics
 */
export async function getExtractionDiagnostics(extractionId: string): Promise<{
  extraction_id: string
  document_name: string
  extraction_attempts: Array<{
    parser: string
    success: boolean
    confidence: number
    timestamp: string
    error?: string
  }>
  field_confidence: Record<string, number>
  overall_confidence: number
  processing_time_ms: number
}> {
  try {
    const response = await api.get(`/extraction/${extractionId}/diagnostics`)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get diagnostics')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Get supported file formats and extraction capabilities
 */
export async function getSupportedFormats(): Promise<{
  file_types: string[]
  document_types: Array<{
    value: string
    label: string
  }>
  extractors: Array<{
    name: string
    supported_types: string[]
    description: string
  }>
  parsers: Array<{
    name: string
    supported_extensions: string[]
    description: string
  }>
}> {
  try {
    const response = await api.get('/extraction/formats')

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get formats')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Download extraction result as JSON
 */
export async function downloadExtractionResult(
  extractionId: string,
  filename?: string
): Promise<void> {
  try {
    const response = await api.get(`/extraction/${extractionId}/download`, {
      responseType: 'blob',
    })

    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename || `extraction_${extractionId}.json`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Delete uploaded extraction file
 */
export async function deleteExtractionFile(fileId: string): Promise<void> {
  try {
    const response = await api.delete(`/extraction/files/${fileId}`)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete file')
    }
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Cancel extraction job
 */
export async function cancelExtractionJob(jobId: string): Promise<void> {
  try {
    const response = await api.post(`/extraction/jobs/${jobId}/cancel`)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to cancel job')
    }
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Extract multiple documents in batch
 */
export async function extractBatchDocuments(
  requests: Array<{
    file_id: string
    document_type?: string
    extraction_options?: Record<string, unknown>
  }>
): Promise<Array<{
  file_id: string
  success: boolean
  data?: Record<string, unknown>
  confidence?: number
  error?: string
}>> {
  try {
    const response = await api.post('/extraction/batch-extract', {
      requests,
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Batch extraction failed')
    }

    return response.data.results
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Get batch extraction job status
 */
export async function getBatchExtractionStatus(
  batchId: string
): Promise<{
  batch_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_files: number
  completed: number
  failed: number
  results: Array<{
    file_id: string
    status: string
    error?: string
  }>
}> {
  try {
    const response = await api.get(`/extraction/batch/${batchId}`)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get batch status')
    }

    return response.data.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Download batch extraction results as ZIP
 */
export async function downloadBatchResults(
  batchId: string,
  filename?: string
): Promise<void> {
  try {
    const response = await api.get(`/extraction/batch/${batchId}/download`, {
      responseType: 'blob',
    })

    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename || `batch_extraction_${batchId}.zip`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    handleApiError(error)
  }
}


/**
 * Get submission extraction data with field confidence
 */
export async function getSubmissionData(submissionId: string): Promise<{
  data: Record<string, unknown>
  confidence: number
  field_confidence: Record<string, number>
  warnings?: string[]
}> {
  try {
    const response = await api.get(`/submissions/${submissionId}`)
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get submission')
    }
    
    const submission = response.data.submission
    
    return {
      data: submission.data || {},
      confidence: submission.confidence || 0,
      field_confidence: submission.field_confidence || {},
      warnings: submission.warnings || []
    }
  } catch (error) {
    handleApiError(error)
  }
}


/**
 * Update submission data (extracted fields)
 */
export async function updateSubmission(
  submissionId: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; message?: string }> {
  const response = await fetch(`${API_BASE_URL}/submissions/${submissionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Failed to update submission')
  }

  return response.json()
}


/**
 * Export/Fill PDF with extracted data
 */
export async function exportFilledPdf(submissionId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/submissions/${submissionId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Failed to export PDF')
  }

  return response.blob()
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}