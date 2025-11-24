'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder as FolderIcon, FileText, Plus, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import type { Client, Submission,ClientSubmissionPackage } from '@/types'

interface FolderPanelProps {
  clients: Client[]
  activeSubmission: Submission | null
  onSubmissionClick: (submission: ClientSubmissionPackage) => void
  onNewClient: () => void
  onNewSubmission: (clientId: string) => void
  isMobileOpen: boolean
  onMobileToggle: () => void
}

export default function FolderPanel({
  clients,
  activeSubmission,
  onSubmissionClick,
  onNewClient,
  onNewSubmission,
  isMobileOpen,
  onMobileToggle,
}: FolderPanelProps) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    new Set(clients.map(c => c.client_id))
  )

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


  const getStatusBadge = (submission: ClientSubmissionPackage) => {
    const fileCount = submission.file_count

    // Processing states
    if (submission.status === 'uploading' || submission.status === 'extracting') {
      return (
        <div className="flex items-center gap-1">
          <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
          <span className="text-xs text-blue-600">Processing</span>
        </div>
      )
    }

    // Error state
    if (submission.status === 'error') {
      return (
        <div className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-red-500" />
          <span className="text-xs text-red-600">Error</span>
        </div>
      )
    }

    // Ready state with files
    if (submission.status === 'ready' && fileCount > 0) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-600">({fileCount})</span>
          <CheckCircle className="w-3 h-3 text-green-500" />
        </div>
      )
    }

    // Filled/complete state
    if (submission.status === 'filled' && fileCount > 0) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-600">({fileCount})</span>
          <span className="w-2 h-2 bg-green-500 rounded-full" />
        </div>
      )
    }

    // Has files but status is created
    if (fileCount > 0) {
      return (
        <span className="text-xs font-medium text-gray-500">({fileCount})</span>
      )
    }

    // Empty submission
    return (
      <span className="text-xs text-gray-400">(0)</span>
    )
  }

  // ADDED: Get client-level badge (total files across all submissions)
  const getClientBadge = (client: Client) => {
    const submissions = client.submissions_detailed || []
    const totalFiles = submissions.reduce((sum, sub) => sum + sub.file_count, 0)
    
    if (totalFiles === 0) return null
    
    const hasErrors = submissions.some(sub => sub.status === 'error')
    const hasProcessing = submissions.some(sub => 
      sub.status === 'uploading' || sub.status === 'extracting'
    )
    
    if (hasErrors) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">{totalFiles}</span>
          <AlertCircle className="w-3 h-3 text-red-500" />
        </div>
      )
    }
    
    if (hasProcessing) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">{totalFiles}</span>
          <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
        </div>
      )
    }
    
    return (
      <span className="text-xs text-gray-500">{totalFiles} files</span>
    )
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onMobileToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-0
          w-64 bg-white border-r border-gray-200
          transform transition-transform duration-200 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Clients</h2>
          <button
            onClick={onMobileToggle}
            className="lg:hidden p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Client Button */}
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={onNewClient}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Client
          </button>
        </div>

        {/* Client/Submission Tree */}
        <div className="flex-1 overflow-y-auto p-2">
          {clients.length === 0 ? (
            <div className="text-center py-8 px-4">
              <FolderIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-600 font-medium mb-1">No clients yet</p>
              <p className="text-xs text-gray-400">Click &quot;New Client&quot; to start</p>
            </div>
          ) : (
            <div className="space-y-1">
              {clients.map((client) => {
                const isExpanded = expandedClients.has(client.client_id)
                const submissions = client.submissions_detailed || []

                return (
                  <div key={client.client_id} className="space-y-1">
                    {/* Client Row  */}
                    <div className="group flex items-center gap-1">
                      <button
                        onClick={() => toggleClient(client.client_id)}
                        className="flex-1 flex items-center gap-2 px-2 py-1.5 text-left rounded-md hover:bg-gray-100 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <FolderIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-700 truncate flex-1">
                          {client.name}
                        </span>
                        {/* Show client-level badge */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {getClientBadge(client)}
                        </div>
                      </button>

                      {/* New Submission Button */}
                      <button
                        onClick={() => onNewSubmission(client.client_id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                        title="New submission"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Submissions - with enhanced badges */}
                    {isExpanded && (
                      <div className="ml-6 space-y-0.5">
                        {submissions.length === 0 ? (
                          <button
                            onClick={() => onNewSubmission(client.client_id)}
                            className="w-full px-2 py-1.5 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded text-left transition-colors"
                          >
                            + Add submission
                          </button>
                        ) : (
                          submissions.map((submission) => {
                            const isActive = activeSubmission?.submission_id === submission.submission_id

                            return (
                              <button
                                key={submission.submission_id}
                                onClick={() => onSubmissionClick(submission)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-md transition-colors ${
                                  isActive
                                    ? 'bg-blue-50 border border-blue-200'
                                    : 'hover:bg-gray-50'
                                }`}
                              >
                                <FileText
                                  className={`w-3.5 h-3.5 flex-shrink-0 ${
                                    isActive ? 'text-blue-600' : 'text-gray-400'
                                  }`}
                                />
                                <span
                                  className={`text-sm flex-1 truncate ${
                                    isActive ? 'text-blue-700 font-medium' : 'text-gray-700'
                                  }`}
                                >
                                  {submission.name}
                                </span>
                                {/*  Enhanced status badge */}
                                <div className="flex-shrink-0">
                                  {getStatusBadge(submission)}
                                </div>
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
          )}
        </div>
      </aside>
    </>
  )
}