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
  FillReport,
  ExtractionData,
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
 * Centralized error handler
 */
function handleApiError(error: unknown): never {
  console.log('handleApiError log', error)

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiResponse>
    if (axiosError.response) {
      const message =
        axiosError.response.data?.error ||
        axiosError.response.data?.message ||
        'Server error'
      throw new Error(message)
    } else if (axiosError.request) {
      throw new Error('No response from server. Please check your connection.')
    } else {
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
  } catch {
    return false
  }
}

/**
 * Upload PDF and extract data.
 */
export async function uploadPdf(
  file: File,
  onProgress?: (progress: number) => void
): Promise<SubmissionResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post('/submissions/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        )
        onProgress(progress)
      }
    },
  })

  if (!response.data.success) {
    throw new Error(response.data.error || 'Upload failed')
  }

  const { submission_id, extraction } = response.data
  return { submission_id: submission_id!, extraction: extraction! }
}

/**
 * Upload multiple PDFs.
 */
export async function uploadMultiplePdfs(
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void
): Promise<SubmissionResponse[]> {
  const results: SubmissionResponse[] = []
  for (let i = 0; i < files.length; i++) {
    const result = await uploadPdf(files[i], (progress) =>
      onProgress?.(i, progress)
    )
    results.push(result)
  }
  return results
}

/**
 * Get submission by ID.
 */
export async function getSubmission(id: string): Promise<ExtractionData> {
  const response = await api.get(`/submissions/${id}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get submission')
  }

  const submission = response.data.submission
  if (!submission) throw new Error('Submission not found in response')

  return {
    submission_id: submission.submission_id,
    filename: submission.filename,
    status: submission.status,
    uploaded_at: submission.uploaded_at,
    confidence: submission.confidence,
    warnings: submission.warnings,
    data: submission.data,
  }
}

/**
 * Fill PDF with data.
 */
export async function fillPdf(id: string): Promise<FillReport> {
  const response = await api.post<ApiResponse<FillResponse>>(
    `/submissions/${id}/fill`
  )
  if (!response.data.success) {
    throw new Error(response.data.error || 'Fill failed')
  }

  const { fill_report, download_url } = response.data.data!
  return { ...fill_report, downloadUrl: download_url! }
}

/**
 * Fill multiple PDFs.
 */
export async function fillMultiplePdfs(ids: string[]): Promise<FillReport[]> {
  const results: FillReport[] = []
  for (const id of ids) {
    results.push(await fillPdf(id))
  }
  return results
}

/**
 * Download filled PDF.
 */
export async function downloadPdf(
  id: string,
  filename?: string
): Promise<void> {
  const response = await api.get(`/submissions/${id}/download`, {
    responseType: 'blob',
  })

  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename || 'ACORD_126_filled.pdf')
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/**
 * Check backend availability.
 */
export async function checkBackendAvailability(): Promise<{
  available: boolean
  message: string
}> {
  const isHealthy = await healthCheck()
  return {
    available: isHealthy,
    message: isHealthy ? 'Backend is available' : 'Backend is not responding',
  }
}

// ========================================
// FOLDER OPERATIONS
// ========================================

export async function getFolders(): Promise<Folder[]> {
  const response = await api.get('/folders')
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get folders')
  }
  return response.data.folders || []
}

export async function createFolder(name: string): Promise<Folder> {
  const response = await api.post('/folders', { name })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to create folder')
  }
  return response.data.folder
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const response = await api.put<ApiResponse<{ folder: Folder }>>(
    `/folders/${id}`,
    { name }
  )
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to rename folder')
  }
  return response.data.data!.folder
}

export async function getFolder(id: string): Promise<Folder> {
  const response = await api.get(`/folders/${id}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get folder')
  }
  return response.data.folder
}

export async function deleteFolder(id: string): Promise<void> {
  const response = await api.delete<ApiResponse>(`/folders/${id}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to delete folder')
  }
}

export async function uploadPdfToFolder(
  folderId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<SubmissionResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder_id', folderId)

  const response = await api.post('/submissions/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        )
        onProgress(progress)
      }
    },
  })

  if (!response.data.success) {
    throw new Error(response.data.error || 'Upload failed')
  }

  return {
    submission_id: response.data.submission_id,
    extraction: response.data.extraction,
  }
}

export async function uploadMultiplePdfsToFolder(
  folderId: string,
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void
): Promise<SubmissionResponse[]> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files[]', file))
  formData.append('folder_id', folderId)

  // Note: No per-file progress in batch upload
  const response = await api.post('/submissions/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  if (!response.data.success) {
    throw new Error(response.data.error || 'Upload failed')
  }

  return response.data.data || []
}

export async function batchFillPdfs(
  submissionIds: string[]
): Promise<FillResponse[]> {
  const response = await api.post('/submissions/batch-fill', {
    submission_ids: submissionIds,
  })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Batch fill failed')
  }
  return response.data.results || []
}

export function getInputPreviewUrl(submissionId: string): string {
  return `${API_BASE_URL}/api/submissions/${submissionId}/preview-input`
}

export function getOutputPreviewUrl(submissionId: string): string {
  return `${API_BASE_URL}/api/submissions/${submissionId}/preview-output`
}

// ========================================
// EXTRACTION OPERATIONS
// ========================================

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
  const formData = new FormData()
  formData.append('file', file)
  if (options?.autoClassify !== undefined)
    formData.append('auto_classify', options.autoClassify.toString())
  if (options?.autoExtract !== undefined)
    formData.append('auto_extract', options.autoExtract.toString())
  if (options?.folderId) formData.append('folder_id', options.folderId)

  const response = await api.post('/extraction/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        )
        onProgress(progress)
      }
    },
  })

  if (!response.data.success) {
    throw new Error(response.data.error || 'Upload failed')
  }
  return response.data.data
}

export async function uploadBatchForExtraction(
  files: File[],
  options?: { autoClassify?: boolean; groupId?: string },
  onProgress?: (progress: number) => void
): Promise<{
  files: Array<{ file_id: string; file_name: string; classification?: string }>
  total_files: number
  successful_uploads: number
  failed_uploads: number
}> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  if (options?.autoClassify !== undefined)
    formData.append('auto_classify', options.autoClassify.toString())
  if (options?.groupId) formData.append('group_id', options.groupId)

  const response = await api.post('/extraction/upload-batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        )
        onProgress(progress)
      }
    },
  })

  if (!response.data.success) {
    throw new Error(response.data.error || 'Batch upload failed')
  }
  return response.data.data
}

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
  const response = await api.post('/extraction/classify', { file_id: fileId })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Classification failed')
  }
  return response.data.data
}

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
  const response = await api.post('/extraction/extract', {
    file_id: fileId,
    document_type: options?.documentType,
    extraction_options: options?.extractionOptions,
  })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Extraction failed')
  }
  return response.data.data
}

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
  const response = await api.post('/extraction/fuse', request)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Fusion failed')
  }
  return response.data.data
}

export async function getExtractionJobStatus(jobId: string): Promise<{
  job_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  result?: unknown
  error?: string
  created_at: string
  updated_at: string
}> {
  const response = await api.get(`/extraction/jobs/${jobId}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get job status')
  }
  return response.data.data
}

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
  const response = await api.get(`/extraction/${extractionId}/diagnostics`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get diagnostics')
  }
  return response.data.data
}

export async function getSupportedFormats(): Promise<{
  file_types: string[]
  document_types: Array<{ value: string; label: string }>
  extractors: Array<{ name: string; supported_types: string[]; description: string }>
  parsers: Array<{ name: string; supported_extensions: string[]; description: string }>
}> {
  const response = await api.get('/extraction/formats')
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get formats')
  }
  return response.data.data
}

export async function downloadExtractionResult(
  extractionId: string,
  filename?: string
): Promise<void> {
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
}

export async function deleteExtractionFile(fileId: string): Promise<void> {
  const response = await api.delete(`/extraction/files/${fileId}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to delete file')
  }
}

export async function cancelExtractionJob(jobId: string): Promise<void> {
  const response = await api.post(`/extraction/jobs/${jobId}/cancel`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to cancel job')
  }
}

export async function extractBatchDocuments(
  requests: Array<{
    file_id: string
    document_type?: string
    extraction_options?: Record<string, unknown>
  }>
): Promise<
  Array<{
    file_id: string
    success: boolean
    data?: Record<string, unknown>
    confidence?: number
    error?: string
  }>
> {
  const response = await api.post('/extraction/batch-extract', { requests })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Batch extraction failed')
  }
  return response.data.results
}

export async function getBatchExtractionStatus(batchId: string): Promise<{
  batch_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_files: number
  completed: number
  failed: number
  results: Array<{ file_id: string; status: string; error?: string }>
}> {
  const response = await api.get(`/extraction/batch/${batchId}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get batch status')
  }
  return response.data.data
}

export async function downloadBatchResults(
  batchId: string,
  filename?: string
): Promise<void> {
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
}

export async function getSubmissionData(submissionId: string): Promise<{
  data: Record<string, unknown>
  confidence: number
  field_confidence: Record<string, number>
  warnings?: string[]
}> {
  const response = await api.get(`/submissions/${submissionId}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get submission')
  }
  const s = response.data.submission
  return {
    data: s.data || {},
    confidence: s.confidence || 0,
    field_confidence: s.field_confidence || {},
    warnings: s.warnings || [],
  }
}

export async function updateSubmission(
  submissionId: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; message?: string }> {
  const response = await api.put(`/submissions/${submissionId}`, { data })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to update submission')
  }
  return { success: true, message: response.data.message }
}

export async function exportFilledPdf(submissionId: string): Promise<Blob> {
  const response = await api.post(
    `/submissions/${submissionId}/export`,
    {},
    { responseType: 'blob' }
  )
  return response.data
}

export async function exportSingleSubmission(submissionId: string): Promise<Blob> {
  return exportFilledPdf(submissionId)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export interface SubmissionListItem {
  submission_id: string
  filename: string
  client_name?: string
  status: 'ready' | 'extracted' | 'filled'
  confidence?: number
  uploaded_at: string
  file_size?: number
  file_type?: string
}

export async function getAllSubmissions(): Promise<SubmissionListItem[]> {
  const response = await api.get('/submissions')
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch submissions')
  }
  return response.data.submissions || []
}

export async function bulkExportSubmissions(submissionIds: string[]): Promise<{
  success: boolean
  results: { id: string; success: boolean; error?: string }[]
}> {
  const response = await api.post('/submissions/bulk/export', {
    submission_ids: submissionIds,
  })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Bulk export failed')
  }
  return {
    success: true,
    results: response.data.results || [],
  }
}

export async function bulkDeleteSubmissions(submissionIds: string[]): Promise<void> {
  try {
    await api.delete('/submissions/bulk/delete', { data: { submission_ids: submissionIds } })
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.warn('Bulk delete endpoint not implemented')
      return
    }
    handleApiError(error)
  }
}

export async function deleteSubmission(id: string): Promise<void> {
  try {
    await api.delete(`/submissions/${id}`)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.warn('Delete endpoint not implemented')
      return
    }
    handleApiError(error)
  }
}

export function downloadZip(blob: Blob, filename: string = 'exported_files.zip'): void {
  downloadBlob(blob, filename)
}