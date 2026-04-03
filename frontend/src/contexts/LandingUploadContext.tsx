'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type LandingPreviewResult = {
  success: boolean
  file_name: string
  file_size: number
  data: Record<string, unknown>
  confidence: number
  warnings?: string[]
  errors?: string[]
  metadata?: {
    extractor_used?: string
    document_type?: string
    is_preview?: boolean
    [key: string]: unknown
  }
}

type LandingUploadContextValue = {
  files: File[]
  addFiles: (files: File[]) => void
  setFiles: (files: File[]) => void
  removeFile: (index: number) => void
  clearFiles: () => void
  hasFiles: boolean
  previewFileIndex: number | null
  setPreviewFileIndex: (index: number | null) => void
  previewResult: LandingPreviewResult | null
  setPreviewResult: (result: LandingPreviewResult | null) => void
  isPreviewLoading: boolean
  setIsPreviewLoading: (isLoading: boolean) => void
  previewError: string | null
  setPreviewError: (error: string | null) => void
}

const LandingUploadContext = createContext<LandingUploadContextValue | undefined>(undefined)

export function LandingUploadProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState<File[]>([])
  const [previewFileIndex, setPreviewFileIndex] = useState<number | null>(null)
  const [previewResult, setPreviewResult] = useState<LandingPreviewResult | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const addFiles = useCallback((incomingFiles: File[]) => {
    setFiles((currentFiles) => [...currentFiles, ...incomingFiles])
  }, [])

  const replaceFiles = useCallback((incomingFiles: File[]) => {
    setFiles(incomingFiles)
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index))
  }, [])

  const clearFiles = useCallback(() => {
    setFiles([])
    setPreviewFileIndex(null)
    setPreviewResult(null)
    setPreviewError(null)
    setIsPreviewLoading(false)
  }, [])

  useEffect(() => {
    if (files.length === 0) {
      setPreviewFileIndex(null)
      setPreviewResult(null)
      setPreviewError(null)
      setIsPreviewLoading(false)
      return
    }

    setPreviewFileIndex((currentIndex) => {
      if (currentIndex === null || currentIndex >= files.length) {
        return 0
      }
      return currentIndex
    })
  }, [files])

  const value = useMemo<LandingUploadContextValue>(
    () => ({
      files,
      addFiles,
      setFiles: replaceFiles,
      removeFile,
      clearFiles,
      hasFiles: files.length > 0,
      previewFileIndex,
      setPreviewFileIndex,
      previewResult,
      setPreviewResult,
      isPreviewLoading,
      setIsPreviewLoading,
      previewError,
      setPreviewError,
    }),
    [
      addFiles,
      clearFiles,
      files,
      isPreviewLoading,
      previewError,
      previewFileIndex,
      previewResult,
      removeFile,
      replaceFiles,
    ]
  )

  return (
    <LandingUploadContext.Provider value={value}>
      {children}
    </LandingUploadContext.Provider>
  )
}

export function useLandingUpload() {
  const context = useContext(LandingUploadContext)
  if (!context) {
    throw new Error('useLandingUpload must be used within a LandingUploadProvider')
  }
  return context
}
