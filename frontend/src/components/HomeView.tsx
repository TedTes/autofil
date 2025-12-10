'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users,
  FolderOpen,
  AlertTriangle,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react'

import { getRecentSubmissions, getClients } from '@/lib/api-client'
import type { RecentSubmission, Client, SubmissionStats, RecentSubmissionFile } from '@/types'
import RecentSubmissionsCard from './dashboard/RecentSubmissionsCard'

type HomeViewProps = {
  totalSubmissions: number
  submissionStats?: SubmissionStats | null
  onGoToFile?: (submissionId: string, filename?: string, inputId?: string) => void
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

  const ISSUE_CONFIDENCE_THRESHOLD = 0.7

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

  const pendingIssues = useMemo(() => {
    const items: {
      key: string
      submissionId: string
      filename: string
      status: RecentSubmissionFile['status'] | 'warning'
      confidence?: number
      lastActivity?: string
      reason: string
    }[] = []

    recentSubmissions.forEach((submission) => {
      const flaggedFiles = submission.files.filter((file) => {
        if (file.status === 'error') return true
        if (typeof file.confidence === 'number' && file.confidence < ISSUE_CONFIDENCE_THRESHOLD) {
          return true
        }
        return false
      })

      flaggedFiles.forEach((file) =>
        items.push({
          key: `${submission.submission_id}-${file.file_id}`,
          submissionId: submission.submission_id,
          filename: file.filename,
          status: file.status,
          confidence: file.confidence,
          lastActivity: file.last_activity_at || submission.last_activity,
          reason: file.status === 'error' ? 'Processing error' : 'Low confidence result',
        })
      )

      if (!flaggedFiles.length && submission.has_errors) {
        items.push({
          key: `${submission.submission_id}-submission`,
          submissionId: submission.submission_id,
          filename: submission.name,
          status: 'warning',
          lastActivity: submission.last_activity,
          reason: 'Submission flagged for review',
        })
      }
    })

    return items.slice(0, 5)
  }, [recentSubmissions])

  // Stats calculations
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
    <div className="space-y-6 py-6">
      {/* Clean Stats Grid - 4 Column Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Success Rate */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{successRate}%</div>
              <p className="text-xs text-gray-600">Success Rate</p>
            </div>
          </div>
        </div>

        {/* Total Clients */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {loadingClients ? '...' : clients.length}
              </div>
              <p className="text-xs text-gray-600">Total Clients</p>
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{completedSubmissions}</div>
              <p className="text-xs text-gray-600">Completed</p>
            </div>
          </div>
        </div>

        {/* Active Submissions */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{activeSubmissions}</div>
              <p className="text-xs text-gray-600">Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Center & Issues - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions - Redesigned */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={onNavigateToClients}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 rounded-xl p-4 transition-all duration-200 border border-blue-100 hover:border-blue-200 hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-gray-900 mb-0.5">Manage Clients</div>
                  <div className="text-xs text-gray-600">Add new or upload files</div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
              </div>
            </button>

            <button
              onClick={onNavigateToDocuments}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 rounded-xl p-4 transition-all duration-200 border border-purple-100 hover:border-purple-200 hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                  <FolderOpen className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-gray-900 mb-0.5">Browse Documents</div>
                  <div className="text-xs text-gray-600">Search all files & outputs</div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
              </div>
            </button>

            <button
              onClick={onNavigateToDocuments}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 rounded-xl p-4 transition-all duration-200 border border-green-100 hover:border-green-200 hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-gray-900 mb-0.5">Recent Activity</div>
                  <div className="text-xs text-gray-600">View latest submissions</div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-green-600 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
              </div>
            </button>
          </div>
        </div>

        {/* Pending Review - Enhanced */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                pendingIssues.length > 0 
                  ? 'bg-gradient-to-br from-orange-500 to-red-600' 
                  : 'bg-gradient-to-br from-green-500 to-emerald-600'
              }`}>
                {pendingIssues.length > 0 ? (
                  <AlertTriangle className="w-4 h-4 text-white" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Review Queue</h3>
                {pendingIssues.length > 0 && (
                  <p className="text-xs text-gray-500">{pendingIssues.length} item{pendingIssues.length !== 1 ? 's' : ''} need attention</p>
                )}
              </div>
            </div>
            {pendingIssues.length > 0 && (
              <button
                onClick={onNavigateToDocuments}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group"
              >
                View all
                <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            )}
          </div>

          {pendingIssues.length > 0 ? (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
              {pendingIssues.map((issue) => (
                <button
                  key={issue.key}
                  type="button"
                  onClick={() => onGoToFile?.(issue.submissionId)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-orange-200 hover:bg-orange-50/50 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 truncate">{issue.filename}</p>
                        {issue.status === 'error' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 whitespace-nowrap">
                            Error
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 whitespace-nowrap">
                            Warning
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600">
                        {issue.reason}
                        {typeof issue.confidence === 'number'
                          ? ` (${(issue.confidence * 100).toFixed(0)}%)`
                          : ''}
                      </p>
                    </div>
                    <div className="flex-shrink-0 mt-1">
                      {issue.status === 'error' ? (
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-900 mb-1">All clear!</p>
              <p className="text-xs text-gray-500">No issues requiring attention</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Submissions - Full Width */}
      <RecentSubmissionsCard
        limit={5}
        onSubmissionClick={handleRecentSubmissionClick}
        onViewAll={onNavigateToDocuments}
      />

      {/* Custom scrollbar styles for review queue */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  )
}