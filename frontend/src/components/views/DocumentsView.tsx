'use client'

import { useState, useEffect } from 'react'
import { 
  Search, Filter, Download, Trash2, RefreshCw, 
  Grid3x3, List, Loader2, FolderOpen, FileText 
} from 'lucide-react'

interface DocumentsViewProps {
  onFileClick?: (submissionId: string, filename: string) => void
}
 type ISelected = 'all' | 'ready' | 'extracted' | 'filled';
export function DocumentsView({ onFileClick }: DocumentsViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<ISelected>('all')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  // Simulate initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <LoadingState />
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage all your uploaded and processed files
            </p>
          </div>
          <button
            onClick={() => setIsLoading(true)}
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
          </div>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value as ISelected)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
            >
              <option value="all">All Files</option>
              <option value="ready">Ready</option>
              <option value="extracted">Extracted</option>
              <option value="filled">Filled</option>
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
            <p className="text-sm font-medium text-blue-900">
              {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded-lg transition-colors">
                <Download className="w-4 h-4" />
                Export Selected
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </button>
              <button
                onClick={() => setSelectedFiles(new Set())}
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
        <EmptyState onFileClick={onFileClick} />
      </div>
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

// Empty State (placeholder for when no files)
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

      {/* Quick Start Actions */}
      <div className="grid sm:grid-cols-2 gap-4 max-w-md mx-auto">
        <button className="p-6 bg-white border-2 border-gray-200 hover:border-blue-400 rounded-xl text-left transition-all group">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <h4 className="font-semibold text-gray-900 mb-2">Upload Document</h4>
          <p className="text-sm text-gray-600">
            Upload a PDF, Excel, or CSV file to extract data
          </p>
        </button>

        <button className="p-6 bg-white border-2 border-gray-200 hover:border-green-400 rounded-xl text-left transition-all group">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
            <FolderOpen className="w-6 h-6 text-green-600" />
          </div>
          <h4 className="font-semibold text-gray-900 mb-2">Browse Examples</h4>
          <p className="text-sm text-gray-600">
            See sample documents and their extracted data
          </p>
        </button>
      </div>

      {/* Sample data for testing */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500 mb-4">For testing purposes, here are some sample files:</p>
        <div className="space-y-2 max-w-md mx-auto">
          <button
            onClick={() => onFileClick?.('sample-1', 'ACORD_126_sample.pdf')}
            className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left transition-colors flex items-center gap-3"
          >
            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">ACORD_126_sample.pdf</p>
              <p className="text-xs text-gray-500">Sample document (95% confidence)</p>
            </div>
          </button>
          <button
            onClick={() => onFileClick?.('sample-2', 'Property_Application.pdf')}
            className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left transition-colors flex items-center gap-3"
          >
            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">Property_Application.pdf</p>
              <p className="text-xs text-gray-500">Sample document (88% confidence)</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
