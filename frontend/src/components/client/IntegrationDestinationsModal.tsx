'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {
  createIntegrationDestination,
  deleteIntegrationDestination,
  getIntegrationDestinations,
  getIntegrationJobs,
  sendSubmissionToIntegration,
} from '@/lib/api-client'
import type {
  IntegrationDestination,
  IntegrationJob,
} from '@/types'

type IntegrationDestinationsModalProps = {
  isOpen: boolean
  onClose: () => void
  clientId: string
  submissionId: string
  submissionName?: string
}

type DestinationForm = {
  name: string
  url: string
  auth_type: IntegrationDestination['auth_type']
  secret_ref: string
}

const emptyForm: DestinationForm = {
  name: '',
  url: '',
  auth_type: 'none',
  secret_ref: '',
}

type ProviderTile = {
  id: string
  name: string
  description: string
  status: 'available' | 'coming_soon'
}

const providerTiles: ProviderTile[] = [
  {
    id: 'applied-epic',
    name: 'Applied Epic',
    description: 'OAuth connection planned for agency account and policy workflows.',
    status: 'coming_soon',
  },
  {
    id: 'ams360',
    name: 'Vertafore AMS360',
    description: 'OAuth/API connection planned for AMS360 agency records.',
    status: 'coming_soon',
  },
  {
    id: 'hawksoft',
    name: 'HawkSoft',
    description: 'Connection placeholder for HawkSoft agencies.',
    status: 'coming_soon',
  },
  {
    id: 'ezlynx',
    name: 'EZLynx',
    description: 'Connection placeholder for EZLynx workflows.',
    status: 'coming_soon',
  },
  {
    id: 'applied-tam',
    name: 'Applied TAM',
    description: 'Legacy Applied TAM support placeholder.',
    status: 'coming_soon',
  },
  {
    id: 'qqcatalyst',
    name: 'QQCatalyst',
    description: 'Vertafore QQCatalyst support placeholder.',
    status: 'coming_soon',
  },
]

function formatDate(value?: string): string {
  if (!value) return 'Not sent yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function statusClass(status: IntegrationJob['status']): string {
  switch (status) {
    case 'succeeded':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'running':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

export default function IntegrationDestinationsModal({
  isOpen,
  onClose,
  clientId,
  submissionId,
  submissionName,
}: IntegrationDestinationsModalProps) {
  const [destinations, setDestinations] = useState<IntegrationDestination[]>([])
  const [jobs, setJobs] = useState<IntegrationJob[]>([])
  const [selectedDestinationId, setSelectedDestinationId] = useState<string>('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState<DestinationForm>(emptyForm)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const enabledDestinations = useMemo(
    () => destinations.filter((destination) => destination.enabled !== false),
    [destinations]
  )

  const selectedDestination = useMemo(
    () => enabledDestinations.find((destination) => destination.id === selectedDestinationId),
    [enabledDestinations, selectedDestinationId]
  )

  const loadData = useCallback(async () => {
    if (!clientId || !submissionId) return
    setIsLoading(true)
    setError(null)
    try {
      const [destinationRows, jobRows] = await Promise.all([
        getIntegrationDestinations({ clientId }),
        getIntegrationJobs(submissionId),
      ])
      const activeDestinations = destinationRows.filter((destination) => destination.enabled !== false)
      setDestinations(destinationRows)
      setJobs(jobRows)
      setSelectedDestinationId((current) => {
        if (current && activeDestinations.some((destination) => destination.id === current)) {
          return current
        }
        return activeDestinations[0]?.id || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations')
    } finally {
      setIsLoading(false)
    }
  }, [clientId, submissionId])

  useEffect(() => {
    if (!isOpen) return
    setMessage(null)
    setError(null)
    void loadData()
  }, [isOpen, loadData])

  const handleCreateDestination = async () => {
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const destination = await createIntegrationDestination({
        client_id: clientId,
        name: form.name,
        url: form.url,
        type: 'webhook',
        auth_type: form.auth_type,
        secret_ref: form.secret_ref.trim() || undefined,
        config: {},
        enabled: true,
      })
      setDestinations((current) => [destination, ...current])
      setSelectedDestinationId(destination.id)
      setForm(emptyForm)
      setShowCreateForm(false)
      setMessage('Integration destination added.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create destination')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteDestination = async (destinationId: string) => {
    setError(null)
    setMessage(null)
    try {
      await deleteIntegrationDestination(destinationId)
      setDestinations((current) =>
        current.map((destination) =>
          destination.id === destinationId ? { ...destination, enabled: false } : destination
        )
      )
      setSelectedDestinationId((current) => {
        if (current !== destinationId) return current
        return enabledDestinations.find((destination) => destination.id !== destinationId)?.id || ''
      })
      setMessage('Integration destination disabled.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable destination')
    }
  }

  const handleSend = async () => {
    if (!selectedDestinationId) {
      setError('Select an integration destination first.')
      return
    }
    setIsSending(true)
    setError(null)
    setMessage(null)
    try {
      const job = await sendSubmissionToIntegration(submissionId, selectedDestinationId)
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])
      setMessage(job.status === 'succeeded' ? 'Submission sent successfully.' : 'Send failed. Review the job details below.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send submission')
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/45 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Integrations</h2>
            <p className="mt-1 text-sm text-gray-500">
              Connect an AMS later, or send reviewed data from {submissionName || 'this submission'} to a custom webhook now.
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
          {(error || message) && (
            <div
              className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                error
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-green-200 bg-green-50 text-green-800'
              }`}
            >
              {error ? <AlertCircle className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}
              <span>{error || message}</span>
            </div>
          )}

          <div className="mb-6">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-900">AMS Connections</h3>
              <p className="text-xs text-gray-500">OAuth-based AMS connections are planned. These tiles reserve the product flow.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {providerTiles.map((provider) => (
                <div
                  key={provider.id}
                  className="rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-gray-900">{provider.name}</p>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500">
                          Coming soon
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-gray-500">{provider.description}</p>
                      <button
                        type="button"
                        disabled
                        className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400"
                      >
                        Connect
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between border-t border-gray-100 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Custom Webhook</h3>
              <p className="text-xs text-gray-500">Use this while direct AMS OAuth integrations are postponed.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm((current) => !current)}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Webhook
              </button>
            </div>
          </div>

          {showCreateForm && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Agency webhook"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Auth</span>
                  <select
                    value={form.auth_type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        auth_type: event.target.value as IntegrationDestination['auth_type'],
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="none">None</option>
                    <option value="bearer">Bearer token</option>
                    <option value="hmac">HMAC signature</option>
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Webhook URL</span>
                  <input
                    value={form.url}
                    onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                    placeholder="https://example.com/webhooks/autofil"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                {form.auth_type !== 'none' && (
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Secret environment variable
                    </span>
                    <input
                      value={form.secret_ref}
                      onChange={(event) => setForm((current) => ({ ...current, secret_ref: event.target.value }))}
                      placeholder="INTEGRATION_WEBHOOK_SECRET"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setForm(emptyForm)
                  }}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateDestination}
                  disabled={isSaving || !form.name.trim() || !form.url.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Webhook
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center rounded-lg border border-gray-200 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : enabledDestinations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
                <p className="text-sm font-medium text-gray-900">No custom webhooks yet</p>
                <p className="mt-1 text-xs text-gray-500">Add a webhook URL before sending reviewed data.</p>
              </div>
            ) : (
              enabledDestinations.map((destination) => (
                <label
                  key={destination.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    selectedDestinationId === destination.id
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="integration-destination"
                    value={destination.id}
                    checked={selectedDestinationId === destination.id}
                    onChange={() => setSelectedDestinationId(destination.id)}
                    className="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-gray-900">{destination.name}</p>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          void handleDeleteDestination(destination.id)
                        }}
                        className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Disable ${destination.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{destination.url}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {destination.auth_type === 'none' ? 'No auth' : `${destination.auth_type.toUpperCase()} via ${destination.secret_ref || 'env secret'}`}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900">Recent Sends</h3>
            <div className="mt-2 space-y-2">
              {jobs.length === 0 ? (
                <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500">
                  No integration sends for this submission yet.
                </div>
              ) : (
                jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {job.destination_name || 'Integration destination'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">{formatDate(job.sent_at || job.created_at)}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                    {job.error_message && (
                      <p className="mt-2 text-xs text-red-600">{job.error_message}</p>
                    )}
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
            onClick={handleSend}
            disabled={isSending || !selectedDestination}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSending ? 'Sending...' : 'Send Merged Data'}
          </button>
        </div>
      </div>
    </div>
  )
}
