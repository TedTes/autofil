/**
 * ReportsView Component
 */

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { BarChart3, TrendingUp, Clock, CheckCircle2, AlertCircle, Calendar, Download } from 'lucide-react'
import {
  Area,
  AreaChart,
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
}

const RANGE_TO_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
}

export function ReportsView({ onExportReport }: ReportsViewProps) {
  const [dateRange, setDateRange] = useState('7d')
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
    if (!summary) {
      return [
        { label: 'Fill Success Rate', value: '—', icon: CheckCircle2, color: 'green' },
        { label: 'Avg. Turnaround Time', value: '—', icon: Clock, color: 'blue' },
        { label: 'Total Submissions', value: '—', icon: TrendingUp, color: 'purple' },
        { label: 'Completed Submissions', value: '—', icon: AlertCircle, color: 'orange' },
      ]
    }

    return [
      {
        label: 'Fill Success Rate',
        value: `${summary.totals.success_rate.toFixed(1)}%`,
        icon: CheckCircle2,
        color: 'green',
      },
      {
        label: 'Avg. Turnaround Time',
        value: `${summary.turnaround.average_minutes.toFixed(1)} min`,
        icon: Clock,
        color: 'blue',
      },
      {
        label: 'Total Submissions',
        value: summary.totals.total_submissions.toString(),
        icon: TrendingUp,
        color: 'purple',
      },
      {
        label: 'Completed Submissions',
        value: summary.totals.completed.toString(),
        icon: AlertCircle,
        color: 'orange',
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
    link.download = `report-summary-${dateRange}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const chartVolumeData = useMemo(() => {
    if (!summary) return []
    return summary.submission_volume.map((point) => {
      const parsed = new Date(point.date)
      const label = Number.isNaN(parsed.valueOf())
        ? point.date
        : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return {
        ...point,
        label,
      }
    })
  }, [summary])

  const chartTopClients = useMemo(() => {
    if (!summary) return []
    return summary.top_clients.map((client, idx) => ({
      ...client,
      label: client.client_name || `Client ${idx + 1}`,
    }))
  }, [summary])

  const ChartTooltip = ({ active, payload }: ChartTooltipProps) => {
    if (!active || !payload?.length) return null
    const entry = payload[0]
    return (
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow">
        <div className="font-semibold">{entry?.payload?.label ?? entry?.payload?.name}</div>
        <div>{entry?.value} submissions</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
              <p className="text-sm text-gray-600">Track performance and insights</p>
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
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <div key={metric.label} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${metric.color}-100`}>
                    <Icon className={`w-5 h-5 text-${metric.color}-600`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-1">{metric.value}</p>
                <p className="text-sm text-gray-600">{metric.label}</p>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Submission Volume</h3>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-sm text-gray-500">Loading…</div>
            ) : summary && chartVolumeData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartVolumeData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#volumeGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">No data for this range</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Clients</h3>
            {summary && chartTopClients.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartTopClients}
                    layout="vertical"
                    margin={{ top: 5, bottom: 5, left: 0, right: 10 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid stroke="#f3f4f6" horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={140}
                      tick={{ fontSize: 12, fill: '#374151' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="submissions" radius={[0, 6, 6, 0]} fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center">
                  <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">No client activity yet</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Coming Soon</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm mb-1">Fill Success Analytics</h4>
                <p className="text-xs text-gray-600">
                  Track which forms and fields have the highest success rates
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm mb-1">Processing Time Metrics</h4>
                <p className="text-xs text-gray-600">
                  Monitor average turnaround time per form type
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm mb-1">Error Analysis</h4>
                <p className="text-xs text-gray-600">
                  Identify common errors and quality issues
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm mb-1">Client Activity Reports</h4>
                <p className="text-xs text-gray-600">
                  See submission patterns by client over time
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
