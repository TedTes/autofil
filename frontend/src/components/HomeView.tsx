'use client'

import React, { useEffect, useState } from 'react'
import {
  FileText,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users,
  FolderOpen,
} from 'lucide-react'

import { getRecentSubmissions, getClients } from '@/lib/api-client'
import type { RecentSubmission, Client, SubmissionStats } from '@/types'
import RecentSubmissionsCard from './dashboard/RecentSubmissionsCard'

type HomeViewProps = {
  totalSubmissions: number
  submissionStats?: SubmissionStats | null
  onGoToFile?: (submissionId: string, filename?: string) => void
  onNavigateToDocuments?: () => void
  onNavigateToClients?: () => void
}

export function HomeView({
  totalSubmissions,
  submissionStats,
  onGoToFile,
  onNavigateToDocuments,
  onNavigateToClients,
}: HomeViewProps) {
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(false)

  useEffect(() => {
    loadRecentSubmissions()
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      setLoadingClients(true)
      const data = await getClients()
      setClients(data)
    } catch (error) {
      console.error('Failed to load clients:', error)
    } finally {
      setLoadingClients(false)
    }
  }

  const loadRecentSubmissions = async () => {
    try {
      const data = await getRecentSubmissions({
        limit: 5,
        include_files: true,
      })
      setRecentSubmissions(data)
    } catch (error) {
      console.error('Failed to load recent submissions:', error)
    }
  }

  const handleRecentSubmissionClick = (submissionId: string) => {
    onGoToFile?.(submissionId)
  }

  // Stats
  const statsByStatus = submissionStats?.by_status || {}
  const totalSubmissionsCount = submissionStats?.total_submissions ?? totalSubmissions
  const activeSubmissions = submissionStats
    ? (statsByStatus.uploading || 0) + (statsByStatus.extracting || 0) + (statsByStatus.ready || 0)
    : recentSubmissions.filter(
        s => s.status === 'extracting' || s.status === 'uploaded' || s.status === 'ready'
      ).length

  const completedSubmissions = submissionStats
    ? (statsByStatus.filled || 0) + (statsByStatus.extracted || 0)
    : recentSubmissions.filter(s => s.status === 'filled' || s.status === 'extracted').length

  const successRate =
    totalSubmissionsCount > 0
      ? Math.round((completedSubmissions / totalSubmissionsCount) * 100)
      : 0

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Clients"
          value={loadingClients ? '...' : clients.length.toString()}
          color="blue"
        />
        <StatCard
          icon={FileText}
          label="Active Submissions"
          value={activeSubmissions.toString()}
          color="purple"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={completedSubmissions.toString()}
          color="green"
        />
        <StatCard
          icon={TrendingUp}
          label="Success Rate"
          value={`${successRate}%`}
          color="orange"
        />
      </div>

      {/* Quick Access */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Access</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={onNavigateToClients}
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
          >
            <Users className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900">Clients</div>
              <div className="text-xs text-gray-500">Manage clients & upload</div>
            </div>
          </button>

          <button
            onClick={onNavigateToDocuments}
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
          >
            <FolderOpen className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900">Documents</div>
              <div className="text-xs text-gray-500">Browse all documents</div>
            </div>
          </button>

          <button
            onClick={onNavigateToDocuments}
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
          >
            <Clock className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900">Recent</div>
              <div className="text-xs text-gray-500">View recent activity</div>
            </div>
          </button>
        </div>
      </div>

      {/* Recent Submissions */}
      <RecentSubmissionsCard
        limit={5}
        onSubmissionClick={handleRecentSubmissionClick}
        onViewAll={onNavigateToDocuments}
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  color: 'blue' | 'purple' | 'green' | 'orange'
}) {
  const colorClasses: Record<typeof color, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  } as const

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-2xl font-semibold text-gray-900">{value}</div>
      </div>
    </div>
  )
}
