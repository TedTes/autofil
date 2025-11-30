/**
 * SubmissionsView Component
 */

'use client'

import React, { useMemo, useEffect, useState } from 'react'
import { FileStack, Filter, Download, Eye, Search, AlertCircle, Loader2 } from 'lucide-react'
import type { SubmissionListItem, SubmissionStats } from '@/types'
import { listSubmissions, getSubmissionStats } from '@/lib/api-client'

interface SubmissionsViewProps {
  onSubmissionClick?: (submissionId: string) => void
}

export function SubmissionsView({ onSubmissionClick }: SubmissionsViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([])
  const [stats, setStats] = useState<SubmissionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [listRes, statsRes] = await Promise.all([
          listSubmissions({ limit: 500 }),
          getSubmissionStats(),
        ])
        setSubmissions(listRes.submissions)
        setStats(statsRes)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load submissions')
      } finally {
        setLoading(false)
      }
    }
    void fetchData()
  }, [refreshKey])

  const filteredSubmissions = useMemo(() => {
    let filtered = submissions
    if (statusFilter !== 'all') {
      filtered = filtered.filter((sub) => sub.status === statusFilter)
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (sub) =>
          sub.filename.toLowerCase().includes(lower) ||
          sub.submission_id.toLowerCase().includes(lower)
      )
    }
    return filtered
  }, [submissions, statusFilter, searchQuery])

  const statusSummary = [
    { label: 'Total', value: stats?.total_submissions ?? submissions.length, color: 'blue' },
    { label: 'Pending', value: stats?.by_status?.pending ?? 0, color: 'yellow' },
    { label: 'Completed', value: stats?.by_status?.filled ?? stats?.by_status?.ready ?? 0, color: 'green' },
    { label: 'Errors', value: stats?.by_status?.error ?? 0, color: 'red' },
  ]

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <button className="flex w-full items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors sm:w-auto">
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button className="flex w-full items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors sm:w-auto">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 mt-3 sm:grid-cols-4 xl:grid-cols-4">
          {statusSummary.map((stat) => (
            <div key={stat.label} className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-600 mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold text-${stat.color}-600`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-2 mt-3 md:flex-row">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search submissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent md:w-40"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
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
          <div className="bg-white rounded-xl border border-gray-200">
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredSubmissions.map((sub) => (
                <div key={sub.submission_id} className="p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {sub.filename || 'Untitled'}
                    </p>
                    <p className="text-xs text-gray-500 break-all">{sub.submission_id}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    <StatusBadge status={sub.status} />
                    <span className="text-gray-400">•</span>
                    <span>{new Date(sub.uploaded_at).toLocaleString()}</span>
                    {sub.confidence != null && (
                      <>
                        <span className="text-gray-400">•</span>
                        <span>{`${(sub.confidence * 100).toFixed(0)}% confidence`}</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onSubmissionClick?.(sub.submission_id)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                  >
                    <Eye className="w-4 h-4" />
                    View Details
                  </button>
                </div>
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
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Uploaded
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSubmissions.map((sub) => (
                    <tr key={sub.submission_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{sub.filename || 'Untitled'}</div>
                        <div className="text-sm text-gray-500">{sub.submission_id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(sub.uploaded_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {sub.confidence != null ? `${(sub.confidence * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => onSubmissionClick?.(sub.submission_id)}
                          className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalized = (status || '').toLowerCase()
  let label = status || 'Unknown'
  let className = 'bg-gray-100 text-gray-800'

  if (normalized === 'filled' || normalized === 'ready') {
    label = 'Completed'
    className = 'bg-green-100 text-green-800'
  } else if (normalized === 'error') {
    label = 'Error'
    className = 'bg-red-100 text-red-800'
  } else if (normalized === 'pending' || normalized === 'processing') {
    label = 'In Progress'
    className = 'bg-yellow-100 text-yellow-800'
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
