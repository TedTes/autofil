'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  ShieldAlert,
  ArrowUpRight,
  Plus,
  Upload,
  Building2,
  FileText,
} from 'lucide-react'

import { getRecentSubmissions } from '@/lib/api-client'
import type { RecentSubmission, SubmissionStats, RecentSubmissionFile } from '@/types'
import RecentSubmissionsCard from './dashboard/RecentSubmissionsCard'

type HomeViewProps = {
  submissionStats?: SubmissionStats | null
  isAuthenticated?: boolean
  onGoToFile?: (submissionId: string, filename?: string, inputId?: string) => void
  onNavigateToClients?: () => void
  onNavigateToUpload?: () => void
  onNavigateToSubmissions?: () => void
  onNavigateToNeedsReview?: () => void
  onNavigateToReadyToGenerate?: () => void
  onNavigateToTemplates?: () => void
}

export function HomeView({
  submissionStats,
  isAuthenticated = true,
  onGoToFile,
  onNavigateToClients,
  onNavigateToUpload,
  onNavigateToSubmissions,
  onNavigateToNeedsReview,
  onNavigateToReadyToGenerate,
  onNavigateToTemplates,
}: HomeViewProps) {
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([])

  const ISSUE_CONFIDENCE_THRESHOLD = 0.7

  useEffect(() => {
    if (!isAuthenticated) {
      setRecentSubmissions([])
      return
    }
    loadRecentSubmissions()
  }, [isAuthenticated])

  const loadRecentSubmissions = async () => {
    try {
      const data = await getRecentSubmissions({ limit: 5, include_files: true })
      setRecentSubmissions(data)
    } catch (error) {
      console.error('Failed to load recent submissions:', error)
    }
  }

  const pendingIssues = useMemo(() => {
    const items: {
      key: string
      submissionId: string
      filename: string
      status: RecentSubmissionFile['status'] | 'warning'
      confidence?: number
      reason: string
    }[] = []

    recentSubmissions.forEach((submission) => {
      const flaggedFiles = submission.files.filter((file) => {
        if (file.status === 'error') return true
        if (typeof file.confidence === 'number' && file.confidence < ISSUE_CONFIDENCE_THRESHOLD) return true
        return false
      })

      flaggedFiles.forEach((file) =>
        items.push({
          key: `${submission.submission_id}-${file.file_id}`,
          submissionId: submission.submission_id,
          filename: file.filename,
          status: file.status,
          confidence: file.confidence,
          reason: file.status === 'error' ? 'Processing error' : 'Low confidence result',
        })
      )

      if (!flaggedFiles.length && submission.has_errors) {
        items.push({
          key: `${submission.submission_id}-submission`,
          submissionId: submission.submission_id,
          filename: submission.name,
          status: 'warning',
          reason: 'Submission flagged for review',
        })
      }
    })

    return items.slice(0, 5)
  }, [recentSubmissions])

  // Stats
  const statsByStatus = submissionStats?.by_status || {}
  const needsReview = submissionStats
    ? (statsByStatus.error || 0)
    : recentSubmissions.filter(s => s.has_errors || s.status === 'error').length

  const activeSubmissions = submissionStats
    ? (statsByStatus.uploading || 0) + (statsByStatus.extracting || 0)
    : recentSubmissions.filter(s => s.status === 'extracting' || s.status === 'uploaded').length

  const readyToGenerate = submissionStats
    ? (statsByStatus.ready || 0) + (statsByStatus.extracted || 0)
    : recentSubmissions.filter(s => s.status === 'ready' || s.status === 'extracted').length

  const generated = submissionStats
    ? (statsByStatus.filled || 0)
    : recentSubmissions.filter(s => s.status === 'filled').length

  const goToNeedsReview = onNavigateToNeedsReview ?? onNavigateToSubmissions
  const goToReadyToGenerate = onNavigateToReadyToGenerate ?? onNavigateToSubmissions

  const continueWorkItems = [
    {
      label: 'Needs Review',
      sublabel: 'Flagged submissions',
      count: needsReview,
      icon: AlertTriangle,
      onClick: goToNeedsReview,
      accent: {
        activeBg: 'bg-red-50 border-red-100',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-500',
        countColor: 'text-red-600',
        arrowColor: 'group-hover:text-red-400',
      },
    },
    {
      label: 'Ready to Generate',
      sublabel: 'Output-ready submissions',
      count: readyToGenerate,
      icon: TrendingUp,
      onClick: goToReadyToGenerate,
      accent: {
        activeBg: 'bg-violet-50 border-violet-100',
        iconBg: 'bg-violet-100',
        iconColor: 'text-violet-500',
        countColor: 'text-violet-600',
        arrowColor: 'group-hover:text-violet-400',
      },
    },
    {
      label: 'In Progress',
      sublabel: 'Submission queue',
      count: activeSubmissions,
      icon: Clock3,
      onClick: onNavigateToSubmissions,
      accent: {
        activeBg: 'bg-blue-50 border-blue-100',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-500',
        countColor: 'text-blue-600',
        arrowColor: 'group-hover:text-blue-400',
      },
    },
  ]

  return (
    <div className="space-y-7 py-6">

      {/* ── Section 1: Start New ──────────────────────────────────────── */}
      <section>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Start New
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

          {/* New Submission — primary */}
          <button
            onClick={onNavigateToClients}
            className="group flex items-center gap-4 rounded-xl bg-blue-600 p-5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md active:scale-[0.98] active:shadow-sm"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/20">
              <Plus className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">New Submission</p>
              <p className="mt-0.5 text-xs text-blue-200 leading-relaxed">
                Create and upload insurance documents
              </p>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-blue-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
          </button>

          {/* Upload Files */}
          <button
            onClick={onNavigateToUpload}
            className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md active:scale-[0.98] active:shadow-sm"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 transition-colors group-hover:bg-blue-50">
              <Upload className="h-4 w-4 text-gray-500 transition-colors group-hover:text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">Upload Files</p>
              <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                Upload documents without selecting an account
              </p>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gray-500" />
          </button>

          {/* New Account */}
          <button
            onClick={onNavigateToClients}
            className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md active:scale-[0.98] active:shadow-sm"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 transition-colors group-hover:bg-blue-50">
              <Building2 className="h-4 w-4 text-gray-500 transition-colors group-hover:text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">New Account</p>
              <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                Add a new insured or client account
              </p>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gray-500" />
          </button>

        </div>
      </section>

      {/* ── Section 2: Continue Work ──────────────────────────────────── */}
      <section>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Continue Work
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {continueWorkItems.map(({ label, sublabel, count, icon: Icon, onClick, accent }) => {
            const isActive = count > 0
            return (
              <button
                key={label}
                onClick={onClick}
                className={`group flex items-center gap-4 rounded-xl border p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${
                  isActive ? accent.activeBg : 'border-gray-200 bg-white'
                }`}
              >
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                  isActive ? accent.iconBg : 'bg-gray-100'
                }`}>
                  <Icon className={`h-4 w-4 ${isActive ? accent.iconColor : 'text-gray-400'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-2xl font-bold leading-none tabular-nums ${
                    isActive ? accent.countColor : 'text-gray-300'
                  }`}>
                    {count}
                  </p>
                  <p className={`mt-1 text-sm font-medium ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                    {label}
                  </p>
                  <p className={`text-xs ${isActive ? 'text-gray-500' : 'text-gray-300'}`}>
                    {sublabel}
                  </p>
                </div>
                <ArrowUpRight className={`h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
                  isActive ? accent.arrowColor : ''
                }`} />
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Section 3: Recent / Queue ────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">

          <div className="min-w-0">
            <RecentSubmissionsCard
              limit={5}
              onSubmissionClick={(id) => onGoToFile?.(id)}
              onViewAll={onNavigateToSubmissions}
            />
          </div>

          <div className="flex flex-col gap-4 min-w-0">

            {/* Needs Attention */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-md ${
                    pendingIssues.length > 0 ? 'bg-orange-100' : 'bg-green-50'
                  }`}>
                    {pendingIssues.length > 0
                      ? <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    }
                  </div>
                  <span className="text-sm font-semibold text-gray-900">Needs Attention</span>
                  {pendingIssues.length > 0 && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                      {pendingIssues.length}
                    </span>
                  )}
                </div>
                {pendingIssues.length > 0 && (
                  <button
                    onClick={goToNeedsReview}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    View queue
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              {pendingIssues.length > 0 ? (
                <div className="divide-y divide-gray-100 max-h-[260px] overflow-y-auto custom-scrollbar">
                  {pendingIssues.map((issue) => (
                    <button
                      key={issue.key}
                      type="button"
                      onClick={() => onGoToFile?.(issue.submissionId)}
                      className="w-full px-5 py-3 text-left hover:bg-orange-50/60 transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex-shrink-0">
                          {issue.status === 'error'
                            ? <ShieldAlert className="h-4 w-4 text-red-500" />
                            : <AlertTriangle className="h-4 w-4 text-orange-400" />
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900 group-hover:text-orange-800">
                            {issue.filename}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {issue.reason}
                            {typeof issue.confidence === 'number'
                              ? ` · ${(issue.confidence * 100).toFixed(0)}% confidence`
                              : ''}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">All clear</p>
                  <p className="mt-1 text-xs text-gray-400">No flagged items in recent submissions</p>
                </div>
              )}
            </div>

            {/* Generated Forms */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-green-100">
                    <FileText className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">Generated Forms</span>
                </div>
                <button
                  onClick={onNavigateToTemplates}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  View forms
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-baseline gap-2">
                <p className={`text-3xl font-bold tabular-nums ${generated > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                  {generated}
                </p>
                <p className="text-sm text-gray-500">
                  output package{generated === 1 ? '' : 's'} generated
                </p>
              </div>
              {readyToGenerate > 0 ? (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <button
                    onClick={goToReadyToGenerate}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    {readyToGenerate} submission{readyToGenerate === 1 ? '' : 's'} ready to generate
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              ) : generated === 0 ? (
                <p className="mt-2 text-xs text-gray-400">
                  Forms appear here once a submission is generated.
                </p>
              ) : null}
            </div>

          </div>
        </div>
      </section>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </div>
  )
}
