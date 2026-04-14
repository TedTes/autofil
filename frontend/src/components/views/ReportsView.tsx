/**
 * ReportsView Component
 */

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  Target,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getReportsSummary, type ReportsSummary } from '@/lib/api-client'

interface ReportsViewProps {
  onExportReport?: () => void
}

type ChartTooltipProps = {
  active?: boolean
  payload?: Array<{
    value: number
    payload?: {
      label?: string
      name?: string
    }
  }>
  unit?: string
}

const RANGE_TO_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
}

const metricStyles = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-green-50 text-green-700 border-green-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
}

function formatDocumentType(value: string): string {
  if (!value || value === 'unknown') return 'Unknown'
  return value
    .replace(/^documenttype\./i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDateLabel(date: string): string {
  const parsed = new Date(date)
  return Number.isNaN(parsed.valueOf())
    ? date
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ReportsView({ onExportReport }: ReportsViewProps) {
  const [dateRange, setDateRange] = useState('30d')
  const [summary, setSummary] = useState<ReportsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const days = RANGE_TO_DAYS[dateRange] ?? 30
        const data = await getReportsSummary(days)
        if (mounted) {
          setSummary(data)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load reports')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [dateRange])

  const metrics = useMemo(() => {
    const totals = summary?.totals
    return [
      {
        label: 'Documents Processed',
        value: totals ? totals.documents_processed.toString() : '—',
        help: 'Uploaded input documents included in reports.',
        icon: FileText,
        style: metricStyles.blue,
      },
      {
        label: 'Average Confidence',
        value: totals ? `${totals.average_confidence.toFixed(1)}%` : '—',
        help: 'Mean field-level extraction confidence.',
        icon: Target,
        style: metricStyles.green,
      },
      {
        label: 'Correction Rate',
        value: totals ? `${totals.correction_rate.toFixed(1)}%` : '—',
        help: 'Fields changed by users after extraction.',
        icon: Edit3,
        style: metricStyles.amber,
      },
      {
        label: 'Generated Outputs',
        value: totals ? totals.generated_outputs.toString() : '—',
        help: 'Filled forms generated from reviewed data.',
        icon: CheckCircle2,
        style: metricStyles.indigo,
      },
    ]
  }, [summary])

  const handleExport = () => {
    if (onExportReport) {
      onExportReport()
      return
    }
    if (!summary) return
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `extraction-quality-${dateRange}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const activityData = useMemo(() => {
    if (!summary) return []
    const source = summary.recent_activity?.length
      ? summary.recent_activity
      // Older report payloads only had submission volume, so field/output
      // detail is intentionally unavailable in this fallback.
      : summary.submission_volume.map((point) => ({
          date: point.date,
          documents_processed: point.count,
          fields_extracted: 0,
          generated_outputs: 0,
        }))
    return source.map((point) => ({
      ...point,
      label: formatDateLabel(point.date),
    }))
  }, [summary])

  const documentTypeData = useMemo(() => {
    if (!summary) return []
    return summary.by_document_type.map((item) => ({
      ...item,
      label: formatDocumentType(item.document_type),
    }))
  }, [summary])

  const ChartTooltip = ({ active, payload, unit = 'items' }: ChartTooltipProps) => {
    if (!active || !payload?.length) return null
    const entry = payload[0]
    return (
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow">
        <div className="font-semibold">{entry?.payload?.label ?? entry?.payload?.name}</div>
        <div>
          {entry?.value} {unit}
        </div>
      </div>
    )
  }

  const hasReportData = Boolean(
    summary &&
      (summary.totals.documents_processed > 0 ||
        summary.totals.fields_extracted > 0 ||
        summary.totals.total_submissions > 0)
  )

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Extraction Quality</h1>
              <p className="text-sm text-gray-600">
                Track confidence, corrections, and output readiness across reviewed submissions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last year</option>
            </select>
            <button
              onClick={handleExport}
              disabled={!summary}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && !hasReportData && (
          <div className="mb-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <BarChart3 className="mx-auto mb-3 h-10 w-10 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">No extraction quality data yet</h2>
            <p className="mt-1 text-sm text-gray-600">
              Upload, review, and generate documents to build confidence and correction reports.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <div key={metric.label} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{metric.label}</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{loading ? '—' : metric.value}</p>
                  </div>
                  <div className={`rounded-lg border p-2 ${metric.style}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">{metric.help}</p>
              </div>
            )
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-6 xl:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Processing Activity</h3>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Documents over time
              </span>
            </div>
            {loading ? (
              <div className="h-72 rounded-lg bg-gray-100 animate-pulse" />
            ) : activityData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} />
                    <Tooltip content={<ChartTooltip unit="documents" />} />
                    <Bar dataKey="documents_processed" radius={[6, 6, 0, 0]} fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel message="No processing activity in this range" />
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">Review Impact</h3>
            <div className="mt-5 space-y-4">
              <ImpactRow
                label="Fields extracted"
                value={summary?.totals.fields_extracted ?? 0}
                icon={<FileText className="h-4 w-4" />}
              />
              <ImpactRow
                label="Accepted without edits"
                value={summary?.totals.fields_accepted_without_edits ?? 0}
                icon={<CheckCircle2 className="h-4 w-4" />}
              />
              <ImpactRow
                label="Edited after extraction"
                value={summary?.totals.fields_edited ?? 0}
                icon={<Edit3 className="h-4 w-4" />}
              />
            </div>
            <p className="mt-5 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
              Correction rate is based on saved user changes after extraction. It is a quality signal,
              not audited ground-truth accuracy.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">By Document Type</h3>
            {loading ? (
              <div className="mt-4 h-72 rounded-lg bg-gray-100 animate-pulse" />
            ) : documentTypeData.length > 0 ? (
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={documentTypeData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid stroke="#f3f4f6" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={150}
                      tick={{ fontSize: 12, fill: '#374151' }}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip unit="fields" />} />
                    <Bar dataKey="fields_extracted" radius={[0, 6, 6, 0]} fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel message="No document type breakdown yet" />
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Fields Needing Attention</h3>
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            {loading ? (
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : summary?.weakest_fields.length ? (
              <div className="mt-4 divide-y divide-gray-100">
                {summary.weakest_fields.slice(0, 6).map((field) => (
                  <div key={field.field_key} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{field.label}</p>
                      <p className="text-xs text-gray-500">{formatDocumentType(field.document_type)}</p>
                      {field.average_confidence > 0 && (
                        <p className="text-xs text-gray-500">
                          {field.average_confidence.toFixed(1)}% avg confidence
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{field.edit_count}</p>
                      <p className="text-xs text-gray-500">edits</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel message="No corrected fields recorded yet" compact />
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Document Type Quality</h3>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="pb-3">Document Type</th>
                  <th className="pb-3">Documents</th>
                  <th className="pb-3">Fields</th>
                  <th className="pb-3">Avg Confidence</th>
                  <th className="pb-3">Edited Fields</th>
                  <th className="pb-3">Correction Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documentTypeData.length > 0 ? (
                  documentTypeData.map((row) => (
                    <tr key={row.document_type}>
                      <td className="py-3 font-medium text-gray-900">{row.label}</td>
                      <td className="py-3 text-gray-700">{row.documents}</td>
                      <td className="py-3 text-gray-700">{row.fields_extracted}</td>
                      <td className="py-3 text-gray-700">{row.average_confidence.toFixed(1)}%</td>
                      <td className="py-3 text-gray-700">{row.fields_edited}</td>
                      <td className="py-3 text-gray-700">{row.correction_rate.toFixed(1)}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No document quality rows yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImpactRow({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <span className="text-gray-500">{icon}</span>
        {label}
      </div>
      <span className="text-sm font-bold text-gray-900">{value}</span>
    </div>
  )
}

function EmptyPanel({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-center text-sm text-gray-500 ${
        compact ? 'mt-4 min-h-32' : 'h-72'
      }`}
    >
      {message}
    </div>
  )
}
