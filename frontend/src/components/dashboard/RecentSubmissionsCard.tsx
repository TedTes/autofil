/**
 * RecentSubmissionsCard Component
 * Displays a card showing recent submissions on the dashboard
 */

'use client'

import React from 'react'
import { Clock, ChevronRight, Loader2, FileStack, LockKeyhole } from 'lucide-react'
import type { RecentSubmission } from '@/types'
import RecentSubmissionItem from './RecentSubmissionItem'

interface RecentSubmissionsCardProps {
  limit?: number
  submissions: RecentSubmission[]
  isLoading?: boolean
  isAuthenticated?: boolean
  onSubmissionClick?: (submissionId: string) => void
  onViewAll?: () => void
  className?: string
}

export default function RecentSubmissionsCard({
  limit = 5,
  submissions,
  isLoading = false,
  isAuthenticated = true,
  onSubmissionClick,
  onViewAll,
  className = '',
}: RecentSubmissionsCardProps) {
  const handleSubmissionClick = (submissionId: string) => {
    if (onSubmissionClick) {
      onSubmissionClick(submissionId)
    }
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Recent Submissions</h3>
          </div>
          <span className="text-sm text-gray-500">
            Last {limit}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="divide-y divide-gray-100">
        {!isAuthenticated ? (
          <div className="px-6 py-10 flex flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-3">
              <LockKeyhole className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">Sign in to view recent submissions</p>
            <p className="mt-1 text-xs text-gray-400">
              Your saved submission history appears here after login
            </p>
          </div>
        ) : isLoading ? (
          // Loading state
          <div className="px-6 py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="ml-2 text-sm text-gray-600">Loading submissions...</span>
          </div>
        ) : submissions.length === 0 ? (
          // Empty state
          <div className="px-6 py-10 flex flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-3">
              <FileStack className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">No submissions yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Create a submission to get started
            </p>
          </div>
        ) : (
          // Submissions list
          <>
            {submissions.map((submission) => (
              <RecentSubmissionItem
                key={submission.submission_id}
                submission={submission}
                onClick={() => handleSubmissionClick(submission.submission_id)}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer - optional "View All" link */}
      {isAuthenticated && !isLoading && submissions.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 rounded-b-xl">
          <button
            onClick={onViewAll}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <span>View all</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
