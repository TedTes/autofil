'use client'

import { useState, useEffect } from 'react'
import {
  Download,
  FileText,
  Package,
  Send,
  CheckSquare,
  Square,
  Filter,
  TrendingUp,
  Calendar,
  FileJson,
  FileSpreadsheet,
  Loader2
} from 'lucide-react'
import type { SubmissionSummary, SubmissionStats, ExportOptions, WebhookConfig } from '@/types'

export default function ExportPanel() {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([])
  const [stats, setStats] = useState<SubmissionStats | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'export' | 'webhook'>('export')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookFormat, setWebhookFormat] = useState<'full' | 'summary' | 'ids_only'>('summary')
  const [webhookHeaders, setWebhookHeaders] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchData()
  }, [statusFilter])

  const fetchData = async () => {
    setLoading(true)

    try {
      // Fetch submissions list
      const submissionsRes = await fetch(
        `/api/submissions/list?limit=1000${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`
      )
      const submissionsData = await submissionsRes.json()

      if (submissionsData.success) {
        setSubmissions(submissionsData.submissions || [])
      }

      // Fetch stats
      const statsRes = await fetch('/api/submissions/stats')
      const statsData = await statsRes.json()

      if (statsData.success) {
        setStats(statsData.stats)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === submissions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(submissions.map(s => s.submission_id)))
    }
  }

  const handleExport = async (format: 'csv' | 'json' | 'package') => {
    if (selectedIds.size === 0) {
      alert('Please select at least one submission')
      return
    }

    setExporting(true)

    try {
      const options: ExportOptions = {
        submission_ids: Array.from(selectedIds)
      }

      let endpoint = ''
      let filename = ''

      switch (format) {
        case 'csv':
          endpoint = '/api/submissions/export/csv'
          filename = `export_${new Date().toISOString().split('T')[0]}.csv`
          break
        case 'json':
          endpoint = '/api/submissions/export/json'
          filename = `export_${new Date().toISOString().split('T')[0]}.json`
          options.pretty = true
          break
        case 'package':
          endpoint = '/api/submissions/export/package'
          filename = `export_package_${new Date().toISOString().split('T')[0]}.zip`
          options.include_pdfs = true
          options.include_json = true
          options.include_csv = true
          break
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      })

      if (!response.ok) {
        throw new Error('Export failed')
      }

      // Download file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      alert(`Successfully exported ${selectedIds.size} submission(s)`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleWebhook = async () => {
    if (!webhookUrl) {
      alert('Please enter a webhook URL')
      return
    }

    if (selectedIds.size === 0) {
      alert('Please select at least one submission')
      return
    }

    setExporting(true)

    try {
      const config: WebhookConfig = {
        webhook_url: webhookUrl,
        submission_ids: Array.from(selectedIds),
        format: webhookFormat,
        headers: webhookHeaders
      }

      const response = await fetch('/api/submissions/export/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      const data = await response.json()

      if (data.success) {
        alert(`Successfully sent ${selectedIds.size} submission(s) to webhook`)
      } else {
        throw new Error(data.error || 'Webhook failed')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Webhook failed')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Export & Submission Panel</h2>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Total Submissions</span>
              </div>
              <p className="text-3xl font-bold text-blue-600">{stats.total_submissions}</p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">Avg Confidence</span>
              </div>
              <p className="text-3xl font-bold text-green-600">{(stats.average_confidence * 100).toFixed(0)}%</p>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <CheckSquare className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">Extracted</span>
              </div>
              <p className="text-3xl font-bold text-purple-600">{stats.by_status.extracted || 0}</p>
            </div>

            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Calendar className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-medium text-orange-900">Last Updated</span>
              </div>
              <p className="text-sm font-medium text-orange-600">
                {new Date(stats.last_updated).toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'export'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Download className="w-4 h-4 inline mr-2" />
            Export Files
          </button>
          <button
            onClick={() => setActiveTab('webhook')}
            className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'webhook'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Send className="w-4 h-4 inline mr-2" />
            Send to Webhook
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'export' ? (
            <ExportTab
              selectedCount={selectedIds.size}
              onExport={handleExport}
              exporting={exporting}
            />
          ) : (
            <WebhookTab
              webhookUrl={webhookUrl}
              setWebhookUrl={setWebhookUrl}
              webhookFormat={webhookFormat}
              setWebhookFormat={setWebhookFormat}
              selectedCount={selectedIds.size}
              onSend={handleWebhook}
              sending={exporting}
            />
          )}
        </div>
      </div>

      {/* Submissions List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold text-gray-900">
              Submissions ({submissions.length})
            </h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="extracted">Extracted</option>
              <option value="filled">Filled</option>
              <option value="uploaded">Uploaded</option>
            </select>
          </div>

          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            {selectedIds.size === submissions.length ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {selectedIds.size === submissions.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Select
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Filename
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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {submissions.map(submission => (
                <tr
                  key={submission.submission_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleSelection(submission.submission_id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelection(submission.submission_id)
                      }}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      {selectedIds.has(submission.submission_id) ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {submission.filename}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      submission.status === 'filled' ? 'bg-green-100 text-green-700' :
                      submission.status === 'extracted' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {submission.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(submission.uploaded_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {submission.confidence ? `${(submission.confidence * 100).toFixed(0)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {submissions.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No submissions found</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Export Tab Component
function ExportTab({
  selectedCount,
  onExport,
  exporting
}: {
  selectedCount: number
  onExport: (format: 'csv' | 'json' | 'package') => void
  exporting: boolean
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {selectedCount > 0 ? (
          <span className="font-medium text-blue-600">{selectedCount} submission(s) selected</span>
        ) : (
          'Select submissions from the list below to export'
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => onExport('csv')}
          disabled={exporting || selectedCount === 0}
          className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-8 h-8 text-green-600" />
          <div className="text-center">
            <p className="font-semibold text-gray-900">Export as CSV</p>
            <p className="text-xs text-gray-600 mt-1">Spreadsheet format for analysis</p>
          </div>
        </button>

        <button
          onClick={() => onExport('json')}
          disabled={exporting || selectedCount === 0}
          className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileJson className="w-8 h-8 text-blue-600" />
          <div className="text-center">
            <p className="font-semibold text-gray-900">Export as JSON</p>
            <p className="text-xs text-gray-600 mt-1">Structured data format</p>
          </div>
        </button>

        <button
          onClick={() => onExport('package')}
          disabled={exporting || selectedCount === 0}
          className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Package className="w-8 h-8 text-purple-600" />
          <div className="text-center">
            <p className="font-semibold text-gray-900">Complete Package</p>
            <p className="text-xs text-gray-600 mt-1">ZIP with PDFs, JSON & CSV</p>
          </div>
        </button>
      </div>
    </div>
  )
}

// Webhook Tab Component
function WebhookTab({
  webhookUrl,
  setWebhookUrl,
  webhookFormat,
  setWebhookFormat,
  selectedCount,
  onSend,
  sending
}: {
  webhookUrl: string
  setWebhookUrl: (url: string) => void
  webhookFormat: 'full' | 'summary' | 'ids_only'
  setWebhookFormat: (format: 'full' | 'summary' | 'ids_only') => void
  selectedCount: number
  onSend: () => void
  sending: boolean
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Webhook URL
        </label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Data Format
        </label>
        <select
          value={webhookFormat}
          onChange={(e) => setWebhookFormat(e.target.value as "ids_only" | "summary" | "full")}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="ids_only">IDs Only</option>
          <option value="summary">Summary (metadata only)</option>
          <option value="full">Full Data</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">
          {webhookFormat === 'ids_only' && 'Send only submission IDs'}
          {webhookFormat === 'summary' && 'Send metadata without full data'}
          {webhookFormat === 'full' && 'Send complete submission data'}
        </p>
      </div>

      <div className="pt-4">
        <button
          onClick={onSend}
          disabled={sending || selectedCount === 0 || !webhookUrl}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send to Webhook ({selectedCount} selected)
            </>
          )}
        </button>
      </div>
    </div>
  )
}