'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Send,
  X,
} from 'lucide-react'
import {
  getIntegrationConnections,
  getIntegrationJobs,
  getIntegrationProviders,
} from '@/lib/api-client'
import type { IntegrationConnection, IntegrationJob, IntegrationProvider } from '@/types'

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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AMS send data')
    } finally {
      setIsLoading(false)
    }
  }, [clientId, submissionId])

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
                <div key={connection.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{connection.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{connection.provider}</p>
                    </div>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600">
                      {connection.connection_status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
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
            disabled
            className="inline-flex items-center gap-2 rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-500"
          >
            <Send className="h-4 w-4" />
            Select Destination
          </button>
        </div>
      </div>
    </div>
  )
}
