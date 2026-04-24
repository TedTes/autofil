/**
 * API client for backend communication.
 */
import axios, { AxiosError, AxiosHeaders } from 'axios'
import type {
  ApiResponse,
  SubmissionResponse,
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
  TemplateLibraryResponse,
  TemplateFillResult, 
  MultipleFillResults,
  FieldCatalog,
  IntegrationPayload,
  IntegrationProvider,
  IntegrationConnection,
  CreateIntegrationConnectionRequest,
  UpdateIntegrationConnectionRequest,
  IntegrationConnectionTestResult,
  IntegrationConnectionTestSendResult,
  IntegrationClientSearchResponse,
  IntegrationSendPreviewResponse,
  IntegrationDestination,
  CreateIntegrationDestinationRequest,
  UpdateIntegrationDestinationRequest,
  IntegrationJob
} from '@/types'

import type { MergedData } from '@/types/merged-data'


import { transformEntities } from './entity-transformer'
import {isCanonicalOutput} from "../lib/utils";
import { supabase } from './supabase'



function resolveApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

  if (typeof window === 'undefined') {
    return configuredUrl
  }

  try {
    const apiUrl = new URL(configuredUrl)
    const appHost = window.location.hostname
    const isLocalApiHost = apiUrl.hostname === 'localhost' || apiUrl.hostname === '127.0.0.1'
    const isLocalAppHost = appHost === 'localhost' || appHost === '127.0.0.1'

    if (isLocalApiHost && !isLocalAppHost) {
      apiUrl.hostname = appHost
      return apiUrl.toString().replace(/\/$/, '')
    }
  } catch {
    return configuredUrl
  }

  return configuredUrl
}

const API_BASE_URL = resolveApiBaseUrl()

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
})

const PUBLIC_API_PATHS = new Set(['/health'])

function getRequestPath(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url, `${API_BASE_URL}/api`).pathname.replace(/^\/api/, '') || '/'
  } catch {
    return url.split('?')[0] || ''
  }
}

api.interceptors.request.use(async (config) => {
  const requestPath = getRequestPath(config.url)
  if (PUBLIC_API_PATHS.has(requestPath)) {
    return config
  }

  if (!supabase) {
    throw new Error('Supabase auth is not configured for API requests')
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('No active session. Please sign in again.')
  }

  const headers = AxiosHeaders.from(config.headers)
  headers.set('Authorization', `Bearer ${session.access_token}`)
  config.headers = headers

  return config
})

/**
 * Centralized error handler
 */
function handleApiError(error: unknown): never {

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
  // Rehydrate the browser File before appending to FormData so
  // landing-staged files survive the auth/route handoff reliably.
  const uploadFile = new File([await file.arrayBuffer()], file.name, {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified,
  })

  const formData = new FormData()
  formData.append('file', uploadFile)
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

  const payload = response.data.data ?? response.data
  const { submission_id, confidence, warnings, data, filename,
    status,
    uploaded_at, field_confidence } = payload
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
 * Fill PDF with extracted data using specified template
 * 
 * @param id - Submission ID
 * @param templateId - Template ID (required)
 * @param options - Optional parameters
 * @returns Complete fill report
 */
export async function fillPdf(
  id: string,
  templateId: string,
  options?: { inputIds?: string[] }
): Promise<FillReport> {
  try {
    // Validate required templateId
    if (!templateId) {
      throw new Error('templateId is required to fill a PDF')
    }

    // Build payload
    const payload = {
      templateId,
      ...(options?.inputIds && options.inputIds.length > 0
        ? { input_ids: options.inputIds }
        : {})
    }

    // Call API
    const response = await api.post(
      `/submissions/${id}/fill`,
      payload
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Fill failed')
    }

    const data = response.data.data!

    // Parse response to FillReport format
    return {
      submission_id: data.submission_id || id,
      success: data.success ?? true,
      filled_fields: data.filled_fields || data.written || 0,
      total_fields: data.total_fields || 0,
      coverage: data.coverage || 0,
      filled_field_details: data.filled_field_details,
      unmapped_fields: data.unmapped_fields || [],
      warnings: data.warnings || [],
      errors: data.errors || [],
      output: {
        filename: data.output?.filename || '',
        url: data.output?.url,
        template_id: data.output?.template_id || templateId,
        generated_at: data.output?.generated_at || new Date().toISOString(),
        storage: data.output?.storage
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('templateId')) {
      throw new Error('Template selection is required')
    }
    if (message.includes('404')) {
      throw new Error('Template not found')
    }
    handleApiError(error)
  }
}

/**
 * Fill multiple templates sequentially for a single submission
 * 
 * Features:
 * - Processes templates one at a time
 * - Continues on error (doesn't stop at first failure)
 * - Returns detailed results for each template
 * - Provides aggregated metrics
 * - Supports progress callbacks
 * 
 * @param submissionId - Submission identifier
 * @param templates - Array of template objects with id and name
 * @param options - Optional parameters
 * @returns Aggregated results for all templates

 */
export async function fillMultipleTemplates(
  submissionId: string,
  templates: Array<{ id: string; name: string }>,
  options?: {
    inputIds?: string[]
    onProgress?: (
      currentIndex: number,
      totalCount: number,
      currentResult: TemplateFillResult
    ) => void
    onTemplateComplete?: (result: TemplateFillResult) => void
    onTemplateStart?: (templateId: string, templateName: string) => void
  }
): Promise<MultipleFillResults> {
  const results: TemplateFillResult[] = []
  let totalFilledFields = 0
  let totalWarnings = 0
  let totalErrors = 0

  // Process each template sequentially
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i]
    const startTime = new Date().toISOString()

    // Initialize result object
    const result: TemplateFillResult = {
      template_id: template.id,
      template_name: template.name,
      status: 'in-progress',
      started_at: startTime
    }

    // Notify start
    options?.onTemplateStart?.(template.id, template.name)

    try {
      // Call fillPdf for this template
      const report = await fillPdf(submissionId, template.id, {
        inputIds: options?.inputIds
      })

      // Update result with success
      result.status = 'success'
      result.report = report
      result.completed_at = new Date().toISOString()

      // Aggregate metrics
      totalFilledFields += report.filled_fields
      totalWarnings += report.warnings.length
      totalErrors += report.errors.length

    } catch (error) {
      // Handle error but continue with next template
      result.status = 'error'
      result.completed_at = new Date().toISOString()
      
      if (error instanceof Error) {
        result.error = error.message
        
        // Categorize error type
        if (error.message.includes('network') || error.message.includes('fetch')) {
          result.error_type = 'network'
        } else if (error.message.includes('template') || error.message.includes('404')) {
          result.error_type = 'validation'
        } else if (error.message.includes('500') || error.message.includes('server')) {
          result.error_type = 'server'
        } else {
          result.error_type = 'unknown'
        }
      } else {
        result.error = 'An unexpected error occurred'
        result.error_type = 'unknown'
      }

      console.error(`Fill failed for template ${template.name}:`, error)
    }

    // Store result
    results.push(result)

    // Notify progress
    options?.onProgress?.(i + 1, templates.length, result)
    
    // Notify completion
    options?.onTemplateComplete?.(result)
  }

  // Calculate success/failure counts
  const successful = results.filter(r => r.status === 'success').length
  const failed = results.filter(r => r.status === 'error').length

  // Return aggregated results
  return {
    submission_id: submissionId,
    total_templates: templates.length,
    successful,
    failed,
    results,
    total_filled_fields: totalFilledFields,
    total_warnings: totalWarnings,
    total_errors: totalErrors
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

export async function getSubmissionPackage(submissionId: string): Promise<ClientSubmissionPackage> {
  try {
    const response = await api.get(`/submissions/${submissionId}/package`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load submission package')
    }
    return response.data.data as ClientSubmissionPackage
  } catch (error) {
    handleApiError(error)
  }
}

export async function updateSubmissionInputInclusion(
  submissionId: string,
  inputId: string,
  included: boolean
): Promise<{ package: ClientSubmissionPackage; mergedData: MergedData | null }> {
  try {
    const response = await api.patch(`/submissions/${submissionId}/inputs/${inputId}/include`, {
      included,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update input inclusion')
    }
    return response.data.data as { package: ClientSubmissionPackage; mergedData: MergedData | null }
  } catch (error) {
    handleApiError(error)
  }
}

export async function updateSubmissionInputsInclusion(
  submissionId: string,
  inputIds: string[],
  included: boolean
): Promise<{ package: ClientSubmissionPackage; mergedData: MergedData | null }> {
  try {
    const response = await api.patch(`/submissions/${submissionId}/inputs/include`, {
      input_ids: inputIds,
      included,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update input inclusion')
    }
    return response.data.data as { package: ClientSubmissionPackage; mergedData: MergedData | null }
  } catch (error) {
    handleApiError(error)
  }
}

export interface SubmissionTemplateSummary {
  id?: string
  template_id: string
  name: string
  description: string
  formType?: string
  version?: string
  expected_documents: string[]
  expectedDocuments?: string[]
  suggested_forms: string[]
  expected_fields: string[]
  templateUrl?: string | null
}

export async function getSubmissionTemplates(): Promise<SubmissionTemplateSummary[]> {
  try {
    const response = await api.get('/clients/templates')
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
    documents_processed: number
    fields_extracted: number
    average_confidence: number
    fields_edited: number
    fields_accepted_without_edits: number
    correction_rate: number
    generated_outputs: number
  }
  status_breakdown: Record<string, number>
  turnaround: {
    average_minutes: number
    sample_size: number
  }
  submission_volume: { date: string; count: number }[]
  top_clients: { client_id?: string; client_name?: string; submissions: number }[]
  by_document_type: Array<{
    document_type: string
    documents: number
    fields_extracted: number
    average_confidence: number
    fields_edited: number
    correction_rate: number
  }>
  weakest_fields: Array<{
    field_key: string
    label: string
    document_type: string
    edit_count: number
    average_confidence: number
  }>
  recent_activity: Array<{
    date: string
    documents_processed: number
    fields_extracted: number
    generated_outputs: number
  }>
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

export async function deleteClient(clientId: string): Promise<void> {
  try {
    const response = await api.delete(`/clients/${clientId}`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete client')
    }
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
 * Fetch the canonical payload that integration adapters will send downstream.
 */
export async function getIntegrationPayload(submissionId: string): Promise<IntegrationPayload> {
  try {
    const response = await api.get(`/submissions/${submissionId}/integration-payload`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load integration payload')
    }
    return response.data.data as IntegrationPayload
  } catch (error) {
    handleApiError(error)
  }
}

export async function getIntegrationProviders(): Promise<IntegrationProvider[]> {
  try {
    const response = await api.get('/integrations/providers')
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load integration providers')
    }
    return response.data.data as IntegrationProvider[]
  } catch (error) {
    handleApiError(error)
  }
}

export async function getIntegrationDestinations(options?: {
  clientId?: string
}): Promise<IntegrationDestination[]> {
  try {
    const response = await api.get('/integrations/destinations', {
      params: options?.clientId ? { client_id: options.clientId } : undefined,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load integration destinations')
    }
    return response.data.data as IntegrationDestination[]
  } catch (error) {
    handleApiError(error)
  }
}

export async function getIntegrationConnections(options?: {
  clientId?: string
}): Promise<IntegrationConnection[]> {
  try {
    const response = await api.get('/integrations/connections', {
      params: options?.clientId ? { client_id: options.clientId } : undefined,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load integration connections')
    }
    return response.data.data as IntegrationConnection[]
  } catch (error) {
    handleApiError(error)
  }
}

export async function createIntegrationDestination(
  payload: CreateIntegrationDestinationRequest
): Promise<IntegrationDestination> {
  try {
    const response = await api.post('/integrations/destinations', payload)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create integration destination')
    }
    return response.data.data as IntegrationDestination
  } catch (error) {
    handleApiError(error)
  }
}

export async function createIntegrationConnection(
  payload: CreateIntegrationConnectionRequest
): Promise<IntegrationConnection> {
  try {
    const response = await api.post('/integrations/connections', payload)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create integration connection')
    }
    return response.data.data as IntegrationConnection
  } catch (error) {
    handleApiError(error)
  }
}

export async function updateIntegrationDestination(
  destinationId: string,
  payload: UpdateIntegrationDestinationRequest
): Promise<IntegrationDestination> {
  try {
    const response = await api.patch(`/integrations/destinations/${destinationId}`, payload)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update integration destination')
    }
    return response.data.data as IntegrationDestination
  } catch (error) {
    handleApiError(error)
  }
}

export async function updateIntegrationConnection(
  connectionId: string,
  payload: UpdateIntegrationConnectionRequest
): Promise<IntegrationConnection> {
  try {
    const response = await api.patch(`/integrations/connections/${connectionId}`, payload)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update integration connection')
    }
    return response.data.data as IntegrationConnection
  } catch (error) {
    handleApiError(error)
  }
}

export async function testIntegrationConnection(
  connectionId: string
): Promise<IntegrationConnectionTestResult> {
  try {
    const response = await api.post(`/integrations/connections/${connectionId}/test`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to test integration connection')
    }
    return response.data.data as IntegrationConnectionTestResult
  } catch (error) {
    handleApiError(error)
  }
}

export async function sendIntegrationConnectionTestEvent(
  connectionId: string
): Promise<IntegrationConnectionTestSendResult> {
  try {
    const response = await api.post(`/integrations/connections/${connectionId}/test-send`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to send integration test event')
    }
    return response.data.data as IntegrationConnectionTestSendResult
  } catch (error) {
    handleApiError(error)
  }
}

export async function searchIntegrationClients(payload: {
  connectionId: string
  query: string
  limit?: number
}): Promise<IntegrationClientSearchResponse> {
  try {
    const response = await api.post('/integrations/search-clients', {
      connection_id: payload.connectionId,
      query: payload.query,
      limit: payload.limit,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to search integration clients')
    }
    return response.data.data as IntegrationClientSearchResponse
  } catch (error) {
    handleApiError(error)
  }
}

export async function previewIntegrationSend(payload: {
  connectionId: string
  submissionId: string
  target?: Record<string, unknown>
  actions?: string[]
}): Promise<IntegrationSendPreviewResponse> {
  try {
    const response = await api.post('/integrations/send-preview', {
      connection_id: payload.connectionId,
      submission_id: payload.submissionId,
      target: payload.target,
      actions: payload.actions,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to preview integration send')
    }
    return response.data.data as IntegrationSendPreviewResponse
  } catch (error) {
    handleApiError(error)
  }
}

export async function sendToIntegration(payload: {
  connectionId: string
  submissionId: string
  target?: Record<string, unknown>
  actions?: string[]
  force?: boolean
}): Promise<IntegrationJob> {
  try {
    const response = await api.post('/integrations/send', {
      connection_id: payload.connectionId,
      submission_id: payload.submissionId,
      target: payload.target,
      actions: payload.actions,
      force: payload.force,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to send integration payload')
    }
    return response.data.data as IntegrationJob
  } catch (error) {
    handleApiError(error)
  }
}

export async function deleteIntegrationDestination(destinationId: string): Promise<void> {
  try {
    const response = await api.delete(`/integrations/destinations/${destinationId}`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete integration destination')
    }
  } catch (error) {
    handleApiError(error)
  }
}

export async function deleteIntegrationConnection(connectionId: string): Promise<void> {
  try {
    const response = await api.delete(`/integrations/connections/${connectionId}`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete integration connection')
    }
  } catch (error) {
    handleApiError(error)
  }
}

export async function getIntegrationJobs(submissionId: string): Promise<IntegrationJob[]> {
  try {
    const response = await api.get(`/integrations/submissions/${submissionId}/jobs`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load integration jobs')
    }
    return response.data.data as IntegrationJob[]
  } catch (error) {
    handleApiError(error)
  }
}

export async function getIntegrationSendJob(jobId: string): Promise<IntegrationJob> {
  try {
    const response = await api.get(`/integrations/send-jobs/${jobId}`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load integration send job')
    }
    return response.data.data as IntegrationJob
  } catch (error) {
    handleApiError(error)
  }
}

export async function getIntegrationSendHistory(options?: {
  submissionId?: string
  connectionId?: string
  provider?: string
  limit?: number
}): Promise<IntegrationJob[]> {
  try {
    const response = await api.get('/integrations/send-history', {
      params: {
        submission_id: options?.submissionId,
        connection_id: options?.connectionId,
        provider: options?.provider,
        limit: options?.limit,
      },
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load integration send history')
    }
    return response.data.data as IntegrationJob[]
  } catch (error) {
    handleApiError(error)
  }
}

export async function retryIntegrationSendJob(jobId: string): Promise<IntegrationJob> {
  try {
    const response = await api.post(`/integrations/send-jobs/${jobId}/retry`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to retry integration send job')
    }
    return response.data.data as IntegrationJob
  } catch (error) {
    handleApiError(error)
  }
}

export async function sendSubmissionToIntegration(
  submissionId: string,
  destinationId: string
): Promise<IntegrationJob> {
  try {
    const response = await api.post(`/integrations/submissions/${submissionId}/send`, {
      destination_id: destinationId,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to send integration payload')
    }
    return response.data.data as IntegrationJob
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Fetch canonical field catalog (parsed from backend YAML).
 */
export async function getFieldCatalog(options?: { refresh?: boolean }): Promise<FieldCatalog> {
  try {
    const response = await api.get('/metadata/fields', {
      params: options?.refresh ? { refresh: '1' } : undefined,
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load field catalog')
    }
    return response.data.data as FieldCatalog
  } catch (error) {
    handleApiError(error)
  }
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

export async function getInputPreviewBlob(
  submissionId: string,
  inputId?: string
): Promise<Blob> {
  try {
    const response = await api.get(`/submissions/${submissionId}/preview-input`, {
      params: inputId ? { input_id: inputId } : undefined,
      responseType: 'blob',
    })
    return response.data
  } catch (error) {
    handleApiError(error)
  }
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
    is_supported?: boolean
    is_insurance_relevant?: boolean
    needs_review?: boolean
    recommended_action?: string
    message?: string
    review_reasons?: string[]
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

export async function previewExtractLandingFile(
  file: File,
  options?: {
    documentType?: string
  },
  onProgress?: (progress: number) => void
): Promise<{
  success: boolean
  file_name: string
  file_size: number
  data: Record<string, unknown>
  confidence: number
  warnings?: string[]
  errors?: string[]
  metadata?: {
    extractor_used?: string
    document_type?: string
    is_preview?: boolean
    [key: string]: unknown
  }
}> {
  const formData = new FormData()
  formData.append('file', file)
  if (options?.documentType) {
    formData.append('document_type', options.documentType)
  }

  const response = await api.post('/extraction/preview', formData, {
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
    throw new Error(response.data.error || 'Preview extraction failed')
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
  candidate_types?: Array<{ document_type: string; confidence: number; votes?: number }>
  classifier_errors?: string[]
  conflict_detected?: boolean
  is_supported?: boolean
  is_insurance_relevant?: boolean
  needs_review?: boolean
  recommended_action?: string
  message?: string
  review_reasons?: string[]
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
  metadata?: {
    document_support?: {
      is_supported?: boolean
      is_insurance_relevant?: boolean
      needs_review?: boolean
      recommended_action?: string
      message?: string
      review_reasons?: string[]
    }
    review_required?: boolean
    recommended_action?: string
    review_reasons?: string[]
    low_confidence_field_count?: number
    low_confidence_fields?: Array<{ field_id: string; confidence: number }>
    validation_warning_count?: number
    [key: string]: unknown
  }
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


/**
 * Delete an individual input file from a submission package
 * 
 * @param submissionId - The submission/package ID
 * @param inputId - The specific input file ID to delete
 * @throws Error if deletion fails or file not found
 */
export async function deleteInput(
  submissionId: string,
  inputId: string
): Promise<void> {
  try {
    const response = await api.delete(
      `/submissions/${submissionId}/inputs/${inputId}`
    )
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete input file')
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error('Input file not found')
    }
    handleApiError(error)
  }
}

/**
 * Delete an individual output file from a submission package
 * 
 * @param submissionId - The submission/package ID
 * @param outputId - The specific output file ID to delete
 * @throws Error if deletion fails or file not found
 */
export async function deleteOutput(
  submissionId: string,
  outputId: string
): Promise<void> {
  try {
    const response = await api.delete(
      `/submissions/${submissionId}/outputs/${outputId}`
    )
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete output file')
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error('Output file not found')
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
    const response = await api.post('/bulk/export-zip', { submission_ids: submissionIds }, { responseType: 'blob' })
    return response.data
  } catch (error) {
    handleApiError(error)
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
        name: (sub as { name?: string }).name || sub.filename || `Submission ${(sub.submission_id || '').slice(0, 8)}`,
        template_type: (sub as { template_type?: string }).template_type,
        template_metadata: (sub as { template_metadata?: RecentSubmission['template_metadata'] }).template_metadata,
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
    
    const sub: Partial<RecentSubmissionFile & { client_id?: string }> = response.data.data
    
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
      name: (sub as { name?: string }).name || sub.filename || `Submission ${(sub.submission_id || '').slice(0, 8)}`,
      template_type: (sub as { template_type?: string }).template_type,
      template_metadata: (sub as { template_metadata?: RecentSubmission['template_metadata'] }).template_metadata,
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
