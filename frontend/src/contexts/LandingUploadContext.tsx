'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

type LandingUploadContextValue = {
  files: File[]
  addFiles: (files: File[]) => void
  setFiles: (files: File[]) => void
  removeFile: (index: number) => void
  clearFiles: () => void
  hasFiles: boolean
}

const LandingUploadContext = createContext<LandingUploadContextValue | undefined>(undefined)

export function LandingUploadProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState<File[]>([])

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
  }, [])

  const value = useMemo<LandingUploadContextValue>(
    () => ({
      files,
      addFiles,
      setFiles: replaceFiles,
      removeFile,
      clearFiles,
      hasFiles: files.length > 0,
    }),
    [addFiles, clearFiles, files, removeFile, replaceFiles]
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
