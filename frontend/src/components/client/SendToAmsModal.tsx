'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  X,
} from 'lucide-react'
import {
  getIntegrationConnections,
  getIntegrationJobs,
  getIntegrationProviders,
  previewIntegrationSend,
  searchIntegrationClients,
  sendToIntegration,
} from '@/lib/api-client'
import type {
  IntegrationClientSearchResult,
  IntegrationConnection,
  IntegrationJob,
  IntegrationProvider,
  IntegrationSendPreviewResponse,
} from '@/types'

type SendToAmsModalProps = {
  isOpen: boolean
  onClose: () => void
  clientId: string
  submissionId: string
  submissionName?: string
}

function formatDate(value?: string): string {
  if (!value) return 'Not sent yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function jobStatusClass(status: IntegrationJob['status']): string {
  switch (status) {
    case 'succeeded':
      return 'border-green-200 bg-green-50 text-green-700'
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'running':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'partially_succeeded':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700'
  }
}

export default function SendToAmsModal({
  isOpen,
  onClose,
  clientId,
  submissionId,
  submissionName,
}: SendToAmsModalProps) {
  const [providers, setProviders] = useState<IntegrationProvider[]>([])
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [jobs, setJobs] = useState<IntegrationJob[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<IntegrationClientSearchResult[]>([])
  const [selectedTarget, setSelectedTarget] = useState<IntegrationClientSearchResult | null>(null)
  const [sendPreview, setSendPreview] = useState<IntegrationSendPreviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearchingClients, setIsSearchingClients] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const amsConnections = useMemo(
    () => connections.filter((connection) => connection.enabled !== false && connection.type === 'ams'),
    [connections]
  )

  const loadData = useCallback(async () => {
    if (!submissionId) return
    setIsLoading(true)
    setError(null)
    try {
      const [providerRows, connectionRows, jobRows] = await Promise.all([
        getIntegrationProviders(),
        getIntegrationConnections({ clientId }),
        getIntegrationJobs(submissionId),
      ])
      setProviders(providerRows)
      setConnections(connectionRows)
      setJobs(jobRows)
      const activeAmsConnections = connectionRows.filter(
        (connection) => connection.enabled !== false && connection.type === 'ams'
      )
      setSelectedConnectionId((current) => {
        if (current && activeAmsConnections.some((connection) => connection.id === current)) {
          return current
        }
        return activeAmsConnections[0]?.id || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AMS send data')
    } finally {
      setIsLoading(false)
    }
  }, [clientId, submissionId])
  const selectedConnection = useMemo(
    () => amsConnections.find((connection) => connection.id === selectedConnectionId),
    [amsConnections, selectedConnectionId]
  )
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.provider === selectedConnection?.provider),
    [providers, selectedConnection?.provider]
  )
  const requiresTargetClient = Boolean(selectedProvider?.capabilities.requiresTargetClient)

  const handleConnectionSelect = (connectionId: string) => {
    setSelectedConnectionId(connectionId)
    setClientQuery('')
    setClientResults([])
    setSelectedTarget(null)
    setSendPreview(null)
    setError(null)
    setMessage(null)
  }

  const handleClientSearch = async () => {
    if (!selectedConnection) return
    if (clientQuery.trim().length < 2) {
      setError('Enter at least 2 characters to search AMS clients.')
      return
    }
    setIsSearchingClients(true)
    setError(null)
    try {
      const response = await searchIntegrationClients({
        connectionId: selectedConnection.id,
        query: clientQuery,
        limit: 8,
      })
      setClientResults(response.results)
      if (!response.ok && response.message) {
        setError(response.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search AMS clients')
    } finally {
      setIsSearchingClients(false)
    }
  }

  const handlePreviewSend = async () => {
    if (!selectedConnection) return
    if (requiresTargetClient && !selectedTarget) {
      setError('Select a target AMS client before previewing this send.')
      return
    }
    setIsPreviewing(true)
    setError(null)
    setMessage(null)
    try {
      const preview = await previewIntegrationSend({
        connectionId: selectedConnection.id,
        submissionId,
        target: selectedTarget
          ? {
              clientId: selectedTarget.id,
              clientName: selectedTarget.display || selectedTarget.name,
            }
          : undefined,
      })
      setSendPreview(preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview AMS send')
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleConfirmSend = async () => {
    if (!selectedConnection || !sendPreview) return
    if (!sendPreview.ok) {
      setError('Resolve preview warnings before sending.')
      return
    }
    setIsSending(true)
    setError(null)
    setMessage(null)
    try {
      const job = await sendToIntegration({
        connectionId: selectedConnection.id,
        submissionId,
        target: selectedTarget
          ? {
              clientId: selectedTarget.id,
              clientName: selectedTarget.display || selectedTarget.name,
            }
          : undefined,
        actions: sendPreview.actions.map((action) => action.action),
      })
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])
      setMessage(
        job.status === 'succeeded'
          ? 'Submission sent to AMS.'
          : 'AMS send job finished with issues. Review the job result below.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send to AMS')
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    void loadData()
  }, [isOpen, loadData])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Send to AMS</h2>
            <p className="mt-1 text-sm text-gray-500">
              Prepare {submissionName || 'this submission'} for a connected agency management system.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <UserCheck className="mt-0.5 h-4 w-4" />
              <span>{message}</span>
            </div>
          )}

          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">AMS connections</h3>
              <p className="mt-1 text-xs text-gray-500">
                {amsConnections.length} saved connection{amsConnections.length === 1 ? '' : 's'} across {providers.length} providers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-gray-200 py-10">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          ) : amsConnections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-gray-900">No AMS connections yet</p>
              <p className="mt-1 text-xs text-gray-500">Add one in Settings before sending to an AMS.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {amsConnections.map((connection) => (
                <label
                  key={connection.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    selectedConnectionId === connection.id
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="ams-connection"
                    value={connection.id}
                    checked={selectedConnectionId === connection.id}
                    onChange={() => handleConnectionSelect(connection.id)}
                    className="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{connection.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {providers.find((provider) => provider.provider === connection.provider)?.displayName || connection.provider}
                      </p>
                    </div>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600">
                      {connection.connection_status.replace('_', ' ')}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}

          {selectedConnection && (
            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-blue-950">Selected destination</p>
              <p className="mt-1 text-xs text-blue-700">
                {selectedConnection.name} will receive the reviewed canonical submission after target and preview steps.
              </p>
            </div>
          )}

          {selectedConnection && (
            <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Target client</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {requiresTargetClient
                      ? 'This provider requires an existing AMS client before send.'
                      : 'Optional for providers that can create or infer a client.'}
                  </p>
                </div>
                {selectedTarget && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-100">
                    <UserCheck className="h-3.5 w-3.5" />
                    Selected
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={clientQuery}
                  onChange={(event) => setClientQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleClientSearch()
                    }
                  }}
                  placeholder="Search by insured or account name"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => void handleClientSearch()}
                  disabled={isSearchingClients || !selectedConnection}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {isSearchingClients ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </button>
              </div>

              {selectedTarget && (
                <div className="mt-3 rounded-md border border-green-100 bg-green-50 px-3 py-2">
                  <p className="text-sm font-semibold text-green-950">{selectedTarget.display || selectedTarget.name}</p>
                  <p className="mt-1 text-xs text-green-700">AMS client ID: {selectedTarget.id}</p>
                </div>
              )}

              {clientResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {clientResults.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setSelectedTarget(client)
                        setSendPreview(null)
                      }}
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                        selectedTarget?.id === client.id
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900">{client.display || client.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{client.id}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {sendPreview && (
            <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Send preview</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Generated by the backend from canonical submission data and provider capabilities.
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  sendPreview.ok ? 'bg-green-50 text-green-700 ring-1 ring-green-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                }`}>
                  {sendPreview.ok ? 'Ready' : 'Needs attention'}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <PreviewFact label="Insured" value={sendPreview.payload_summary.insured_name || 'Unknown'} />
                <PreviewFact label="Policy" value={sendPreview.payload_summary.policy_number || 'Not found'} />
                <PreviewFact label="Fields" value={String(sendPreview.payload_summary.field_count)} />
                <PreviewFact label="Files" value={String(sendPreview.payload_summary.source_file_count)} />
              </div>

              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-gray-500">Actions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sendPreview.actions.map((action) => (
                    <span
                      key={action.action}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                        action.supported
                          ? 'bg-green-50 text-green-700 ring-green-100'
                          : 'bg-red-50 text-red-700 ring-red-100'
                      }`}
                    >
                      {action.label}
                    </span>
                  ))}
                </div>
              </div>

              {sendPreview.warnings.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
                  {sendPreview.warnings.map((warning) => (
                    <p key={warning} className="text-xs font-semibold text-amber-800">{warning}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900">Recent AMS sends</h3>
            <div className="mt-2 space-y-2">
              {jobs.filter((job) => job.destination_type === 'ams').length === 0 ? (
                <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500">
                  No AMS sends for this submission yet.
                </div>
              ) : (
                jobs
                  .filter((job) => job.destination_type === 'ams')
                  .slice(0, 5)
                  .map((job) => (
                    <div key={job.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {job.destination_name || job.provider}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">{formatDate(job.sent_at || job.created_at)}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${jobStatusClass(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      {job.error_message && <p className="mt-2 text-xs text-red-600">{job.error_message}</p>}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={sendPreview?.ok ? () => void handleConfirmSend() : () => void handlePreviewSend()}
            disabled={
              !selectedConnection ||
              isPreviewing ||
              isSending ||
              (requiresTargetClient && !selectedTarget) ||
              Boolean(sendPreview && !sendPreview.ok)
            }
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            {isPreviewing || isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSending ? 'Sending...' : sendPreview?.ok ? 'Confirm Send' : isPreviewing ? 'Previewing...' : 'Preview Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase text-gray-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}
