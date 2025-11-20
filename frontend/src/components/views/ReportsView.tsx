/**
 * ReportsView Component
 */

'use client'

import React, { useState } from 'react'
import { BarChart3, TrendingUp, Clock, CheckCircle2, AlertCircle, Calendar, Download } from 'lucide-react'

interface ReportsViewProps {
  onExportReport?: () => void
}

export function ReportsView({ onExportReport }: ReportsViewProps) {
  const [dateRange, setDateRange] = useState('7d')

  const metrics = [
    {
      label: 'Fill Success Rate',
      value: '0%',
      change: '+0%',
      trend: 'up',
      icon: CheckCircle2,
      color: 'green',
    },
    {
      label: 'Avg. Turnaround Time',
      value: '0 min',
      change: '-0%',
      trend: 'down',
      icon: Clock,
      color: 'blue',
    },
    {
      label: 'Total Submissions',
      value: '0',
      change: '+0',
      trend: 'up',
      icon: TrendingUp,
      color: 'purple',
    },
    {
      label: 'Outstanding Tasks',
      value: '0',
      change: '0',
      trend: 'neutral',
      icon: AlertCircle,
      color: 'orange',
    },
  ]

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
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
              onClick={onExportReport}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <div key={metric.label} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 bg-${metric.color}-100 rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 text-${metric.color}-600`} />
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      metric.trend === 'up'
                        ? 'text-green-600'
                        : metric.trend === 'down'
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {metric.change}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-1">{metric.value}</p>
                <p className="text-sm text-gray-600">{metric.label}</p>
              </div>
            )
          })}
        </div>

        {/* Chart Placeholders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Submission Volume Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Submission Volume</h3>
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Chart coming soon</p>
              </div>
            </div>
          </div>

          {/* Success Rate Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Success Rate Trend</h3>
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center">
                <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Chart coming soon</p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Preview */}
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