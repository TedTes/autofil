export interface IntegrationPayload {
  schema_version: string
  generated_at: string
  submission: {
    submission_id?: string
    client_id?: string
    client_name?: string
    name?: string
    status?: string
    workflow_status?: string
    file_count?: number
    created_at?: string
    updated_at?: string
  }
  review_status: {
    reviewed: boolean
    reviewed_at?: string
    last_edited_at?: string
    last_edited_by?: string
  }
  insured: Record<string, unknown>
  policy: Record<string, unknown>
  coverages: Record<string, unknown>
  operations: Record<string, unknown>
  locations: Record<string, unknown>[]
  loss_history: Record<string, unknown>
  financials: Record<string, unknown>
  source_files: Record<string, unknown>[]
  field_sources: Record<string, unknown>
  confidence: {
    overall?: number
    field_average?: number
    field_count: number
  }
  raw_sections: unknown[]
}

export type IntegrationProviderStatus = 'available' | 'planned' | 'disabled'

export type IntegrationCapabilityValue = boolean | 'limited'

export interface IntegrationAuthField {
  name: string
  label: string
  type: 'text' | 'password' | 'url'
  required: boolean
  helpText?: string
}

export interface IntegrationProvider {
  provider: string
  displayName: string
  category: 'ams' | 'generic'
  status: IntegrationProviderStatus
  authType: string
  description: string
  authConfig: {
    type: string
    fields: IntegrationAuthField[]
  }
  capabilities: {
    supportsClientSearch: IntegrationCapabilityValue
    supportsClientCreate: IntegrationCapabilityValue
    supportsPolicyCreate: IntegrationCapabilityValue
    supportsDocumentAttach: IntegrationCapabilityValue
    supportsActivities: IntegrationCapabilityValue
    supportsStructuredDataSubmit: IntegrationCapabilityValue
    supportsWebhooks: IntegrationCapabilityValue
    requiresTargetClient: boolean
    requiresPartnerAccess: boolean
    requiresAgencySdkLicense: boolean
  }
  supportedActions: string[]
}

export interface IntegrationDestination {
  id: string
  owner_user_id?: string
  client_id: string
  name: string
  type: 'webhook' | 'ams'
  provider: string
  url?: string | null
  auth_type: string
  secret_ref?: string | null
  config: Record<string, unknown>
  auth_config: Record<string, unknown>
  capabilities: Partial<IntegrationProvider['capabilities']>
  connection_status: 'not_configured' | 'configured' | 'valid' | 'invalid'
  last_tested_at?: string | null
  last_error?: string | null
  enabled: boolean
  created_at?: string
  updated_at?: string
}

export type IntegrationConnection = IntegrationDestination

export interface CreateIntegrationDestinationRequest {
  client_id: string
  name: string
  type?: 'webhook' | 'ams'
  provider?: string
  url?: string
  auth_type?: string
  secret_ref?: string
  config?: Record<string, unknown>
  auth_config?: Record<string, unknown>
  capabilities?: Partial<IntegrationProvider['capabilities']>
  connection_status?: IntegrationDestination['connection_status']
  enabled?: boolean
}

export type CreateIntegrationConnectionRequest = CreateIntegrationDestinationRequest

export type UpdateIntegrationDestinationRequest =
  Partial<CreateIntegrationDestinationRequest>

export type UpdateIntegrationConnectionRequest =
  Partial<CreateIntegrationConnectionRequest>

export interface IntegrationConnectionTestResult {
  ok: boolean
  status: IntegrationDestination['connection_status']
  message: string
  provider: string
  connection: IntegrationConnection
}

export interface IntegrationClientSearchResult {
  id: string
  name: string
  display: string
  metadata: Record<string, unknown>
}

export interface IntegrationClientSearchResponse {
  ok: boolean
  provider: string
  query: string
  results: IntegrationClientSearchResult[]
  message?: string | null
}

export interface IntegrationJob {
  id: string
  owner_user_id?: string
  submission_id: string
  destination_id?: string | null
  destination_name?: string
  destination_type: 'webhook' | 'ams'
  provider: string
  status: 'pending' | 'running' | 'succeeded' | 'partially_succeeded' | 'failed'
  attempt_count: number
  idempotency_key: string
  target?: Record<string, unknown>
  actions?: string[]
  request_payload?: Record<string, unknown>
  action_results?: Record<string, unknown>[]
  response_status?: number
  response_body?: Record<string, unknown>
  error_message?: string
  sent_at?: string
  created_at?: string
  updated_at?: string
}
