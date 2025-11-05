'use client'

import { useState, useEffect, useMemo,useRef } from 'react'
import { 
  Search, Filter, Download, Trash2, RefreshCw, 
  Grid3x3, List, Loader2, FolderOpen, FileText,
  X, Sliders,Clock,  Calendar, User, TrendingUp,ChevronDown, 
  ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react'

import { getAllSubmissions, type SubmissionListItem , bulkExportSubmissions,
  bulkDeleteSubmissions,
  exportSingleSubmission,
  deleteSubmission,
  downloadZip,
  downloadBlob} from '@/lib/api-client'

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

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [sortBy, setSortBy] = useState<'date' | 'filename' | 'confidence' | 'client'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const [isBulkOperationInProgress, setIsBulkOperationInProgress] = useState(false)
  const [bulkOperationProgress, setBulkOperationProgress] = useState({ current: 0, total: 0 })
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState<'export' | 'delete' | null>(null)

  const [operationResults, setOperationResults] = useState<{
    success: number
    failed: number
    errors: string[]
  }>({ success: 0, failed: 0, errors: [] })
  const [showResultsModal, setShowResultsModal] = useState(false)

  // Fetch files on mount
  useEffect(() => {
    fetchFiles()
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
      
      // Save to recent searches if not empty and actually searched
      if (searchQuery.trim() && searchQuery.length > 2) {
        setRecentSearches((prev) => {
          const filtered = prev.filter((s) => s !== searchQuery.trim())
          return [searchQuery.trim(), ...filtered].slice(0, 5) // Keep last 5
        })
      }
    }, 300) // 300ms delay
  
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
        setShowSearchSuggestions(false)
      }
    }
  
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  // Load recent searches from localStorage on mount
useEffect(() => {
  const saved = localStorage.getItem('recentSearches')
  if (saved) {
    try {
      setRecentSearches(JSON.parse(saved))
    } catch (e) {
      console.error('Failed to parse recent searches')
    }
  }
}, [])
// Save recent searches to localStorage
useEffect(() => {
  if (recentSearches.length > 0) {
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches))
  }
}, [recentSearches])

// Keyboard shortcuts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      searchInputRef.current?.focus()
      setShowSearchSuggestions(true)
    }
    
    // Escape to clear search and close suggestions
    if (e.key === 'Escape') {
      if (searchQuery) {
        setSearchQuery('')
        setDebouncedSearchQuery('')
      }
      setShowSearchSuggestions(false)
      searchInputRef.current?.blur()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [searchQuery])
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
}, [files, selectedFilter, debouncedSearchQuery, confidenceRange, dateRange, selectedClient, sortBy, sortOrder])

const searchSuggestions = useMemo(() => {
  if (!searchQuery.trim() || searchQuery.length < 2) return []

  const query = searchQuery.toLowerCase()
  const suggestions = new Set<string>()

  // Add matching filenames
  files.forEach((file) => {
    if (file.filename.toLowerCase().includes(query)) {
      suggestions.add(file.filename)
    }
    if (file.client_name?.toLowerCase().includes(query)) {
      suggestions.add(file.client_name)
    }
  })

  return Array.from(suggestions).slice(0, 5)
}, [files, searchQuery])
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

  // Select all filtered files (not all files, just what's currently visible)
const selectAllFiltered = () => {
  setSelectedFiles(new Set(filteredFiles.map((f) => f.submission_id)))
}

// Select all files (regardless of filters)
const selectAllFiles = () => {
  setSelectedFiles(new Set(files.map((f) => f.submission_id)))
}

// Toggle selection for all filtered files
const toggleSelectAll = () => {
  // Check if all filtered files are selected
  const allFilteredSelected = filteredFiles.every((f) => 
    selectedFiles.has(f.submission_id)
  )
  
  if (allFilteredSelected) {
    // Deselect all filtered files
    const newSelection = new Set(selectedFiles)
    filteredFiles.forEach((f) => newSelection.delete(f.submission_id))
    setSelectedFiles(newSelection)
  } else {
    // Select all filtered files
    selectAllFiltered()
  }
}

  // Clear selection
  const clearSelection = () => {
    setSelectedFiles(new Set())
  }

  const handleBulkExport = async () => {
    setShowBulkConfirmModal('export')
  }
  
  const handleBulkDelete = async () => {
    setShowBulkConfirmModal('delete')
  }
  const confirmBulkExport = async () => {
    setShowBulkConfirmModal(null)
    setIsBulkOperationInProgress(true)
    
    const selectedFilesList = Array.from(selectedFiles)
    const selectedFilesData = files.filter((f) => selectedFilesList.includes(f.submission_id))
    
    setBulkOperationProgress({ current: 0, total: selectedFilesList.length })
    
    let successCount = 0
    let failedCount = 0
    const errors: string[] = []
  
    try {
      // Strategy 1: If backend supports bulk export (ZIP), use it
      if (selectedFilesList.length > 5) {
        try {
          const result = await bulkExportSubmissions(selectedFilesList)
          
          if (result.success) {
            successCount = result.results.filter((r) => r.success).length
            failedCount = result.results.filter((r) => !r.success).length
          } else {
            throw new Error('Bulk export failed')
          }
        } catch (err) {
          console.error('Bulk export failed, falling back to individual exports:', err)
          // Fall back to individual exports
        }
      }
      
      // Strategy 2: Individual exports (for small batches or when bulk fails)
      if (selectedFilesList.length <= 5 || successCount === 0) {
        for (let i = 0; i < selectedFilesList.length; i++) {
          const fileId = selectedFilesList[i]
          const file = selectedFilesData[i]
          
          try {
            const pdfBlob = await exportSingleSubmission(fileId)
            
            // Generate filename
            const timestamp = new Date().toISOString().split('T')[0]
            const baseFilename = file.filename.replace('.pdf', '') || 'document'
            const exportFilename = `${baseFilename}_filled_${timestamp}.pdf`
            
            // Download individual PDF
            downloadBlob(pdfBlob, exportFilename)
            
            successCount++
          } catch (err) {
            console.error(`Failed to export ${file.filename}:`, err)
            failedCount++
            errors.push(`${file.filename}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
          
          // Update progress
          setBulkOperationProgress({ current: i + 1, total: selectedFilesList.length })
          
          // Small delay between downloads to prevent browser blocking
          if (i < selectedFilesList.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200))
          }
        }
      }
  
      // Show results
      setOperationResults({ success: successCount, failed: failedCount, errors })
      
      if (failedCount === 0) {
        alert(`✓ Successfully exported ${successCount} file(s)`)
        clearSelection()
      } else {
        setShowResultsModal(true)
      }
      
    } catch (err) {
      console.error('Bulk export failed:', err)
      alert(`Failed to export files: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsBulkOperationInProgress(false)
      setBulkOperationProgress({ current: 0, total: 0 })
    }
  }
  
  const confirmBulkDelete = async () => {
    setShowBulkConfirmModal(null)
    setIsBulkOperationInProgress(true)
    
    const selectedFilesList = Array.from(selectedFiles)
    const selectedFilesData = files.filter((f) => selectedFilesList.includes(f.submission_id))
    
    setBulkOperationProgress({ current: 0, total: selectedFilesList.length })
    
    let successCount = 0
    let failedCount = 0
    const errors: string[] = []
  
    try {
      // Strategy 1: Try bulk delete API if available
      if (selectedFilesList.length > 3) {
        try {
          await bulkDeleteSubmissions(selectedFilesList)
          // Assume full success if API completes without throwing
          successCount = selectedFilesList.length
        } catch (err) {
          console.error('Bulk delete failed, falling back to individual deletes:', err)
          throw err
        }
      } else {
        // Strategy 2: Individual deletes for small batches
        for (let i = 0; i < selectedFilesList.length; i++) {
          const fileId = selectedFilesList[i]
          const file = selectedFilesData[i]
          
          try {
            await deleteSubmission(fileId)
            successCount++
          } catch (err) {
            console.error(`Failed to delete ${file.filename}:`, err)
            failedCount++
            errors.push(`${file.filename}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
          
          // Update progress
          setBulkOperationProgress({ current: i + 1, total: selectedFilesList.length })
        }
      }
  
      // Remove successfully deleted files from state
      if (successCount > 0) {
        setFiles((prev) => prev.filter((f) => !selectedFilesList.includes(f.submission_id)))
      }
  
      // Show results
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
      
      // Refresh the list
      if (successCount > 0) {
        await fetchFiles()
      }
    }
  }
  const clearRecentSearches = () => {
    setRecentSearches([])
    localStorage.removeItem('recentSearches')
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

// Toggle sort - if clicking same column, reverse order; otherwise set new column
const handleSort = (column: typeof sortBy) => {
  if (sortBy === column) {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
  } else {
    setSortBy(column)
    setSortOrder(column === 'date' || column === 'confidence' ? 'desc' : 'asc')
  }
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
{/* Search and Filters Row - Mobile Responsive */}
<div className="flex flex-col gap-3">
  {/* Search - Full width on mobile */}
  <div className="flex-1 relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input
      ref={searchInputRef}
      type="text"
      placeholder="Search files..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      onFocus={() => setShowSearchSuggestions(true)}
      className="w-full pl-10 pr-10 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
    />
    
    {searchQuery && searchQuery !== debouncedSearchQuery && (
      <div className="absolute right-10 top-1/2 -translate-y-1/2">
        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
      </div>
    )}
    
    {searchQuery && (
      <button
        onClick={() => {
          setSearchQuery('')
          setDebouncedSearchQuery('')
          searchInputRef.current?.focus()
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </button>
    )}

  {/* Search Suggestions Dropdown */}
  {showSearchSuggestions && (searchSuggestions.length > 0 || recentSearches.length > 0) && (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto">
      {/* Recent Searches */}
      {recentSearches.length > 0 && !searchQuery && (
        <div className="p-2 border-b border-gray-100">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Recent Searches
            </span>
            <button
              onClick={clearRecentSearches}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Clear
            </button>
          </div>
          {recentSearches.map((recent, idx) => (
            <button
              key={idx}
              onClick={() => {
                setSearchQuery(recent)
                setShowSearchSuggestions(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded flex items-center gap-2"
            >
              <Clock className="w-4 h-4 text-gray-400" />
              {recent}
            </button>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {searchSuggestions.length > 0 && searchQuery && (
        <div className="p-2">
          <div className="px-2 py-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Suggestions
            </span>
          </div>
          {searchSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => {
                setSearchQuery(suggestion)
                setShowSearchSuggestions(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded flex items-center gap-2"
            >
              <Search className="w-4 h-4 text-gray-400" />
              <span className="flex-1 truncate">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )}
</div>

      
  {/* Filters Row - Stack on mobile */}
  <div className="flex flex-wrap items-center gap-2">
    {/* Status Filter */}
    <select
      value={selectedFilter}
      onChange={(e) => setSelectedFilter(e.target.value as ISelected)}
      className="flex-1 min-w-[120px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
    >
      <option value="all">All ({files.length})</option>
      <option value="ready">Ready ({files.filter(f => f.status === 'ready').length})</option>
      <option value="extracted">Extracted ({files.filter(f => f.status === 'extracted').length})</option>
      <option value="filled">Filled ({files.filter(f => f.status === 'filled').length})</option>
    </select>

    {/* Sort - Mobile friendly */}
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
   {/* View Mode Toggle - Hidden on small screens */}
   <div className="hidden sm:flex items-center border border-gray-300 rounded-lg">
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
      {/* Search Stats */}
{debouncedSearchQuery && (
  <div className="mt-2 flex items-center gap-2 text-sm">
    <span className="text-gray-600">
      Showing {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''} for
    </span>
    <span className="font-medium text-gray-900">&quot;{debouncedSearchQuery}&quot;</span>
    <button
      onClick={() => {
        setSearchQuery('')
        setDebouncedSearchQuery('')
      }}
      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
    >
      Clear search
    </button>
  </div>
)}

{/* Bulk Actions Bar (shows when files selected) */}
{selectedFiles.size > 0 && (
  <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filteredFiles.length > 0 && filteredFiles.every((f) => selectedFiles.has(f.submission_id))}
            onChange={toggleSelectAll}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            Select all on this page
          </span>
        </div>
        <span className="text-gray-400">•</span>
        <p className="text-sm font-medium text-blue-900">
          {selectedFiles.size} of {files.length} selected
        </p>
        {selectedFiles.size < files.length && selectedFiles.size === filteredFiles.length && (
          <>
            <span className="text-gray-400">•</span>
            <button
              onClick={selectAllFiles}
              className="text-sm text-blue-700 hover:text-blue-800 font-medium underline"
            >
              Select all {files.length} files
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleBulkExport}
          disabled={isBulkOperationInProgress}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
        <button
          onClick={handleBulkDelete}
          disabled={isBulkOperationInProgress}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
        <button
          onClick={clearSelection}
          disabled={isBulkOperationInProgress}
          className="text-sm text-gray-600 hover:text-gray-900 ml-2"
        >
          Clear
        </button>
      </div>
    </div>
  </div>
)}
{/* Bulk Operation Progress */}
{isBulkOperationInProgress && (
  <div className="bg-white border-b border-gray-200 px-6 py-4">
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900">
          Processing files...
        </span>
        <span className="text-sm text-gray-600">
          {bulkOperationProgress.current} / {bulkOperationProgress.total}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 bg-blue-600 transition-all duration-300"
          style={{
            width: `${(bulkOperationProgress.current / bulkOperationProgress.total) * 100}%`,
          }}
        />
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
          toggleSelectAll = {toggleSelectAll}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
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
      <BulkConfirmModal
        isOpen={showBulkConfirmModal !== null}
        type={showBulkConfirmModal}
        count={selectedFiles.size}
        onConfirm={showBulkConfirmModal === 'delete' ? confirmBulkDelete : confirmBulkExport}
        onCancel={() => setShowBulkConfirmModal(null)}
      />
      {/* Operation Results Modal */}
<OperationResultsModal
  isOpen={showResultsModal}
  results={operationResults}
  onClose={() => {
    setShowResultsModal(false)
    clearSelection()
  }}
/>
    </div>
  )
}

// File List View (Table-like with sortable headers)
// Mobile-friendly file list - hide some columns on small screens
function FileListView({
  files,
  selectedFiles,
  onFileClick,
  onToggleSelect,
  toggleSelectAll,
  sortBy,
  sortOrder,
  onSort,
}: {
  files: SubmissionListItem[]
  selectedFiles: Set<string>
  onFileClick?: (id: string, name: string) => void
  onToggleSelect: (id: string) => void
  toggleSelectAll: () => void
  sortBy: 'date' | 'filename' | 'confidence' | 'client'
  sortOrder: 'asc' | 'desc'
  onSort: (column: typeof sortBy) => void
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
      {/* Table Header - Responsive */}
      <div className="hidden md:grid bg-gray-50 border-b border-gray-200 px-4 py-3 grid-cols-12 gap-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
        <div className="col-span-1"></div>
        
        <button
          onClick={() => onSort('filename')}
          className="col-span-4 flex items-center gap-2 hover:text-gray-900 transition-colors"
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
      </div>

      {/* File Rows - Mobile Optimized */}
      <div className="divide-y divide-gray-100">
        {files.map((file) => (
          <div
            key={file.submission_id}
            className={`px-4 py-3 transition-colors ${
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
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
              </div>

              <div className="col-span-4">
                <button
                  onClick={() => onFileClick?.(file.submission_id, file.filename)}
                  className="flex items-center gap-3 text-left hover:text-blue-600 transition-colors group w-full"
                >
                  <FileText className="w-5 h-5 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate">
                    {file.filename}
                  </span>
                </button>
              </div>

              <div className="col-span-2">
                <span className="text-sm text-gray-600 truncate block">
                  {file.client_name || '—'}
                </span>
              </div>

              <div className="col-span-2">
                <StatusBadge status={file.status} />
              </div>

              <div className="col-span-1">
                {file.confidence !== undefined ? (
                  <ConfidenceBadgeCompact confidence={file.confidence} />
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>

              <div className="col-span-2">
                <span className="text-sm text-gray-600">
                  {formatDate(file.uploaded_at)}
                </span>
              </div>
            </div>

            {/* Mobile Layout - Simplified */}
            <div className="md:hidden">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.submission_id)}
                  onChange={() => onToggleSelect(file.submission_id)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5 flex-shrink-0"
                />
                
                <button
                  onClick={() => onFileClick?.(file.submission_id, file.filename)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {file.filename}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {file.confidence !== undefined && (
                      <ConfidenceBadgeCompact confidence={file.confidence} />
                    )}
                    <StatusBadge status={file.status} />
                    <span>•</span>
                    <span>{formatDate(file.uploaded_at)}</span>
                  </div>
                  
                  {file.client_name && (
                    <p className="text-xs text-gray-500 mt-1">
                      Client: {file.client_name}
                    </p>
                  )}
                </button>
              </div>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Operation Results</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 overflow-y-auto flex-1">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-900">{results.success}</p>
                  <p className="text-sm text-green-700">Successful</p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <X className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-900">{results.failed}</p>
                  <p className="text-sm text-red-700">Failed</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Details */}
          {results.errors.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Failed Operations:</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {results.errors.map((error, idx) => (
                  <div
                    key={idx}
                    className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800"
                  >
                    <p className="font-medium mb-1">Error {idx + 1}:</p>
                    <p className="text-xs">{error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
// Bulk Confirmation Modal Component
function BulkConfirmModal({
  isOpen,
  type,
  count,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean
  type: 'export' | 'delete' | null
  count: number
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!isOpen || !type) return null

  const isDelete = type === 'delete'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isDelete ? 'Delete Files' : 'Export Files'}
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                isDelete ? 'bg-red-100' : 'bg-blue-100'
              }`}
            >
              {isDelete ? (
                <Trash2 className="w-6 h-6 text-red-600" />
              ) : (
                <Download className="w-6 h-6 text-blue-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700 mb-4">
                {isDelete ? (
                  <>
                    Are you sure you want to delete <strong>{count}</strong> file
                    {count !== 1 ? 's' : ''}? This action cannot be undone.
                  </>
                ) : (
                  <>
                    Export <strong>{count}</strong> file{count !== 1 ? 's' : ''} as filled PDFs?
                  </>
                )}
              </p>
              {isDelete && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-800">
                    <strong>Warning:</strong> Deleted files cannot be recovered. Make sure you have
                    backups if needed.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition-colors text-sm font-medium ${
              isDelete
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isDelete ? 'Delete' : 'Export'} {count} file{count !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}