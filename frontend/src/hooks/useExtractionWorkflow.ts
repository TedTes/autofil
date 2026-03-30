/**
 * Hook for managing extraction workflow state
 */

import { useState, useCallback } from 'react'
import {
  uploadFileForExtraction,
  classifyDocument,
  extractDocument,
} from '@/lib/api-client'
import type { UploadedExtractionFile, ClassificationResult, ExtractionResult } from '@/types/extraction'

export function useExtractionWorkflow() {
  const [files, setFiles] = useState<UploadedExtractionFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const uploadedFile: UploadedExtractionFile = {
      id: `temp-${Date.now()}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadProgress: 0,
      status: 'pending',
    }

    setFiles(prev => [...prev, uploadedFile])

    try {
      uploadedFile.status = 'uploading'
      setFiles(prev => prev.map(f => f.id === uploadedFile.id ? { ...uploadedFile } : f))

      const result = await uploadFileForExtraction(
        file,
        { autoClassify: true },
        (progress) => {
          setFiles(prev =>
            prev.map(f => f.id === uploadedFile.id ? { ...f, uploadProgress: progress } : f)
          )
        }
      )

      uploadedFile.id = result.file_id
      uploadedFile.status = 'uploaded'

      if (result.classification) {
        uploadedFile.classification = result.classification
        uploadedFile.status = 'classified'
      }

      setFiles(prev => prev.map(f => f.name === file.name ? { ...uploadedFile } : f))

      return uploadedFile.id
    } catch (error) {
      uploadedFile.status = 'error'
      uploadedFile.error = error instanceof Error ? error.message : 'Upload failed'
      setFiles(prev => prev.map(f => f.id === uploadedFile.id ? { ...uploadedFile } : f))
      throw error
    }
  }, [])

  const classifyFile = useCallback(async (fileId: string): Promise<ClassificationResult> => {
    setIsProcessing(true)
    try {
      setFiles(prev =>
        prev.map(f => f.id === fileId ? { ...f, status: 'classifying' as const } : f)
      )

      const classification = await classifyDocument(fileId)

      setFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, classification, status: 'classified' as const }
            : f
        )
      )

      return classification
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const extractFile = useCallback(async (
    fileId: string,
    documentType?: string
  ): Promise<ExtractionResult> => {
    setIsProcessing(true)
    try {
      setFiles(prev =>
        prev.map(f => f.id === fileId ? { ...f, status: 'extracting' as const } : f)
      )

      const result = await extractDocument(fileId, { documentType })
      const extractionError =
        !result.success
          ? result.errors?.[0]
            || result.metadata?.document_support?.message
            || 'Extraction could not continue for this file'
          : undefined

      setFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? {
                ...f,
                extractionResult: result,
                status: result.success ? ('extracted' as const) : ('error' as const),
                error: extractionError,
              }
            : f
        )
      )

      return result
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const updateField = useCallback((fileId: string, field: string, value: string) => {
    setFiles(prev =>
      prev.map(f => {
        if (f.id === fileId && f.extractionResult) {
          return {
            ...f,
            extractionResult: {
              ...f.extractionResult,
              data: {
                ...f.extractionResult.data,
                [field]: value,
              },
            },
          }
        }
        return f
      })
    )
  }, [])

  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  const reset = useCallback(() => {
    setFiles([])
    setIsProcessing(false)
  }, [])

  return {
    files,
    isProcessing,
    uploadFile,
    classifyFile,
    extractFile,
    updateField,
    removeFile,
    reset,
  }
}
