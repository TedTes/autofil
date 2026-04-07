'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { 
  Search, Download, Trash2, RefreshCw, 
  Grid3x3, List, Loader2, FolderOpen, FileText,
  X, Sliders, Clock, Eye, ArrowUpDown, ArrowUp, ArrowDown,
  MoreVertical, Edit, Copy, Archive, AlertCircle, CheckCircle2,
  type LucideIcon
} from 'lucide-react'

import { 
  getAllSubmissions, bulkDeleteSubmissions, exportSingleSubmission,
  deleteSubmission, downloadBlob, formatDate, bulkExportAsZip
} from '@/lib'
import type { ViewType, SubmissionListItem } from "../../types"
import { ConfidenceBadgeCompact } from '@/components/ConfidenceBadge'
import { BulkExportProgressModal } from "../BulkExportProgressModal"

interface DocumentsViewProps {
  onNavigate: (type: ViewType, data?: unknown, breadcrumbs?: string[]) => void
  onFileClick?: (submissionId: string, filename?: string, inputId?: string) => void
}

type SelectedStatus = 'all' | 'ready' | 'extracted' | 'filled'

export function DocumentsView({
  onNavigate,
  onFileClick,
}: DocumentsViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [files, setFiles] = useState<SubmissionListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<SelectedStatus>('all')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [confidenceRange, setConfidenceRange] = useState<[number, number]>([0, 100])
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [selectedClient, setSelectedClient] = useState<string>('all')

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [sortBy, setSortBy] = useState<'date' | 'filename' | 'confidence' | 'client'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const [isBulkOperationInProgress, setIsBulkOperationInProgress] = useState(false)
  const [bulkOperationProgress, setBulkOperationProgress] = useState({ current: 0, total: 0 })
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState<'delete' | 'export' | null>(null)
  const [operationResults, setOperationResults] = useState({ success: 0, failed: 0, errors: [] as string[] })
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [showExportProgressModal, setShowExportProgressModal] = useState(false)

  // Action dropdown state
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)

  // Load files on mount
  useEffect(() => {
    loadFiles()
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recentSearches')
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved))
      } catch {
        setRecentSearches([])
      }
    }
  }, [])

  const loadFiles = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await getAllSubmissions()
      setFiles(data)
    } catch (error) {
      console.error('Failed to refresh submissions:', error)
      setError(error instanceof Error ? error.message : 'Failed to load files')
    } finally {
      setIsLoading(false)
    }
  }

  // Get unique clients for filter dropdown
  const uniqueClients = useMemo(() => {
    const clients = new Set(files.map((f) => f.client_name).filter(Boolean))
    return Array.from(clients).sort()
  }, [files])

  // Filter, search, and sort files
  const filteredFiles = useMemo(() => {
    let result = files

    // Apply status filter
    if (selectedFilter !== 'all') {
      result = result.filter((file) => file.status === selectedFilter)
    }

    // Apply confidence range filter
    result = result.filter((file) => {
      if (file.confidence === undefined || file.confidence === null) return true
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
        endDate.setHours(23, 59, 59, 999)
        return fileDate <= endDate
      })
    }

    // Apply client filter
    if (selectedClient !== 'all') {
      result = result.filter((file) => file.client_name === selectedClient)
    }

    // Apply search query
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase()
      result = result.filter(
        (file) =>
          file.filename.toLowerCase().includes(query) ||
          file.client_name?.toLowerCase().includes(query) ||
          file.submission_id.toLowerCase().includes(query)
      )
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'date':
          comparison = new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
          break
        
        case 'filename':
          comparison = a.filename.localeCompare(b.filename)
          break
        
        case 'confidence':
          const aConf = a.confidence ?? -1
          const bConf = b.confidence ?? -1
          comparison = aConf - bConf
          break
        
        case 'client':
          const aClient = a.client_name || ''
          const bClient = b.client_name || ''
          comparison = aClient.localeCompare(bClient)
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [files, selectedFilter, confidenceRange, dateRange, selectedClient, debouncedSearchQuery, sortBy, sortOrder])

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      clearSelection()
    } else {
      setSelectedFiles(new Set(filteredFiles.map((f) => f.submission_id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedFiles)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedFiles(newSet)
  }

  const clearSelection = () => {
    setSelectedFiles(new Set())
  }

  // Action handlers
  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(column === 'date' || column === 'confidence' ? 'desc' : 'asc')
    }
  }

  const handleSingleFileAction = async (action: 'view' | 'export' | 'delete' | 'duplicate', file: SubmissionListItem) => {
    setOpenActionMenu(null)
    
    try {
      switch (action) {
        case 'view':
          onFileClick?.(file.submission_id, file.filename, file.input_id)
          break
        
        case 'export':
          const blob = await exportSingleSubmission(file.submission_id)
          downloadBlob(blob, `${file.filename}_export.json`)
          break
        
        case 'delete':
          if (confirm(`Are you sure you want to delete "${file.filename}"?`)) {
            await deleteSubmission(file.submission_id)
            await loadFiles()
          }
          break
        
        case 'duplicate':
          // TODO: Implement duplication
          alert('Duplicate functionality coming soon!')
          break
      }
    } catch (err) {
      console.error(`Failed to ${action} file:`, err)
      alert(`Failed to ${action} file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const confirmBulkDelete = async () => {
    setShowBulkConfirmModal(null)
    await performBulkDelete()
  }

  const confirmBulkExport = async () => {
    setShowBulkConfirmModal(null)
    setShowExportProgressModal(true)
    await performBulkExport()
  }

  const performBulkDelete = async () => {
    const selectedFilesList = Array.from(selectedFiles)
    
    try {
      setIsBulkOperationInProgress(true)
      setBulkOperationProgress({ current: 0, total: selectedFilesList.length })
      setOperationResults({ success: 0, failed: 0, errors: [] })
      
      let successCount = 0
      let failedCount = 0
      const errors: string[] = []
      
      for (let i = 0; i < selectedFilesList.length; i++) {
        const submissionId = selectedFilesList[i]
        try {
          await deleteSubmission(submissionId)
          successCount++
        } catch (err) {
          failedCount++
          errors.push(`Failed to delete ${submissionId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
        
        setBulkOperationProgress({ current: i + 1, total: selectedFilesList.length })
      }
      
      if (successCount > 0) {
        setFiles((prev) => prev.filter((f) => !selectedFilesList.includes(f.submission_id)))
      }
      
      setOperationResults({ success: successCount, failed: failedCount, errors })
      
      if (failedCount === 0) {
        alert(`✓ Successfully deleted ${successCount} file(s)`)
        clearSelection()
      } else {
        setShowResultsModal(true)
      }
      
    } catch (err) {
      console.error('Bulk delete failed:', err)
      alert(`Failed to delete files: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsBulkOperationInProgress(false)
      setBulkOperationProgress({ current: 0, total: 0 })
      await loadFiles()
    }
  }

  const performBulkExport = async () => {
    const selectedFilesList = Array.from(selectedFiles)
    
    try {
      setIsBulkOperationInProgress(true)
      setBulkOperationProgress({ current: 0, total: selectedFilesList.length })
      setOperationResults({ success: 0, failed: 0, errors: [] })
      
      const blob = await bulkExportAsZip(selectedFilesList)
      // Mark progress complete once the ZIP is ready
      setBulkOperationProgress({ current: selectedFilesList.length, total: selectedFilesList.length })
      
      downloadBlob(blob, `bulk_export_${Date.now()}.zip`)
      
      setOperationResults({ success: selectedFilesList.length, failed: 0, errors: [] })
      clearSelection()
      
    } catch (err) {
      console.error('Bulk export failed:', err)
      setOperationResults({ success: 0, failed: selectedFilesList.length, errors: [err instanceof Error ? err.message : 'Unknown error'] })
    } finally {
      setIsBulkOperationInProgress(false)
      setBulkOperationProgress({ current: 0, total: 0 })
    }
  }

  const hasActiveAdvancedFilters = 
    confidenceRange[0] > 0 || 
    confidenceRange[1] < 100 || 
    dateRange.start !== '' || 
    dateRange.end !== '' || 
    selectedClient !== 'all'

  const clearAdvancedFilters = () => {
    setConfidenceRange([0, 100])
    setDateRange({ start: '', end: '' })
    setSelectedClient('all')
  }

  // Get status badge info
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'extracted':
        return { label: 'Extracted', color: 'bg-blue-100 text-blue-700', icon: FileText }
      case 'filled':
        return { label: 'Filled', color: 'bg-green-100 text-green-700', icon: CheckCircle2 }
      case 'ready':
        return { label: 'Ready', color: 'bg-purple-100 text-purple-700', icon: Clock }
      case 'error':
        return { label: 'Error', color: 'bg-red-100 text-red-700', icon: AlertCircle }
      default:
        return { label: status, color: 'bg-gray-100 text-gray-700', icon: FileText }
    }
  }

  // Enhanced confidence display with proper handling of 0% and null values
  const renderConfidence = (confidence: number | undefined | null, status: string): ReactNode => {
    // If status is 'filled' but confidence is 0% or null, it's likely a data issue
    if (status === 'filled' && (confidence === 0 || confidence === null || confidence === undefined)) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-sm text-yellow-600">Needs Review</span>
          <AlertCircle className="w-3 h-3 text-yellow-600" />
        </div>
      )
    }
    
    // If confidence is null/undefined and not filled, show as not processed
    if (confidence === null || confidence === undefined) {
      return <span className="text-sm text-gray-400">—</span>
    }
    
    // If confidence is 0%, show it but with a warning color
    if (confidence === 0) {
      return (
        <div className="flex items-center gap-1">
          <ConfidenceBadgeCompact confidence={0} />
          <AlertCircle className="w-3 h-3 text-orange-500" />
        </div>
      )
    }
    
    return <ConfidenceBadgeCompact confidence={confidence} />
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-600">Loading documents...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-gray-900 font-medium mb-2">Failed to load documents</p>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={loadFiles}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <FolderOpen className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
        <p className="text-gray-600 mb-6">Upload your first document to get started</p>
        <button
          onClick={() => onNavigate('clients', { intent: 'upload-files' }, ['Dashboard', 'Accounts'])}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Upload Document
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs sm:text-sm text-gray-600">
            {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''} found
          </p>
          <button
            onClick={loadFiles}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowSearchSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 200)}
            placeholder="Search files by name, client, or ID..."
            className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white text-sm sm:text-base"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setDebouncedSearchQuery('')
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value as SelectedStatus)}
            className="flex-1 min-w-[120px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
          >
            <option value="all">All ({files.length})</option>
            <option value="ready">Ready ({files.filter(f => f.status === 'ready').length})</option>
            <option value="extracted">Extracted ({files.filter(f => f.status === 'extracted').length})</option>
            <option value="filled">Filled ({files.filter(f => f.status === 'filled').length})</option>
          </select>

          {/* Sort */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder]
              setSortBy(newSortBy)
              setSortOrder(newSortOrder)
            }}
            className="flex-1 min-w-[140px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="filename-asc">Name (A-Z)</option>
            <option value="filename-desc">Name (Z-A)</option>
            <option value="confidence-desc">High Confidence</option>
            <option value="confidence-asc">Low Confidence</option>
            <option value="client-asc">Client (A-Z)</option>
            <option value="client-desc">Client (Z-A)</option>
          </select>

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
              showAdvancedFilters || hasActiveAdvancedFilters
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
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
          <div className="hidden sm:flex items-center border border-gray-300 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${
                viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
              } transition-colors rounded-l-lg`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${
                viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
              } transition-colors rounded-r-lg`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Advanced Filters</h3>
              {hasActiveAdvancedFilters && (
                <button
                  onClick={clearAdvancedFilters}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Confidence Range */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Confidence Range: {confidenceRange[0]}% - {confidenceRange[1]}%
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={confidenceRange[0]}
                    onChange={(e) => setConfidenceRange([parseInt(e.target.value), confidenceRange[1]])}
                    className="flex-1"
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={confidenceRange[1]}
                    onChange={(e) => setConfidenceRange([confidenceRange[0], parseInt(e.target.value)])}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Date Range
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                  />
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

      {/* Bulk Actions Bar */}
      {selectedFiles.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkConfirmModal('export')}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button
                onClick={() => setShowBulkConfirmModal('delete')}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File List/Grid */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {viewMode === 'list' ? (
          <FileListView
            files={filteredFiles}
            selectedFiles={selectedFiles}
            onFileClick={onFileClick}
            onToggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            openActionMenu={openActionMenu}
            setOpenActionMenu={setOpenActionMenu}
            onSingleFileAction={handleSingleFileAction}
            renderConfidence={renderConfidence}
            getStatusInfo={getStatusInfo}
          />
        ) : (
          <FileGridView
            files={filteredFiles}
            selectedFiles={selectedFiles}
            onFileClick={onFileClick}
            onToggleSelect={toggleSelect}
            renderConfidence={renderConfidence}
            getStatusInfo={getStatusInfo}
          />
        )}
      </div>

      {/* Modals */}
      {showBulkConfirmModal && (
        <BulkConfirmModal
          type={showBulkConfirmModal}
          count={selectedFiles.size}
          onConfirm={showBulkConfirmModal === 'delete' ? confirmBulkDelete : confirmBulkExport}
          onCancel={() => setShowBulkConfirmModal(null)}
        />
      )}
      
      {showResultsModal && (
        <OperationResultsModal
          isOpen={showResultsModal}
          results={operationResults}
          onClose={() => {
            setShowResultsModal(false)
            clearSelection()
          }}
        />
      )}
      
      {showExportProgressModal && (
        <BulkExportProgressModal
          isOpen={showExportProgressModal}
          progress={bulkOperationProgress}
          isProcessing={isBulkOperationInProgress}
          results={isBulkOperationInProgress ? undefined : operationResults}
          onClose={() => {
            setShowExportProgressModal(false)
            clearSelection()
          }}
        />
      )}
    </div>
  )
}

// File List View Component
function FileListView({
  files,
  selectedFiles,
  onFileClick,
  onToggleSelect,
  toggleSelectAll,
  sortBy,
  sortOrder,
  onSort,
  openActionMenu,
  setOpenActionMenu,
  onSingleFileAction,
  renderConfidence,
  getStatusInfo,
}: {
  files: SubmissionListItem[]
  selectedFiles: Set<string>
  onFileClick?: (submissionId: string, name: string, inputId?: string) => void
  onToggleSelect: (id: string) => void
  toggleSelectAll: () => void
  sortBy: 'date' | 'filename' | 'confidence' | 'client'
  sortOrder: 'asc' | 'desc'
  onSort: (column: typeof sortBy) => void
  openActionMenu: string | null
  setOpenActionMenu: (id: string | null) => void
  onSingleFileAction: (action: 'view' | 'export' | 'delete' | 'duplicate', file: SubmissionListItem) => void
  renderConfidence: (confidence: number | undefined | null, status: string) => ReactNode
  getStatusInfo: (status: string) => { label: string; color: string; icon:LucideIcon }
}) {
  const SortIcon = ({ column }: { column: typeof sortBy }) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-4 h-4 text-blue-600" />
    ) : (
      <ArrowDown className="w-4 h-4 text-blue-600" />
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Table Header */}
      <div className="hidden md:grid bg-gray-50 border-b border-gray-200 px-4 py-3 grid-cols-12 gap-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
        <div className="col-span-1">
          <input
            type="checkbox"
            checked={files.length > 0 && files.every((f) => selectedFiles.has(f.submission_id))}
            onChange={toggleSelectAll}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
        </div>
        
        <button
          onClick={() => onSort('filename')}
          className="col-span-3 flex items-center gap-2 hover:text-gray-900 transition-colors"
        >
          Filename
          <SortIcon column="filename" />
        </button>
        
        <button
          onClick={() => onSort('client')}
          className="col-span-2 flex items-center gap-2 hover:text-gray-900 transition-colors"
        >
          Client
          <SortIcon column="client" />
        </button>
        
        <div className="col-span-2">Status</div>
        
        <button
          onClick={() => onSort('confidence')}
          className="col-span-1 flex items-center gap-2 hover:text-gray-900 transition-colors"
        >
          Confidence
          <SortIcon column="confidence" />
        </button>
        
        <button
          onClick={() => onSort('date')}
          className="col-span-2 flex items-center gap-2 hover:text-gray-900 transition-colors"
        >
          Uploaded
          <SortIcon column="date" />
        </button>
        
        <div className="col-span-1 text-center">Actions</div>
      </div>

      {/* File Rows */}
      <div className="divide-y divide-gray-100">
        {files.map((file) => {
          const statusInfo = getStatusInfo(file.status)
          const StatusIcon = statusInfo.icon
          const handleRowClick = () => {
            onFileClick?.(file.submission_id, file.filename, file.input_id)
          }
          
          return (
            <div
              key={file.submission_id}
              role="button"
              tabIndex={0}
              onClick={handleRowClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleRowClick()
                }
              }}
              className={`px-4 py-3 transition-colors cursor-pointer ${
                selectedFiles.has(file.submission_id) ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              {/* Desktop Layout */}
              <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                <div className="col-span-1">
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.submission_id)}
                    onChange={() => onToggleSelect(file.submission_id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="col-span-3">
                  <div className="flex items-center gap-2 text-gray-900">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="font-medium truncate text-xs sm:text-sm">
                      {file.filename}
                    </span>
                  </div>
                </div>

                <div className="col-span-2">
                  {file.client_name ? (
                    <span className="text-sm text-gray-700">{file.client_name}</span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">No client</span>
                  )}
                </div>

                <div className="col-span-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                  </span>
                </div>

                <div className="col-span-1">
                  {renderConfidence(file.confidence, file.status)}
                </div>

                <div className="col-span-2 text-sm text-gray-600">
                  {formatDate(file.uploaded_at)}
                </div>

                <div className="col-span-1 flex justify-center relative">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenActionMenu(
                        openActionMenu === file.submission_id ? null : file.submission_id
                      )
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {/* Action Dropdown Menu */}
                  {openActionMenu === file.submission_id && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSingleFileAction('view', file)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="w-4 h-4" />
                        View Details
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSingleFileAction('export', file)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Download className="w-4 h-4" />
                        Export
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSingleFileAction('duplicate', file)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate
                      </button>
                      <div className="border-t border-gray-200"></div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSingleFileAction('delete', file)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Layout */}
              <div className="md:hidden">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.submission_id)}
                    onChange={() => onToggleSelect(file.submission_id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 text-gray-900">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-900 truncate text-xs sm:text-sm">
                        {file.filename}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                      {file.client_name && (
                        <>
                          <span>{file.client_name}</span>
                          <span>•</span>
                        </>
                      )}
                      <span>{formatDate(file.uploaded_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                      {renderConfidence(file.confidence, file.status)}
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenActionMenu(openActionMenu === file.submission_id ? null : file.submission_id)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// File Grid View Component (simplified placeholder)
function FileGridView({
  files,
  selectedFiles,
  onFileClick,
  onToggleSelect,
  renderConfidence,
  getStatusInfo,
}: {
  files: SubmissionListItem[]
  selectedFiles: Set<string>
  onFileClick?: (submissionId: string, name: string, inputId?: string) => void
  onToggleSelect: (id: string) => void
  renderConfidence: (confidence: number | undefined | null, status: string) => ReactNode
  getStatusInfo: (status: string) => { label: string; color: string; icon: LucideIcon }
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {files.map((file) => {
        const statusInfo = getStatusInfo(file.status)
        const StatusIcon = statusInfo.icon
        
        return (
          <div
            key={file.submission_id}
            className={`bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow ${
              selectedFiles.has(file.submission_id) ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <input
                type="checkbox"
                checked={selectedFiles.has(file.submission_id)}
                onChange={() => onToggleSelect(file.submission_id)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                <StatusIcon className="w-3 h-3" />
                {statusInfo.label}
              </span>
            </div>
            
            <button
              onClick={() => onFileClick?.(file.submission_id, file.filename, file.input_id)}
              className="text-left w-full mb-3"
            >
              <FileText className="w-8 h-8 text-gray-400 mb-2" />
              <h3 className="font-medium text-gray-900 truncate mb-1 text-sm sm:text-base">
                {file.filename}
              </h3>
              {file.client_name && (
                <p className="text-sm text-gray-600 truncate">{file.client_name}</p>
              )}
            </button>
            
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              {renderConfidence(file.confidence, file.status)}
              <span className="text-xs text-gray-500">{formatDate(file.uploaded_at)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Bulk Confirm Modal
function BulkConfirmModal({
  type,
  count,
  onConfirm,
  onCancel,
}: {
  type: 'delete' | 'export'
  count: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {type === 'delete' ? 'Delete Files' : 'Export Files'}
        </h3>
        <p className="text-gray-600 mb-6">
          {type === 'delete'
            ? `Are you sure you want to delete ${count} file${count !== 1 ? 's' : ''}? This action cannot be undone.`
            : `Export ${count} file${count !== 1 ? 's' : ''} as a ZIP archive?`}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition-colors ${
              type === 'delete'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {type === 'delete' ? 'Delete' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Operation Results Modal
function OperationResultsModal({
  isOpen,
  results,
  onClose,
}: {
  isOpen: boolean
  results: { success: number; failed: number; errors: string[] }
  onClose: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Operation Results</h3>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900">{results.success} succeeded</p>
            </div>
          </div>
          
          {results.failed > 0 && (
            <div className="flex items-center gap-4 p-4 bg-red-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div className="flex-1">
                <p className="font-medium text-red-900 mb-2">{results.failed} failed</p>
                {results.errors.length > 0 && (
                  <div className="text-sm text-red-700 space-y-1">
                    {results.errors.map((error, idx) => (
                      <p key={idx}>• {error}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
