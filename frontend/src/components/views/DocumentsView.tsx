'use client'

import { useState, useEffect, useMemo } from 'react'
import { 
  Search, Filter, Download, Trash2, RefreshCw, 
  Grid3x3, List, Loader2, FolderOpen, FileText,
  Calendar, User, TrendingUp
} from 'lucide-react'
import { getAllSubmissions, type SubmissionListItem } from '@/lib/api-client'
import { ConfidenceBadgeCompact } from '@/components/ConfidenceBadge'
import {formatDate} from "../../lib";
interface DocumentsViewProps {
  onFileClick?: (submissionId: string, filename: string) => void
}

export function DocumentsView({ onFileClick }: DocumentsViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [files, setFiles] = useState<SubmissionListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'ready' | 'extracted' | 'filled'>('all')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  // Fetch files on mount
  useEffect(() => {
    fetchFiles()
  }, [])

  const fetchFiles = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const submissions = await getAllSubmissions()
      setFiles(submissions)
    } catch (err) {
      console.error('Failed to fetch submissions:', err)
      setError(err instanceof Error ? err.message : 'Failed to load files')
    } finally {
      setIsLoading(false)
    }
  }

  // Filter and search files
  const filteredFiles = useMemo(() => {
    let result = files

    // Apply status filter
    if (selectedFilter !== 'all') {
      result = result.filter((file) => file.status === selectedFilter)
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (file) =>
          file.filename.toLowerCase().includes(query) ||
          file.client_name?.toLowerCase().includes(query) ||
          file.submission_id.toLowerCase().includes(query)
      )
    }

    return result
  }, [files, selectedFilter, searchQuery])

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(fileId)) {
        newSet.delete(fileId)
      } else {
        newSet.add(fileId)
      }
      return newSet
    })
  }

  // Select all filtered files
  const selectAll = () => {
    setSelectedFiles(new Set(filteredFiles.map((f) => f.submission_id)))
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedFiles(new Set())
  }

  const handleBulkExport = () => {
    alert(`Exporting ${selectedFiles.size} files (functionality in Commit 15)`)
  }

  const handleBulkDelete = () => {
    if (confirm(`Delete ${selectedFiles.size} files?`)) {
      alert('Bulk delete functionality in Commit 15')
    }
  }

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState error={error} onRetry={fetchFiles} />
  }

  if (files.length === 0) {
    return <EmptyState onFileClick={onFileClick} />
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <button
            onClick={fetchFiles}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>

        {/* Search and Filters Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by filename, policy number, client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
            >
              <option value="all">All Files ({files.length})</option>
              <option value="ready">Ready ({files.filter(f => f.status === 'ready').length})</option>
              <option value="extracted">Extracted ({files.filter(f => f.status === 'extracted').length})</option>
              <option value="filled">Filled ({files.filter(f => f.status === 'filled').length})</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-gray-300 rounded-lg">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${
                  viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'
                } rounded-l-lg transition-colors`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${
                  viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'
                } rounded-r-lg transition-colors border-l border-gray-300`}
                title="Grid view"
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar (shows when files selected) */}
      {selectedFiles.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={selectAll}
                className="text-sm text-blue-700 hover:text-blue-800 font-medium"
              >
                Select all {filteredFiles.length}
              </button>
              <span className="text-gray-400">•</span>
              <p className="text-sm font-medium text-blue-900">
                {selectedFiles.size} selected
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkExport}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button
                onClick={clearSelection}
                className="text-sm text-gray-600 hover:text-gray-900 ml-2"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {filteredFiles.length === 0 ? (
          <NoResultsState searchQuery={searchQuery} selectedFilter={selectedFilter} />
        ) : viewMode === 'list' ? (
          <FileListView
            files={filteredFiles}
            selectedFiles={selectedFiles}
            onFileClick={onFileClick}
            onToggleSelect={toggleFileSelection}
          />
        ) : (
          <FileGridView
            files={filteredFiles}
            selectedFiles={selectedFiles}
            onFileClick={onFileClick}
            onToggleSelect={toggleFileSelection}
          />
        )}
      </div>
    </div>
  )
}

// File List View (Table-like)
function FileListView({
  files,
  selectedFiles,
  onFileClick,
  onToggleSelect,
}: {
  files: SubmissionListItem[]
  selectedFiles: Set<string>
  onFileClick?: (id: string, name: string) => void
  onToggleSelect: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Table Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 grid grid-cols-12 gap-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
        <div className="col-span-1"></div>
        <div className="col-span-4">Filename</div>
        <div className="col-span-2">Client</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-1">Confidence</div>
        <div className="col-span-2">Uploaded</div>
      </div>

      {/* File Rows */}
      <div className="divide-y divide-gray-100">
        {files.map((file) => (
          <div
            key={file.submission_id}
            className={`px-4 py-3 grid grid-cols-12 gap-4 items-center hover:bg-gray-50 transition-colors ${
              selectedFiles.has(file.submission_id) ? 'bg-blue-50' : ''
            }`}
          >
            {/* Checkbox */}
            <div className="col-span-1">
              <input
                type="checkbox"
                checked={selectedFiles.has(file.submission_id)}
                onChange={() => onToggleSelect(file.submission_id)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            {/* Filename */}
            <div className="col-span-4">
              <button
                onClick={() => onFileClick?.(file.submission_id, file.filename)}
                className="flex items-center gap-3 text-left hover:text-blue-600 transition-colors group"
              >
                <FileText className="w-5 h-5 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate">
                  {file.filename}
                </span>
              </button>
            </div>

            {/* Client */}
            <div className="col-span-2">
              <span className="text-sm text-gray-600 truncate block">
                {file.client_name || '—'}
              </span>
            </div>

            {/* Status */}
            <div className="col-span-2">
              <StatusBadge status={file.status} />
            </div>

            {/* Confidence */}
            <div className="col-span-1">
              {file.confidence !== undefined ? (
                <ConfidenceBadgeCompact confidence={file.confidence} />
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>

            {/* Uploaded */}
            <div className="col-span-2">
              <span className="text-sm text-gray-600">
                {formatDate(file.uploaded_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// File Grid View (Cards)
function FileGridView({
  files,
  selectedFiles,
  onFileClick,
  onToggleSelect,
}: {
  files: SubmissionListItem[]
  selectedFiles: Set<string>
  onFileClick?: (id: string, name: string) => void
  onToggleSelect: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {files.map((file) => (
        <div
          key={file.submission_id}
          className={`bg-white border rounded-lg overflow-hidden hover:shadow-md transition-all ${
            selectedFiles.has(file.submission_id) ? 'ring-2 ring-blue-500' : 'border-gray-200'
          }`}
        >
          {/* Card Header */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <input
              type="checkbox"
              checked={selectedFiles.has(file.submission_id)}
              onChange={() => onToggleSelect(file.submission_id)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <StatusBadge status={file.status} />
          </div>

          {/* Card Body */}
          <button
            onClick={() => onFileClick?.(file.submission_id, file.filename)}
            className="p-4 text-left hover:bg-gray-50 transition-colors w-full"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 mb-1 truncate" title={file.filename}>
                  {file.filename}
                </h4>
                {file.client_name && (
                  <p className="text-xs text-gray-500 truncate">{file.client_name}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {file.confidence !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Confidence</span>
                  <ConfidenceBadgeCompact confidence={file.confidence} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Uploaded</span>
                <span className="text-xs text-gray-900">{formatDate(file.uploaded_at)}</span>
              </div>
            </div>
          </button>
        </div>
      ))}
    </div>
  )
}

// Status Badge Component
function StatusBadge({ status }: { status: 'ready' | 'extracted' | 'filled' }) {
  const styles = {
    ready: 'bg-gray-100 text-gray-700',
    extracted: 'bg-blue-100 text-blue-700',
    filled: 'bg-green-100 text-green-700',
  }

  const labels = {
    ready: 'Ready',
    extracted: 'Extracted',
    filled: 'Filled',
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

// No Results State
function NoResultsState({
  searchQuery,
  selectedFilter,
}: {
  searchQuery: string
  selectedFilter: string
}) {
  return (
    <div className="text-center py-12">
      <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No files found</h3>
      <p className="text-sm text-gray-600">
        {searchQuery
          ? `No files match "${searchQuery}"`
          : `No files with status "${selectedFilter}"`}
      </p>
    </div>
  )
}

// Loading State
function LoadingState() {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading documents...</h3>
        <p className="text-sm text-gray-600">Please wait while we fetch your files</p>
      </div>
    </div>
  )
}

// Error State
function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load documents</h3>
        <p className="text-sm text-gray-600 mb-6">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

// Empty State (when no files uploaded yet)
function EmptyState({ onFileClick }: { onFileClick?: (id: string, name: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <FolderOpen className="w-12 h-12 text-gray-400" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-3">No documents yet</h3>
      <p className="text-gray-600 mb-8">
        Upload your first document to get started with automated extraction and form filling.
      </p>

      <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold">
        Upload Document
      </button>
    </div>
  )
}

