'use client'

import { useState, useEffect, useCallback } from 'react'
import { getTemplateLibrary } from '@/lib/api-client'
import type { OutputTemplate } from '@/types/template'

const LOCAL_DATA_EXPORT_TEMPLATES: OutputTemplate[] = [
  {
    id: 'loss_run',
    name: 'Loss Run (CSV Export)',
    description: 'Export claim history as CSV.',
    formType: 'LOSS_RUN',
    requiredDataSections: [],
    optionalDataSections: [],
    estimatedFields: 0,
    filler: 'LossRunFiller',
  },
  {
    id: 'sov',
    name: 'Statement of Values (CSV Export)',
    description: 'Export property schedule as CSV.',
    formType: 'SOV',
    requiredDataSections: [],
    optionalDataSections: [],
    estimatedFields: 0,
    filler: 'SovFiller',
  },
  {
    id: 'supplemental',
    name: 'Supplemental (JSON Export)',
    description: 'Export supplemental Q&A as JSON.',
    formType: 'SUPPLEMENTAL',
    requiredDataSections: [],
    optionalDataSections: [],
    estimatedFields: 0,
    filler: 'SupplementalFiller',
  },
  {
    id: 'financial_statement',
    name: 'Financial Statement (JSON Export)',
    description: 'Export financials as JSON.',
    formType: 'FINANCIAL_STATEMENT',
    requiredDataSections: [],
    optionalDataSections: [],
    estimatedFields: 0,
    filler: 'FinancialStatementFiller',
  },
  {
    id: 'generic',
    name: 'Raw Data (JSON Export)',
    description: 'Dump merged data as JSON.',
    formType: 'GENERIC',
    requiredDataSections: [],
    optionalDataSections: [],
    estimatedFields: 0,
    filler: 'GenericFiller',
  },
]

interface UseTemplateLibraryReturn {
  templates: OutputTemplate[]
  loading: boolean
  error: string | null
  refreshTemplates: () => Promise<void>
  getTemplateById: (id: string) => OutputTemplate | undefined
  getPopularTemplates: () => OutputTemplate[]
  getTemplatesByFormType: (formType: string) => OutputTemplate[]
}

/**
 * Hook for managing template library
 * Fetches templates from backend and provides utilities
 */
export function useTemplateLibrary(): UseTemplateLibraryReturn {
  const [templates, setTemplates] = useState<OutputTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const fetchedTemplates = await getTemplateLibrary()
      const merged = [...fetchedTemplates]
      for (const local of LOCAL_DATA_EXPORT_TEMPLATES) {
        if (!merged.some(t => t.id === local.id)) {
          merged.push(local)
        }
      }
      setTemplates(merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const getTemplateByIdLocal = useCallback(
    (id: string) => templates.find(t => t.id === id),
    [templates]
  )

  const getPopularTemplates = useCallback(
    () => templates.filter(t => t.isPopular),
    [templates]
  )

  const getTemplatesByFormType = useCallback(
    (formType: string) => templates.filter(t => t.formType === formType),
    [templates]
  )

  return {
    templates,
    loading,
    error,
    refreshTemplates: loadTemplates,
    getTemplateById: getTemplateByIdLocal,
    getPopularTemplates,
    getTemplatesByFormType,
  }
}
