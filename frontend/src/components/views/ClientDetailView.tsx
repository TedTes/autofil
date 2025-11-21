'use client'

import React, { useEffect, useState, useRef } from 'react'
import {
  ArrowLeft,
  Building2,
  Calendar,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  FileStack,
  Mail,
  Phone,
} from 'lucide-react'
import type { Client, Submission } from '@/types'
import type { RecentSubmission } from '@/types/submission'
import { getClients, uploadPdf, getRecentSubmissions } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'

interface ClientDetailViewProps {
  clientId: string
  clientName?: string
  onNavigateBack?: () => void
  onFileClick?: (submissionId: string, filename?: string) => void
}

export function ClientDetailView({
  clientId,
  clientName,
  onNavigateBack,
  onFileClick,
}: ClientDetailViewProps) {
  const [client, setClient] = useState<Client | null>(null)
  const [submissions, setSubmissions] = useState<RecentSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load client details and submissions
  useEffect(() => {
    const loadClientData = async () => {
      try {
        setLoading(true)
        
        // Fetch client details
        const clientsData = await getClients()
        const foundClient = clientsData.find((c) => c.client_id === clientId)
        
        if (!foundClient) {
          setError('Client not found')
          return
        }
        
        setClient(foundClient)

        // Fetch client-specific submissions
        const submissionsData = await getRecentSubmissions({
          limit: 20,
          include_files: true,
        })
        
        // Filter submissions for this client
        const clientSubmissions = submissionsData.filter(
          (s) => s.client_id === clientId
        )
        
        setSubmissions(clientSubmissions)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load client data')
      } finally {
        setLoading(false)
      }
    }

    void loadClientData()
  }, [clientId])

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    try {
      setIsUploading(true)
      
      // Upload files
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        await uploadPdf(file)
      }

      // Reload submissions after upload
      const submissionsData = await getRecentSubmissions({
        limit: 20,
        include_files: true,
      })
      const clientSubmissions = submissionsData.filter(
        (s) => s.client_id === clientId
      )
      setSubmissions(clientSubmissions)
    } catch (err) {
      console.error('Upload failed:', err)
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const triggerFileUpload = () => {
    fileInputRef.current?.click()
  }

  // Calculate stats
  const stats = {
    total: submissions.length,
    active: submissions.filter((s) => 
      s.status === 'extracting' || s.status === 'uploaded' || s.status === 'ready'
    ).length,
    completed: submissions.filter((s) => s.status === 'filled' || s.status === 'extracted').length,
    errors: submissions.filter((s) => s.status === 'error').length,
  }

  const successRate = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0

  // Get status badge config
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'created':
      case 'uploading':
      case 'uploaded':
        return { label: 'Uploading', color: 'text-blue-600 bg-blue-50', icon: Upload }
      case 'extracting':
        return { label: 'Extracting', color: 'text-purple-600 bg-purple-50', icon: Loader2 }
      case 'ready':
      case 'extracted':
        return { label: 'Ready', color: 'text-green-600 bg-green-50', icon: CheckCircle2 }
      case 'filled':
        return { label: 'Completed', color: 'text-green-600 bg-green-50', icon: CheckCircle2 }
      case 'error':
        return { label: 'Error', color: 'text-red-600 bg-red-50', icon: AlertCircle }
      default:
        return { label: status, color: 'text-gray-600 bg-gray-50', icon: Clock }
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading client details...</p>
        </div>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {error || 'Client not found'}
          </h3>
          <button
            onClick={onNavigateBack}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Clients
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
        multiple
        accept=".pdf,.csv,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onNavigateBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Back to Clients"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {clientName || client.name}
              </h1>
              <p className="text-sm text-gray-600">Client ID: {clientId}</p>
            </div>
          </div>
          <button
            onClick={triggerFileUpload}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload Documents
              </>
            )}
          </button>
        </div>

        {/* Client Info Row */}
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>Created {formatDate(client.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileStack className="w-4 h-4" />
            <span>{stats.total} submissions</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Total Documents</span>
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Active</span>
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.active}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Completed</span>
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.completed}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Success Rate</span>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{successRate}%</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Upload
          </h2>
          <div
            onClick={triggerFileUpload}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
          >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-gray-900 font-medium mb-2">
              Drag and drop files here, or click to browse
            </p>
            <p className="text-sm text-gray-600">
              PDF, Excel, CSV • Up to 50 MB per file
            </p>
          </div>
        </div>

        {/* Submissions List */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Submissions</h2>
          </div>

          {submissions.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No submissions yet
              </h3>
              <p className="text-gray-600 mb-6">
                Upload documents to get started with this client
              </p>
              <button
                onClick={triggerFileUpload}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Upload First Document
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {submissions.map((submission) => {
                const statusBadge = getStatusBadge(submission.status)
                const StatusIcon = statusBadge.icon

                return (
                  <button
                    key={submission.submission_id}
                    onClick={() => onFileClick?.(submission.submission_id, submission.name)}
                    className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          <h3 className="font-medium text-gray-900 truncate">
                            {submission.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>{submission.file_count} file{submission.file_count !== 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span>Updated {formatDate(submission.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusBadge.color}`}>
                          <StatusIcon className={`w-4 h-4 ${submission.status === 'extracting' ? 'animate-spin' : ''}`} />
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}