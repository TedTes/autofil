/**
 * RecentSubmissionsCard Component
 * Displays a card showing recent submissions on the dashboard
 */

'use client'

import React, { useEffect, useState } from 'react'
import { Clock, AlertCircle, ChevronRight, Loader2 } from 'lucide-react'
import { getRecentSubmissions } from '@/lib/api-client'
import type { RecentSubmission } from '@/types'
import RecentSubmissionItem from './RecentSubmissionItem'

interface RecentSubmissionsCardProps {
  limit?: number
  onSubmissionClick?: (submissionId: string) => void
  className?: string
}

export default function RecentSubmissionsCard({
  limit = 5,
  onSubmissionClick,
  className = '',
}: RecentSubmissionsCardProps) {
  const [submissions, setSubmissions] = useState<RecentSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRecentSubmissions()
  }, [limit])

  const loadRecentSubmissions = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const data = await getRecentSubmissions({ 
        limit,
        include_files: true,
        sort_by: 'updated_at',
        sort_order: 'desc'
      })
      
      setSubmissions(data)
    } catch (err) {
      console.error('Failed to load recent submissions:', err)
      setError('Failed to load recent submissions')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmissionClick = (submissionId: string) => {
    if (onSubmissionClick) {
      onSubmissionClick(submissionId)
    }
  }

  // Empty state - no submissions yet
  if (!loading && submissions.length === 0) {
    return null // Don't show the card if there are no submissions
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Recently Saved</h3>
          </div>
          <span className="text-sm text-gray-500">
            Last {limit} submissions
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="divide-y divide-gray-100">
        {loading ? (
          // Loading state
          <div className="px-6 py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="ml-2 text-sm text-gray-600">Loading submissions...</span>
          </div>
        ) : error ? (
          // Error state
          <div className="px-6 py-8">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={loadRecentSubmissions}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Try again
            </button>
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
      {!loading && !error && submissions.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 rounded-b-xl">
          <button
            onClick={() => {
              // Navigate to submissions view or expand list
              console.log('View all submissions')
            }}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <span>View all submissions</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}