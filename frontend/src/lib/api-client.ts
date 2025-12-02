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
  RecentSubmissionFile,
  RecentSubmission, 
  RecentSubmissionsQuery,
  Client,
  ClientSubmissionPackage,
  SubmissionListResponse,
  SubmissionListItem,
  SubmissionStats,
  OutputTemplate,
  GenerateOutputsRequest,
  GenerateOutputsResponse,
  TemplateLibraryResponse
} from '@/types'
import type { MergedData } from '@/types/merged-data'


import { transformEntities } from './entity-transformer'
import {isCanonicalOutput} from "../lib/utils";



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
  onProgress?: (progress: number) => void,
  options?: {
    clientId?: string
    submissionId?: string
  }
): Promise<SubmissionResponse> {
  const formData = new FormData()
  formData.append('file', file)
  if (options?.clientId) {
    formData.append('client_id', options.clientId)
  }
  if (options?.submissionId) {
    formData.append('submission_id', options.submissionId)
  }

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

  const { submission_id, confidence,warnings,data,filename,
    status,
    uploaded_at,field_confidence } = response.data
  return { submission_id, confidence,warnings,data,filename,
    status,
    uploaded_at, field_confidence  }
}

/**
 * Upload multiple PDFs.
 */
export async function uploadMultiplePdfs(
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void,
  options?: {
    clientId?: string
    submissionId?: string
  }
): Promise<SubmissionResponse[]> {
  const results: SubmissionResponse[] = []
  for (let i = 0; i < files.length; i++) {
    const result = await uploadPdf(files[i], (progress) =>
      onProgress?.(i, progress),
      options
    )
    results.push(result)
  }
  return results
}

/**
 * Get submission by ID.
 */
export async function getSubmission(
  submissionId: string,
  options?: { inputId?: string }
): Promise<SubmissionResponse> {
  try {
    const response = await api.get(`/submissions/${submissionId}`, {
      params: options?.inputId ? { input_id: options.inputId } : undefined,
    })
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get submission')
    }

    const rawData = response.data.data
  

    if (isCanonicalOutput(rawData)) {
      console.log('📦 Detected CanonicalOutput format, transforming...')
      
      // Transform entities to nested structure
      const transformed = transformEntities(rawData.entities)
      
      return {
        submission_id: rawData.job_id,
        filename: rawData.source.file_name,
        status: 'extracted',
        uploaded_at: rawData.source.extracted_at,
        data: transformed.data,
        confidence: transformed.overall_confidence,
        field_confidence: transformed.field_confidence,
        warnings: transformed.warnings,
        field_hints: {},
        extraction_issues: {}
      }
    }
    
    // ✅ FALLBACK: Legacy format (existing backend response)
    console.log('📦 Using legacy format')
    const s = rawData
    return {
      submission_id: s.submission_id || submissionId,
      filename: s.filename || 'document.pdf',
      status: s.status || 'extracted',
      uploaded_at: s.uploaded_at || new Date().toISOString(),
      data: s.data || {},
      confidence: s.confidence || 0,
      field_confidence: s.field_confidence || {},
      warnings: s.warnings || [],
      field_hints: s.field_hints || {},
      extraction_issues: s.extraction_issues || {}
    }
    
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Fill PDF with data.
 */
export async function fillPdf(
  id: string,
  options?: { inputIds?: string[] }
): Promise<FillReport> {
  const payload =
    options?.inputIds && options.inputIds.length > 0
      ? { input_ids: options.inputIds }
      : {}
  const response = await api.post<ApiResponse<FillResponse>>(
    `/submissions/${id}/fill`,
    payload
  )
  if (!response.data.success) {
    throw new Error(response.data.error || 'Fill failed')
  }
  const {
    coverage,
    errors,
    skipped,
    submission_id,
    unmapped_fields,
    warnings,
    written,
    output,
  } = response.data.data!
  return {
    submission_id,
    written,
    skipped,
    coverage,
    unmapped_fields,
    warnings,
    errors,
    output,
  }
}

/**
 * Fetch clients with optional submission summaries.
 */
export async function getClients(): Promise<Client[]> {
  try {
    const response = await api.get('/clients/')
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load clients')
    }
    return response.data.data as Client[]
  } catch (error) {
    handleApiError(error)
  }
}

export async function getClientById(clientId: string): Promise<Client> {
  try {
    const response = await api.get(`/clients/${clientId}`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load client')
    }
    return response.data.data as Client
  } catch (error) {
    handleApiError(error)
  }
}

export async function getClientSubmissions(clientId: string): Promise<ClientSubmissionPackage[]> {
  try {
    const response = await api.get(`/clients/${clientId}/submissions`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load client submissions')
    }
    return response.data.data as ClientSubmissionPackage[]
  } catch (error) {
    handleApiError(error)
  }
}

export interface SubmissionTemplateSummary {
  template_id: string
  name: string
  description: string
  expected_documents: string[]
  suggested_forms: string[]
  expected_fields: string[]
  template_url?: string | null
}

export async function getSubmissionTemplates(): Promise<SubmissionTemplateSummary[]> {
  try {
    console.log("hey doododood")
    const response = await api.get('/clients/templates')
    console.log(response)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load templates')
    }
    return response.data.data as SubmissionTemplateSummary[]
  } catch (error) {
    handleApiError(error)
  }
}

export interface ReportsSummary {
  totals: {
    total_submissions: number
    completed: number
    success_rate: number
  }
  status_breakdown: Record<string, number>
  turnaround: {
    average_minutes: number
    sample_size: number
  }
  submission_volume: { date: string; count: number }[]
  top_clients: { client_id?: string; client_name?: string; submissions: number }[]
}

export async function getReportsSummary(rangeDays?: number): Promise<ReportsSummary> {
  try {
    const response = await api.get('/submissions/reports/summary', {
      params: { range_days: rangeDays ?? 30 },
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load reports')
    }
    return response.data.data as ReportsSummary
  } catch (error) {
    handleApiError(error)
  }
}

export async function createClientSubmission(
  clientId: string,
  name: string,
  templateType?: string
): Promise<ClientSubmissionPackage> {
  try {
    const response = await api.post(`/clients/${clientId}/submissions`, {
      name,
      template_type: templateType,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create submission')
    }
    return response.data.data as ClientSubmissionPackage
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Create a new client.
 */
export async function createClient(name: string): Promise<Client> {
  try {
    const response = await api.post('/clients/', { name })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create client')
    }
    return response.data.data as Client
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * List submissions with pagination/status filters.
 */
export async function listSubmissions(params?: {
  limit?: number
  offset?: number
  status_filter?: string
}): Promise<SubmissionListResponse> {
  try {
    const response = await api.get('/submissions/list', {
      params: {
        limit: params?.limit ?? 100,
        offset: params?.offset ?? 0,
        status: params?.status_filter,
      },
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load submissions')
    }

    const payload = response.data.data
    return {
      submissions: payload.submissions as SubmissionListItem[],
      total: payload.total,
      limit: payload.limit,
      offset: payload.offset,
    }
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Fetch aggregate submission stats.
 */
export async function getSubmissionStats(): Promise<SubmissionStats> {
  try {
    const response = await api.get('/submissions/stats')
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load stats')
    }
    return response.data.data as SubmissionStats
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Fetch merged data view for a submission package.
 */
export async function getMergedData(submissionId: string): Promise<MergedData> {
  try {
    const response = await api.get(`/submissions/${submissionId}/merged-data`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load merged data')
    }
    return response.data.data as MergedData
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
    results.push(await fillPdf(id))
  }
  return results
}

/**
 * Download filled PDF.
 */
export async function downloadPDF(
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
  return (response.data.data as Folder[]) || []
}

export async function createFolder(name: string): Promise<Folder> {
  const response = await api.post('/folders', { name })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to create folder')
  }
  return response.data.data as Folder
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const response = await api.put(`/folders/${id}`, { name })
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to rename folder')
  }
  return response.data.data as Folder
}

export async function getFolder(id: string): Promise<Folder> {
  const response = await api.get(`/folders/${id}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get folder')
  }
  return response.data.data as Folder
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
  const s = response.data.data
  return {
    data: s.data || {},
    confidence: s.confidence || 0,
    field_confidence: s.field_confidence || {},
    warnings: s.warnings || [],
  }
}

export async function exportFilledPdf(submissionId: string): Promise<Blob> {
  const response = await api.get(`/submissions/${submissionId}/download`, {
    responseType: 'blob',
  })
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

export async function bulkDeleteSubmissions(submissionIds: string[]): Promise<void> {
  try {
    await api.delete('/bulk/delete', { data: { submission_ids: submissionIds } })
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

/**
 * Bulk save submissions to Documents
 * Updates workflow_status to 'saved' for multiple submissions
 */

/**
 * Get all submissions with optional filtering
 */
export async function getAllSubmissions(options?: {
  status?: string | string[]
  limit?: number
  offset?: number
}): Promise<SubmissionListItem[]> {
  try {
    const params = new URLSearchParams()
    
    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      params.append('status', statuses.join(','))
    }
    
    if (options?.limit) {
      params.append('limit', options.limit.toString())
    }
    
    if (options?.offset) {
      params.append('offset', options.offset.toString())
    }

    const queryString = params.toString()
    const url = `/submissions/list${queryString ? `?${queryString}` : ''}`
    
    const response = await api.get(url)
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch submissions')
    }

    return response.data?.data?.submissions || []
  } catch (error) {
    console.error('Get submissions error:', error)
    throw error
  }
}

/**
 * Update submission workflow status
 */
export async function updateSubmissionStatus(
  submissionId: string,
  status: 'uploaded' | 'extracted' | 'reviewing' | 'saved' | 'finalized'
): Promise<{
  success: boolean
  submission_id: string
  workflow_status: string
}> {
  try {
    const response = await api.patch(`/submissions/${submissionId}/status`, {
    workflow_status: status,
  })

  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to update status')
  }
  return response.data
  } catch (error) {
    console.error('Update status error:', error)
    throw error
  }
}

/**
 * Get submission for editing (even if already saved)
 * Returns the extracted data and metadata
 */
export async function getSubmissionForEdit(submissionId: string): Promise<{
  submission_id: string
  filename: string
  uploaded_at: string
  workflow_status: string
  confidence?: number
  data: Record<string, unknown>
  warnings?: string[]
}> {
  try {
    const response = await api.get(`/submissions/${submissionId}`)
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch submission')
    }
    
    return response.data.data
  } catch (error) {
    console.error('Get submission for edit error:', error)
    throw error
  }
}

/**
 * Update submission data after editing
 */
export async function updateSubmissionData(
  submissionId: string,
  data: Record<string, unknown>
): Promise<{
  success: boolean
  submission_id: string
  message: string
}> {
  try {
    const response = await api.patch(`/submissions/${submissionId}/data`, {
      data: data
    })
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update submission')
    }
    
    return response.data
  } catch (error) {
    console.error('Update submission data error:', error)
    throw error
  }
}

/**
 * Bulk export submissions as ZIP file
 * Server creates a ZIP of all filled PDFs
 */
export async function bulkExportAsZip(submissionIds: string[]): Promise<Blob> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bulk/export-zip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        submission_ids: submissionIds,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.blob()
  } catch (error) {
    console.error('Bulk export ZIP error:', error)
    throw error
  }
}




/**
 * Fetch recent submissions for dashboard display
 */
export async function getRecentSubmissions(
  query?: RecentSubmissionsQuery
): Promise<RecentSubmission[]> {
  try {
    const params = new URLSearchParams()
    
    const limit = query?.limit ?? 5
    params.append('limit', limit.toString())
    
    const includeFiles = query?.include_files ?? true
    params.append('include_files', includeFiles.toString())
    
    const sortBy = query?.sort_by ?? 'updated_at'
    params.append('sort_by', sortBy)
    
    const sortOrder = query?.sort_order ?? 'desc'
    params.append('sort_order', sortOrder)
    
    if (query?.status_filter && query.status_filter.length > 0) {
      params.append('status', query.status_filter.join(','))
    }

    const queryString = params.toString()
    const url = `/submissions/recent${queryString ? `?${queryString}` : ''}`
    
    const response = await api.get(url)
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch recent submissions')
    }

    const rawSubmissions: Partial<RecentSubmissionFile & { client_id?: string }>[] = response.data?.data?.submissions || []
    
    const submissions: RecentSubmission[] = rawSubmissions.map(sub => {
      // Use available timestamp fields
      const timestamp = sub.last_activity_at || sub.updated_at || sub.uploaded_at || ''
      
      // Build files array - API returns submission-level data that needs to be converted to file format
      const files: RecentSubmissionFile[] = sub.filename ? [{
        file_id: sub.submission_id || '',
        filename: sub.filename,
        status: (sub.status as RecentSubmissionFile['status']) || 'ready',
        document_type: sub.document_type,
        confidence: sub.confidence,
        uploaded_at: sub.uploaded_at || '',
        submission_id: sub.submission_id || '',
        last_activity_at: sub.last_activity_at,
        updated_at: sub.updated_at,
        filled_at: sub.filled_at,
        folder_id: sub.folder_id,
      }] : []
      
      return {
        submission_id: sub.submission_id || '',
        client_id: sub.client_id || '',
        name: sub.filename || `Submission ${(sub.submission_id || '').slice(0, 8)}`,
        template_type: undefined, 
        created_at: sub.uploaded_at || '',
        updated_at: timestamp,
        status: (sub.status as RecentSubmission['status']) || 'ready',
        file_count: files.length,
        files: files,
        document_types_present: getDocumentTypesPresent(files),
        completion_percentage: calculateCompletionPercentage(sub.status as RecentSubmission['status'], files),
        has_errors: sub.status === 'error',
        last_activity: formatRelativeTime(timestamp),
      }
    })

    return submissions
  } catch (error) {
    console.error('Get recent submissions error:', error)
    throw error
  }
}

/**
 * Helper: Extract unique document types from files
 */
function getDocumentTypesPresent(files: RecentSubmissionFile[]): string[] {
  const types = new Set<string>()
  
  files.forEach(file => {
    if (file.document_type) {
      const label = formatDocumentType(file.document_type)
      if (label) {
        types.add(label)
      }
    }
  })
  
  if (types.size === 0 && files.length > 0) {
    return ['Document']
  }
  
  return Array.from(types).sort()
}

/**
 * Helper: Format document type code to human-readable label
 */
function formatDocumentType(docType: string): string {
  const typeMap: Record<string, string> = {
    'ACORD_126': 'ACORD 126',
    'ACORD_125': 'ACORD 125',
    'ACORD_130': 'ACORD 130',
    'ACORD_140': 'ACORD 140',
    'LOSS_RUN': 'Loss Run',
    'SOV': 'SOV',
    'FINANCIAL_STATEMENT': 'Financial Statement',
    'SUPPLEMENTAL': 'Supplemental',
    'GENERIC': 'Document',
  }
  
  return typeMap[docType] || docType
}

/**
 * Helper: Calculate completion percentage
 */
function calculateCompletionPercentage(
  status: RecentSubmission['status'] | undefined,
  files: RecentSubmissionFile[]
): number {
  if (files.length === 0) {
    return (status === 'ready' || status === 'extracted' || status === 'filled') ? 100 : 0
  }
  
  const completedFiles = files.filter(
    f => f.status === 'ready' || f.status === 'extracted' || f.status === 'filled'
  ).length
  
  return Math.round((completedFiles / files.length) * 100)
}

/**
 * Helper: Format timestamp as relative time
 */
function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return 'Recently'
  
  try {
    const date = new Date(timestamp)
    
    if (isNaN(date.getTime())) {
      return 'Recently'
    }
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    
    if (diffMs < 0) return 'Just now'
    
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  } catch (err) {
    console.error('Error formatting date:', timestamp, err)
    return 'Recently'
  }
}


/**
 * Get a single recent submission by ID with computed metadata
 */
export async function getRecentSubmissionById(
  submissionId: string
): Promise<RecentSubmission> {
  try {
    const response = await api.get(`/submissions/${submissionId}`)
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch submission')
    }
    
    const sub: Partial<RecentSubmissionFile & { client_id?: string }> = response.data.submission
    
    // Use available timestamp fields
    const timestamp = sub.last_activity_at || sub.updated_at || sub.uploaded_at || ''
    
    // Build files array
    const files: RecentSubmissionFile[] = sub.filename ? [{
      file_id: sub.submission_id || '',
      filename: sub.filename,
      status: (sub.status as RecentSubmissionFile['status']) || 'ready',
      document_type: sub.document_type,
      confidence: sub.confidence,
      uploaded_at: sub.uploaded_at || '',
      submission_id: sub.submission_id || '',
      last_activity_at: sub.last_activity_at,
      updated_at: sub.updated_at,
      filled_at: sub.filled_at,
      folder_id: sub.folder_id,
    }] : []
    
      return {
        submission_id: sub.submission_id || '',
        client_id: sub.client_id || '',
      name: sub.filename || `Submission ${(sub.submission_id || '').slice(0, 8)}`,
      template_type: undefined,
      created_at: sub.uploaded_at || '',
      updated_at: timestamp,
      status: (sub.status as RecentSubmission['status']) || 'ready',
      file_count: files.length,
      files: files,
      document_types_present: getDocumentTypesPresent(files),
      completion_percentage: calculateCompletionPercentage(sub.status as RecentSubmission['status'], files),
      has_errors: sub.status === 'error',
      last_activity: formatRelativeTime(timestamp),
    }
  } catch (error) {
    console.error('Get recent submission by ID error:', error)
    throw error
  }
}


/**
 * Fetch available output templates from backend
 */
export async function getTemplateLibrary(): Promise<OutputTemplate[]> {
  try {
    const response = await api.get<TemplateLibraryResponse>('/templates')
    return response.data.templates ?? []
  } catch (error) {
    console.error('Failed to fetch template library:', error)
    throw new Error('Failed to load available templates')
  }
}

/**
 * Fetch single template by ID
 */
export async function getTemplateById(templateId: string): Promise<OutputTemplate> {
  try {
    const response = await api.get<{ template: OutputTemplate; timestamp: string }>(
      `/templates/${templateId}`
    )
    if (!response.data.template) {
      throw new Error('Template not found')
    }
    return response.data.template
  } catch (error) {
    console.error(`Failed to fetch template ${templateId}:`, error)
    throw new Error(`Failed to load template: ${templateId}`)
  }
}

/**
 * Fetch templates filtered by form type
 */
export async function getTemplatesByFormType(formType: string): Promise<OutputTemplate[]> {
  try {
    const response = await api.get<TemplateLibraryResponse>('/templates', {
      params: { formType }
    })
    return response.data.templates ?? []
  } catch (error) {
    console.error(`Failed to fetch templates for ${formType}:`, error)
    throw new Error(`Failed to load templates for form type: ${formType}`)
  }
}

export async function generateOutputs(
  packageOrPayload: string | GenerateOutputsRequest,
  templateIds?: string[],
  customMergedData?: Record<string, unknown>
): Promise<GenerateOutputsResponse> {
  try {
    const packageId =
      typeof packageOrPayload === 'string' ? packageOrPayload : packageOrPayload.packageId
    const payload =
      typeof packageOrPayload === 'string'
        ? {
            templateIds: templateIds ?? [],
            customMergedData,
          }
        : {
            templateIds: packageOrPayload.templateIds,
            customMergedData: packageOrPayload.customMergedData,
          }
    const response = await api.post(`/submissions/${packageId}/fill`, payload)
    const data = response.data?.data
    if (!data) throw new Error('Failed to generate outputs')
    return data as GenerateOutputsResponse
  } catch (error) {
    handleApiError(error)
  }
}
/**
 * Download generated output file
 */
export async function downloadOutput(
  packageId: string,
  filename: string
): Promise<void> {
  try {
    const response = await api.get(
      `/api/submissions/${packageId}/outputs/${filename}`,
      { responseType: 'blob' }
    )
    
    // Create download link
    const url = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to download output:', error)
    throw new Error('Failed to download file')
  }
}
