/**
 * SubmissionsView Component
 */

'use client'

import React, { useMemo, useEffect, useState, useCallback } from 'react'
import { FileStack, Eye, Search, AlertCircle, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import type { SubmissionListItem, SubmissionStats } from '@/types'
import { listSubmissions, getSubmissionStats } from '@/lib/api-client'

const PAGE_SIZE = 50

// Maps each filter option value to the raw backend statuses it should include
const STATUS_GROUPS: Record<string, string[]> = {
  pending:    ['pending', 'uploading', 'uploaded', 'created'],
  extracting: ['extracting'],
  ready:      ['ready', 'extracted'],
  filled:     ['filled'],
  error:      ['error'],
}

const STATUS_SUMMARY_STYLES: Record<
  string,
  { card: string; icon: string; value: string }
> = {
  blue: {
    card: 'bg-blue-50',
    icon: 'text-blue-600',
    value: 'text-blue-700',
  },
  red: {
    card: 'bg-red-50',
    icon: 'text-red-600',
    value: 'text-red-700',
  },
  purple: {
    card: 'bg-purple-50',
    icon: 'text-purple-600',
    value: 'text-purple-700',
  },
  green: {
    card: 'bg-green-50',
    icon: 'text-green-600',
    value: 'text-green-700',
  },
}

interface SubmissionsViewProps {
  initialStatusFilter?: string
  onSubmissionClick?: (submission: SubmissionListItem) => void
}

export function SubmissionsView({ initialStatusFilter, onSubmissionClick }: SubmissionsViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter || 'all')
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([])
  const [stats, setStats] = useState<SubmissionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const statusFilterParam = useMemo(() => {
    if (statusFilter === 'all') return undefined
    return (STATUS_GROUPS[statusFilter] ?? [statusFilter]).join(',')
  }, [statusFilter])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [listRes, statsRes] = await Promise.all([
          listSubmissions({ limit: PAGE_SIZE, offset: 0, status_filter: statusFilterParam }),
          getSubmissionStats(),
        ])
        setSubmissions(listRes.submissions)
        setHasMore(listRes.submissions.length < listRes.total)
        setStats(statsRes)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load submissions')
      } finally {
        setLoading(false)
      }
    }
    void fetchData()
  }, [refreshKey, statusFilterParam])

  const handleLoadMore = useCallback(async () => {
    try {
      setLoadingMore(true)
      const res = await listSubmissions({
        limit: PAGE_SIZE,
        offset: submissions.length,
        status_filter: statusFilterParam,
      })
      setSubmissions((prev) => [...prev, ...res.submissions])
      setHasMore(submissions.length + res.submissions.length < res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    } finally {
      setLoadingMore(false)
    }
  }, [statusFilterParam, submissions.length])

  useEffect(() => {
    setStatusFilter(initialStatusFilter || 'all')
  }, [initialStatusFilter])

  const filteredSubmissions = useMemo(() => {
    let filtered = submissions
    if (searchQuery) {
      const lower = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (sub) =>
          (sub.name && sub.name.toLowerCase().includes(lower)) ||
          sub.filename.toLowerCase().includes(lower) ||
          sub.submission_id.toLowerCase().includes(lower) ||
          (sub.client_name && sub.client_name.toLowerCase().includes(lower))
      )
    }
    return filtered
  }, [submissions, searchQuery])

  const byStatus = stats?.by_status || {}
  const statusSummary = [
    {
      label: 'Active',
      value: (byStatus.uploading ?? 0) + (byStatus.extracting ?? 0) + (byStatus.ready ?? 0) ||
        submissions.filter(s => ['uploading','extracting','uploaded','ready'].includes(s.status)).length,
      color: 'blue',
      icon: Clock,
    },
    {
      label: 'Needs Review',
      value: byStatus.error ?? submissions.filter(s => s.status === 'error').length,
      color: 'red',
      icon: AlertTriangle,
    },
    {
      label: 'Ready to Generate',
      value: (byStatus.ready ?? 0) + (byStatus.extracted ?? 0) ||
        submissions.filter(s => s.status === 'ready' || s.status === 'extracted').length,
      color: 'purple',
      icon: FileStack,
    },
    {
      label: 'Generated',
      value: byStatus.filled ?? submissions.filter(s => s.status === 'filled').length,
      color: 'green',
      icon: CheckCircle2,
    },
  ]

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6">
        {/* Workflow Stats Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statusSummary.map((stat) => {
            const Icon = stat.icon
            const styles = STATUS_SUMMARY_STYLES[stat.color] || STATUS_SUMMARY_STYLES.blue
            return (
              <div key={stat.label} className={`${styles.card} rounded-lg p-3 flex items-center gap-3`}>
                <Icon className={`w-5 h-5 flex-shrink-0 ${styles.icon}`} />
                <div>
                  <p className={`text-xl font-bold ${styles.value}`}>{stat.value}</p>
                  <p className="text-xs text-gray-600">{stat.label}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-2 mt-4 md:flex-row">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by account, submission name, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent md:w-48"
          >
            <option value="all">All Submissions</option>
            <option value="pending">Uploaded / Pending</option>
            <option value="extracting">Extracting</option>
            <option value="ready">Ready to Generate</option>
            <option value="filled">Generated</option>
            <option value="error">Needs Review</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Loader2 className="w-10 h-10 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading submissions...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 p-8 text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <p className="text-gray-600">{error}</p>
            <button
              onClick={() => setRefreshKey((key) => key + 1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileStack className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Submissions Found
            </h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Adjust your filters or upload new documents to see submissions here.
            </p>
          </div>
        ) : (
          <>
          <div className="bg-white rounded-xl border border-gray-200">
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredSubmissions.map((sub) => (
                <button
                  key={sub.submission_id}
                  onClick={() => onSubmissionClick?.(sub)}
                  className="w-full text-left p-4 space-y-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {sub.name || sub.filename || 'Untitled Submission'}
                    </p>
                    <p className="text-xs text-gray-500 break-all">{sub.submission_id}</p>
                    {sub.client_name && (
                      <p className="text-xs text-gray-400 mt-0.5">Account: {sub.client_name}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    <StatusBadge status={sub.status} />
                    <span className="text-gray-400">•</span>
                    <span>{new Date(sub.uploaded_at).toLocaleString()}</span>
                    {sub.confidence != null && (
                      <>
                        <span className="text-gray-400">•</span>
                        <span>{`${(sub.confidence * 100).toFixed(2)}% confidence`}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-blue-600">
                    <Eye className="w-4 h-4" />
                    Tap to open submission
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submission
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Account
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSubmissions.map((sub) => (
                    <tr
                      key={sub.submission_id}
                      onClick={() => onSubmissionClick?.(sub)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSubmissionClick?.(sub)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="hover:bg-blue-50 focus-within:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          <FileStack className="w-4 h-4 text-gray-400" />
                          <span>{sub.name || sub.filename || 'Untitled Submission'}</span>
                        </div>
                        <div className="text-xs text-gray-400 truncate mt-0.5">{sub.submission_id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {sub.client_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(sub.uploaded_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {hasMore && (
            <div className="p-4 text-center border-t border-gray-100">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalized = (status || '').toLowerCase()
  let label = status || 'Unknown'
  let className = 'bg-gray-100 text-gray-700'

  if (normalized === 'filled') {
    label = 'Generated'
    className = 'bg-green-100 text-green-800'
  } else if (normalized === 'ready' || normalized === 'extracted') {
    label = 'Ready to Generate'
    className = 'bg-purple-100 text-purple-800'
  } else if (normalized === 'error') {
    label = 'Needs Review'
    className = 'bg-red-100 text-red-800'
  } else if (normalized === 'extracting') {
    label = 'Extracting'
    className = 'bg-blue-100 text-blue-800'
  } else if (normalized === 'pending' || normalized === 'uploading' || normalized === 'uploaded') {
    label = 'Uploaded'
    className = 'bg-yellow-100 text-yellow-800'
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
