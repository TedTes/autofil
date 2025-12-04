/**
 * TemplatesView Component
 */

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { FileText, Download, Eye, Search, Grid3x3, List, FileCheck } from 'lucide-react'
import { getSubmissionTemplates, type SubmissionTemplateSummary } from '@/lib/api-client'

interface TemplatesViewProps {
  onTemplateClick?: (templateId: string) => void
  onDownloadTemplate?: (templateId: string) => void
}

export function TemplatesView({ onTemplateClick, onDownloadTemplate }: TemplatesViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [templates, setTemplates] = useState<SubmissionTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getSubmissionTemplates()
        if (isMounted) {
          setTemplates(data || [])
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Failed to load templates'
          setError(message)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      isMounted = false
    }
  }, [])

  const displayTemplates = useMemo(() => {
    const list = templates.map((tpl) => ({
      id: tpl.template_id,
      name: tpl.name,
      description: tpl.description,
      expectedDocuments: tpl.expected_documents || [],
      suggestedForms: tpl.suggested_forms || [],
      url: tpl.templateUrl,
    }))

    if (!searchQuery.trim()) {
      return list
    }
    const q = searchQuery.toLowerCase()
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.suggestedForms || []).some((form) => form.toLowerCase().includes(q))
    )
  }, [templates, searchQuery])

  const openTemplate = (url?: string|undefined|null) => {
    if (!url) return
    window.location.href = url
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Templates & Forms</h1>
              <p className="text-sm text-gray-600">Access ACORD forms and blank templates</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-green-100 text-green-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Grid3x3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-green-100 text-green-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search forms by name or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Available ACORD Forms</h3>
            <p className="text-sm text-gray-600">
              Preview of forms that are currently configured for auto-filling
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading templates…</div>
          ) : displayTemplates.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No templates available yet.
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8'
                  : 'space-y-3 mb-8'
              }
            >
              {displayTemplates.map((form) => (
                <div
                  key={form.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-green-500 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => openTemplate(form.url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openTemplate(form.url)
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center group-hover:bg-green-100 transition-colors">
                    <FileCheck className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onDownloadTemplate) {
                          onDownloadTemplate(form.id)
                        } else {
                          openTemplate(form.url)
                        }
                      }}
                      className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                      title="Download blank"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onTemplateClick) {
                          onTemplateClick(form.id)
                        } else {
                          openTemplate(form.url)
                        }
                      }}
                      className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{form.name}</h4>
                <p className="text-xs text-gray-600">{form.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Info Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">📋 How it works</h4>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Browse available ACORD forms and templates</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Download blank forms to see the structure</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Upload supporting documents and let AI auto-fill forms</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Review and export completed forms</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
