'use client'

import { useState, useEffect, useCallback } from 'react'
import { getTemplateLibrary } from '@/lib/api-client'
import type { OutputTemplate } from '@/types/template'

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
      setTemplates(fetchedTemplates)
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
