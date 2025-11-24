'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react'
import { Client, Submission,ClientSubmissionPackage } from '@/types/client'

interface ClientListProps {
  clients: Client[]
  activeSubmission: Submission | null
  onSubmissionClick: (submission: ClientSubmissionPackage) => void
  onClientCreate: (name: string) => Promise<void>
  onClientRename: (clientId: string, newName: string) => Promise<void>
  onClientDelete: (clientId: string) => Promise<void>
  onSubmissionCreate: (clientId: string, name: string, templateType?: string) => Promise<void>
}

export default function ClientList({
  clients,
  activeSubmission,
  onSubmissionClick,
  onClientCreate,
  onClientRename,
  onClientDelete,
  onSubmissionCreate,
}: ClientListProps) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) {
        next.delete(clientId)
      } else {
        next.add(clientId)
      }
      return next
    })
  }

  if (!clients || clients.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <div className="mb-3 text-gray-400">
          <Folder className="w-12 h-12 mx-auto" />
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">No clients yet</p>
        <p className="text-xs text-gray-500">Click &quot;New Client&quot; to create one</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {clients.map((client) => {
        const isExpanded = expandedClients.has(client.client_id)
        const submissions = client.submissions_detailed || []

        return (
          <div key={client.client_id}>
            {/* Client Row */}
            <button
              onClick={() => toggleClient(client.client_id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-gray-100 transition-colors group"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
              <Folder className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-700 flex-1 truncate">
                {client.name}
              </span>
              <span className="text-xs text-gray-500">
                ({client.submission_count})
              </span>
            </button>

            {/* Submissions (when expanded) */}
            {isExpanded && (
              <div className="ml-6 mt-1 space-y-1">
                {submissions.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    No submissions yet
                  </div>
                ) : (
                  submissions.map((submission) => {
                    const isActive = activeSubmission?.submission_id === submission.submission_id
                    
                    return (
                      <button
                        key={submission.submission_id}
                        onClick={() => onSubmissionClick(submission)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg transition-colors ${
                          isActive
                            ? 'bg-blue-50 border border-blue-200'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        <FileText className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            isActive ? 'text-blue-700' : 'text-gray-700'
                          }`}>
                            {submission.name}
                          </p>
                          {submission.file_count > 0 && (
                            <p className="text-xs text-gray-500">
                              {submission.file_count} file{submission.file_count !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                        {submission.status === 'ready' && (
                          <span className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full" />
                        )}
                        {submission.status === 'error' && (
                          <span className="flex-shrink-0 w-2 h-2 bg-red-500 rounded-full" />
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}