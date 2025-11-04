'use client'

import { useState, useEffect, useMemo } from 'react'
import { 
  Search, Filter, Download, Trash2, RefreshCw, 
  Grid3x3, List, Loader2, FolderOpen, FileText,
  Calendar, User, TrendingUp,X, ChevronDown, Sliders
} from 'lucide-react'
import { getAllSubmissions, type SubmissionListItem } from '@/lib/api-client'
import { ConfidenceBadgeCompact } from '@/components/ConfidenceBadge'
import {formatDate} from "../../lib";

interface DocumentsViewProps {
  onFileClick?: (submissionId: string, filename: string) => void
}

type ISelected = 'all' | 'ready' | 'extracted' | 'filled'
export function DocumentsView({ onFileClick }: DocumentsViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [files, setFiles] = useState<SubmissionListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<ISelected>('all')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [confidenceRange, setConfidenceRange] = useState<[number, number]>([0, 100])
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [selectedClient, setSelectedClient] = useState<string>('all')
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
  // Get unique clients for filter dropdown
const uniqueClients = useMemo(() => {
  const clients = new Set(files.map((f) => f.client_name).filter(Boolean))
  return Array.from(clients).sort()
}, [files])
// Filter and search files
const filteredFiles = useMemo(() => {
  let result = files

  // Apply status filter
  if (selectedFilter !== 'all') {
    result = result.filter((file) => file.status === selectedFilter)
  }

  // Apply confidence range filter
  result = result.filter((file) => {
    if (file.confidence === undefined) return true
    return file.confidence >= confidenceRange[0] && file.confidence <= confidenceRange[1]
  })

  // Apply date range filter
  if (dateRange.start) {
    result = result.filter((file) => {
      const fileDate = new Date(file.uploaded_at)
      const startDate = new Date(dateRange.start)
      return fileDate >= startDate
    })
  }
  if (dateRange.end) {
    result = result.filter((file) => {
      const fileDate = new Date(file.uploaded_at)
      const endDate = new Date(dateRange.end)
      endDate.setHours(23, 59, 59, 999) // Include entire end day
      return fileDate <= endDate
    })
  }

  // Apply client filter
  if (selectedClient !== 'all') {
    result = result.filter((file) => file.client_name === selectedClient)
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
}, [files, selectedFilter, searchQuery, confidenceRange, dateRange, selectedClient])

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


// Check if any advanced filters are active
const hasActiveAdvancedFilters = 
  confidenceRange[0] > 0 || 
  confidenceRange[1] < 100 || 
  dateRange.start !== '' || 
  dateRange.end !== '' || 
  selectedClient !== 'all'

// Clear all advanced filters
const clearAdvancedFilters = () => {
  setConfidenceRange([0, 100])
  setDateRange({ start: '', end: '' })
  setSelectedClient('all')
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

      
  {/* Filters and View Toggle */}
<div className="flex items-center gap-2">
  {/* Status Filter */}
  <select
    value={selectedFilter}
    onChange={(e) => setSelectedFilter(e.target.value as ISelected)}
    className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
  >
    <option value="all">All Files ({files.length})</option>
    <option value="ready">Ready ({files.filter(f => f.status === 'ready').length})</option>
    <option value="extracted">Extracted ({files.filter(f => f.status === 'extracted').length})</option>
    <option value="filled">Filled ({files.filter(f => f.status === 'filled').length})</option>
  </select>

  {/* Advanced Filters Toggle */}
  <button
    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
    className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
      showAdvancedFilters || hasActiveAdvancedFilters
        ? 'border-blue-500 bg-blue-50 text-blue-700'
        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
    }`}
  >
    <Sliders className="w-4 h-4" />
    Filters
    {hasActiveAdvancedFilters && (
      <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-xs rounded-full">
        {[
          confidenceRange[0] > 0 || confidenceRange[1] < 100,
          dateRange.start !== '',
          dateRange.end !== '',
          selectedClient !== 'all',
        ].filter(Boolean).length}
      </span>
    )}
  </button>

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
        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Advanced Filters</h3>
              {hasActiveAdvancedFilters && (
                <button
                  onClick={clearAdvancedFilters}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Confidence Range */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Confidence Range
                </label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={confidenceRange[0]}
                      onChange={(e) => setConfidenceRange([parseInt(e.target.value) || 0, confidenceRange[1]])}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={confidenceRange[1]}
                      onChange={(e) => setConfidenceRange([confidenceRange[0], parseInt(e.target.value) || 100])}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <span className="text-gray-500 text-sm">%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={confidenceRange[1]}
                    onChange={(e) => setConfidenceRange([confidenceRange[0], parseInt(e.target.value)])}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Date Range
                </label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <span className="text-gray-500 text-xs">to</span>
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Client Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Client
                </label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
                >
                  <option value="all">All Clients</option>
                  {uniqueClients.map((client) => (
                    <option key={client} value={client}>
                      {client}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active Filters Summary */}
            {hasActiveAdvancedFilters && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex flex-wrap gap-2">
                  {(confidenceRange[0] > 0 || confidenceRange[1] < 100) && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      Confidence: {confidenceRange[0]}% - {confidenceRange[1]}%
                      <button
                        onClick={() => setConfidenceRange([0, 100])}
                        className="hover:text-blue-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {dateRange.start && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      From: {new Date(dateRange.start).toLocaleDateString()}
                      <button
                        onClick={() => setDateRange({ ...dateRange, start: '' })}
                        className="hover:text-blue-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {dateRange.end && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      To: {new Date(dateRange.end).toLocaleDateString()}
                      <button
                        onClick={() => setDateRange({ ...dateRange, end: '' })}
                        className="hover:text-blue-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {selectedClient !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      Client: {selectedClient}
                      <button
                        onClick={() => setSelectedClient('all')}
                        className="hover:text-blue-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
     
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

