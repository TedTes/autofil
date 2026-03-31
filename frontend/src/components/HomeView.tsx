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
} from 'lucide-react'

import { getRecentSubmissions } from '@/lib/api-client'
import type { RecentSubmission, SubmissionStats, RecentSubmissionFile } from '@/types'
import RecentSubmissionsCard from './dashboard/RecentSubmissionsCard'

type HomeViewProps = {
  submissionStats?: SubmissionStats | null
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
    loadRecentSubmissions()
  }, [])

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

  return (
    <div className="space-y-8 py-6">

      {/* ── Section 1: Start New ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Start New
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

          {/* New Submission — primary action */}
          <button
            onClick={onNavigateToClients}
            className="group flex items-start gap-4 rounded-xl bg-blue-600 p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/20">
              <Plus className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">New Submission</p>
              <p className="mt-1 text-xs text-blue-100 leading-relaxed">
                Create a submission and upload insurance documents
              </p>
            </div>
            <ArrowUpRight className="ml-auto h-4 w-4 flex-shrink-0 text-blue-200 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
          </button>

          {/* Upload Documents */}
          <button
            onClick={onNavigateToUpload}
            className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 group-hover:bg-blue-50">
              <Upload className="h-5 w-5 text-gray-500 group-hover:text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Upload Files</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                Upload documents without selecting an account first
              </p>
            </div>
            <ArrowUpRight className="ml-auto h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gray-500" />
          </button>

          {/* New Account */}
          <button
            onClick={onNavigateToClients}
            className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 group-hover:bg-blue-50">
              <Building2 className="h-5 w-5 text-gray-500 group-hover:text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">New Account</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                Add a new insured or client account
              </p>
            </div>
            <ArrowUpRight className="ml-auto h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gray-500" />
          </button>

        </div>
      </section>

      {/* ── Section 2: Continue Work ──────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Continue Work
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

          {/* Needs Review */}
          <button
            onClick={goToNeedsReview}
            className={`group flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
              needsReview > 0
                ? 'border-red-200 bg-red-50 shadow-sm hover:border-red-300'
                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}
          >
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
              needsReview > 0 ? 'bg-red-100' : 'bg-gray-200/60'
            }`}>
              <AlertTriangle className={`h-4 w-4 ${needsReview > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xl font-semibold leading-none tabular-nums ${needsReview > 0 ? 'text-red-700' : 'text-gray-300'}`}>
                {needsReview}
              </p>
              <p className={`mt-1 text-sm font-medium ${needsReview > 0 ? 'text-gray-800' : 'text-gray-400'}`}>Needs Review</p>
              <p className={`text-xs ${needsReview > 0 ? 'text-gray-500' : 'text-gray-300'}`}>Open flagged submissions</p>
            </div>
            <ArrowUpRight className={`h-4 w-4 flex-shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
              needsReview > 0 ? 'text-red-300 group-hover:text-red-500' : 'text-gray-200'
            }`} />
          </button>

          {/* Ready to Generate */}
          <button
            onClick={goToReadyToGenerate}
            className={`group flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
              readyToGenerate > 0
                ? 'border-purple-200 bg-purple-50 shadow-sm hover:border-purple-300'
                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}
          >
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
              readyToGenerate > 0 ? 'bg-purple-100' : 'bg-gray-200/60'
            }`}>
              <TrendingUp className={`h-4 w-4 ${readyToGenerate > 0 ? 'text-purple-600' : 'text-gray-400'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xl font-semibold leading-none tabular-nums ${readyToGenerate > 0 ? 'text-purple-700' : 'text-gray-300'}`}>
                {readyToGenerate}
              </p>
              <p className={`mt-1 text-sm font-medium ${readyToGenerate > 0 ? 'text-gray-800' : 'text-gray-400'}`}>Ready to Generate</p>
              <p className={`text-xs ${readyToGenerate > 0 ? 'text-gray-500' : 'text-gray-300'}`}>Open output-ready submissions</p>
            </div>
            <ArrowUpRight className={`h-4 w-4 flex-shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
              readyToGenerate > 0 ? 'text-purple-300 group-hover:text-purple-500' : 'text-gray-200'
            }`} />
          </button>

          {/* In Progress */}
          <button
            onClick={onNavigateToSubmissions}
            className={`group flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
              activeSubmissions > 0
                ? 'border-blue-200 bg-blue-50 shadow-sm hover:border-blue-300'
                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}
          >
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
              activeSubmissions > 0 ? 'bg-blue-100' : 'bg-gray-200/60'
            }`}>
              <Clock3 className={`h-4 w-4 ${activeSubmissions > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xl font-semibold leading-none tabular-nums ${activeSubmissions > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                {activeSubmissions}
              </p>
              <p className={`mt-1 text-sm font-medium ${activeSubmissions > 0 ? 'text-gray-800' : 'text-gray-400'}`}>In Progress</p>
              <p className={`text-xs ${activeSubmissions > 0 ? 'text-gray-500' : 'text-gray-300'}`}>Open the submission queue</p>
            </div>
            <ArrowUpRight className={`h-4 w-4 flex-shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
              activeSubmissions > 0 ? 'text-blue-300 group-hover:text-blue-500' : 'text-gray-200'
            }`} />
          </button>

        </div>
      </section>

      {/* ── Section 3: Recent / Queue ────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">

          {/* Recent Submissions — main list */}
          <div className="min-w-0">
            <RecentSubmissionsCard
              limit={5}
              onSubmissionClick={(id) => onGoToFile?.(id)}
              onViewAll={onNavigateToSubmissions}
            />
          </div>

          {/* Needs Attention + Generated summary */}
          <div className="flex flex-col gap-4 min-w-0">

            {/* Needs Attention */}
            <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-md ${
                    pendingIssues.length > 0 ? 'bg-orange-100' : 'bg-green-50'
                  }`}>
                    {pendingIssues.length > 0
                      ? <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
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
                <div className="divide-y divide-gray-100 max-h-[260px] overflow-y-auto custom-scrollbar flex-1">
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
                <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">All clear</p>
                  <p className="mt-1 text-xs text-gray-400">No flagged items in recent submissions</p>
                </div>
              )}
            </div>

            {/* Generated forms summary */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-green-100">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
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
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    {readyToGenerate} submission{readyToGenerate === 1 ? '' : 's'} ready to generate
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              ) : generated === 0 ? (
                <p className="mt-2 text-xs text-gray-400">
                  Forms will appear here once a submission is generated.
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
