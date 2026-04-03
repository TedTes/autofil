'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { FieldCatalog } from '@/types'
import { getFieldCatalog } from '@/lib/api-client'
import { useAuth } from '@/contexts/AuthContext'

interface FieldCatalogContextValue {
  catalog: FieldCatalog | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const FieldCatalogContext = createContext<FieldCatalogContextValue | undefined>(undefined)

export function FieldCatalogProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [catalog, setCatalog] = useState<FieldCatalog | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCatalog = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getFieldCatalog(forceRefresh ? { refresh: true } : undefined)
      setCatalog(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load field catalog')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setCatalog(null)
      setError(null)
      setIsLoading(false)
      return
    }

    void fetchCatalog()
  }, [fetchCatalog, user])

  const refresh = useCallback(async () => {
    await fetchCatalog(true)
  }, [fetchCatalog])

  const value = useMemo<FieldCatalogContextValue>(
    () => ({
      catalog,
      isLoading,
      error,
      refresh,
    }),
    [catalog, isLoading, error, refresh]
  )

  return <FieldCatalogContext.Provider value={value}>{children}</FieldCatalogContext.Provider>
}

export function useFieldCatalog(): FieldCatalogContextValue {
  const context = useContext(FieldCatalogContext)
  if (!context) {
    throw new Error('useFieldCatalog must be used within a FieldCatalogProvider')
  }
  return context
}
