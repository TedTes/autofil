import { useCallback, useEffect, useRef, useState } from 'react'
import type { Client, ClientSubmissionPackage } from '@/types'
import { getClientById, createClientSubmission, uploadPdf } from '@/lib/api-client'

export type UploadedRow = {
  submissionId: string
  filename: string
  uploadedAt: string
  fileType: 'pdf' | 'excel' | 'csv' | 'other'
  fileSize: number
  uploadPercent: number
  extractionStatus: 'pending' | 'extracted' | 'error'
  extractionProgress: number
  extractionError?: string
  confidence?: number
  extractionData?: Record<string, unknown>
}

function getFileType(filename: string): UploadedRow['fileType'] {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'xlsx' || ext === 'xls') return 'excel'
  if (ext === 'csv') return 'csv'
  return 'other'
}

export function useClientSubmissions(clientId: string) {
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [packages, setPackages] = useState<ClientSubmissionPackage[]>([])
  const [activePackageId, setActivePackageId] = useState<string | null>(null)

  const [uploadedRows, setUploadedRows] = useState<UploadedRow[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const [statusText, setStatusText] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [selectedInputsByPackage, setSelectedInputsByPackage] = useState<
    Record<string, string[]>
  >({})

  const tempIdRef = useRef(0)

  // ---- helpers for uploadedRows ----
  const addRow = (row: UploadedRow) => {
    setUploadedRows(prev => [row, ...prev])
  }

  const updateRow = (submissionId: string, updates: Partial<UploadedRow>) => {
    setUploadedRows(prev =>
      prev.map(row =>
        row.submissionId === submissionId ? { ...row, ...updates } : row
      )
    )
  }

  const removeRow = (submissionId: string) => {
    setUploadedRows(prev => prev.filter(row => row.submissionId !== submissionId))
  }

  const toggleInputSelection = (submissionId: string, inputId?: string) => {
    if (!submissionId || !inputId) return
    setSelectedInputsByPackage(prev => {
      const current = prev[submissionId] || []
      const exists = current.includes(inputId)
      const nextSelections = exists
        ? current.filter(id => id !== inputId)
        : [...current, inputId]
      return { ...prev, [submissionId]: nextSelections }
    })
  }

  const selectAllInputs = (submissionId: string, inputIds: (string | undefined)[]) => {
    if (!submissionId) return
    const available = inputIds.filter((id): id is string => Boolean(id))
    if (!available.length) return
    setSelectedInputsByPackage(prev => {
      const current = prev[submissionId] || []
      const allSelected = available.every(id => current.includes(id))
      return { ...prev, [submissionId]: allSelected ? [] : available }
    })
  }

  const clearInputSelection = (submissionId: string) => {
    if (!submissionId) return
    setSelectedInputsByPackage(prev => {
      if (!(submissionId in prev)) return prev
      const next = { ...prev }
      delete next[submissionId]
      return next
    })
  }

  // ---- load client & packages ----
  const loadClientData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true)
      }
      const detail = await getClientById(clientId)
      if (!detail) {
        setError('Client not found')
        return
      }
      setClient(detail)
      setPackages(detail.submissions_detailed || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client data')
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [clientId])

  useEffect(() => {
    void loadClientData()
  }, [loadClientData])

  // keep activePackageId valid
  useEffect(() => {
    if (packages.length === 0) {
      setActivePackageId(null)
      return
    }
    setActivePackageId(prev =>
      prev && packages.some(pkg => pkg.submission_id === prev)
        ? prev
        : packages[0].submission_id
    )
  }, [packages])

  useEffect(() => {
    setSelectedInputsByPackage(prev => {
      const validIds = new Set(packages.map(pkg => pkg.submission_id))
      const next: Record<string, string[]> = {}
      for (const [pkgId, selections] of Object.entries(prev)) {
        if (validIds.has(pkgId)) {
          next[pkgId] = selections
        }
      }
      return next
    })
  }, [packages])

  const activePackage = activePackageId
    ? packages.find(pkg => pkg.submission_id === activePackageId)
    : undefined

  // ---- create folder ----
  const createFolder = async (name: string) => {
    if (!name.trim()) return
    try {
      const created = await createClientSubmission(clientId, name.trim())
      await loadClientData({ silent: true })
      if (created?.submission_id) {
        setActivePackageId(created.submission_id)
      }
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : 'Failed to create folder')
      throw err
    }
  }

  // ---- upload into active folder ----
  const uploadFilesToActiveFolder = async (files: File[]) => {
    if (!files.length) return
    if (!activePackageId) {
      setWorkflowError('Create or select a folder before uploading.')
      return
    }

    setIsUploading(true)
    setMessage(null)
    setWorkflowError(null)
    setStatusText(null)

    for (const file of files) {
      const tempId = `tmp-${clientId}-${Date.now()}-${tempIdRef.current++}`
      const uploadedAt = new Date().toISOString()

      addRow({
        submissionId: tempId,
        filename: file.name,
        uploadedAt,
        fileType: getFileType(file.name),
        fileSize: file.size,
        uploadPercent: 0,
        extractionStatus: 'pending',
        extractionProgress: 0,
      })

      try {
        const result = await uploadPdf(
          file,
          (progress) => {
            setStatusText(`Uploading ${file.name} (${progress}%)`)
            updateRow(tempId, { uploadPercent: progress })
          },
          { clientId, submissionId: activePackageId }
        )

        const extractionResult = result.extraction
        const extractionPayload = extractionResult?.data as Record<string, unknown> | undefined
        const payloadConfidence =
          typeof extractionPayload?.['confidence'] === 'number'
            ? (extractionPayload['confidence'] as number)
            : undefined
        setUploadedRows(prev =>
          prev.map(row =>
            row.submissionId === tempId
              ? {
                  ...row,
                  submissionId: result.submission_id,
                  uploadPercent: 100,
                  extractionStatus: extractionResult ? 'extracted' : 'pending',
                  extractionProgress: extractionResult ? 100 : 0,
                  confidence: extractionResult?.confidence ?? payloadConfidence,
                  extractionData: extractionPayload,
                }
              : row
          )
        )

        if (!extractionResult) {
          setMessage(`Uploaded ${file.name} (awaiting extraction)`)
        } else {
          setMessage(`Extracted ${file.name}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        updateRow(tempId, { extractionStatus: 'error', extractionError: msg })
        setWorkflowError(msg)
      }
    }

    setIsUploading(false)
    setStatusText(null)
    await loadClientData({ silent: true })
  }
  const refreshClient = useCallback(async () => {
    await loadClientData({ silent: true })
  }, [loadClientData])

  // ---- stats ----
  const stats = {
    total: packages.length,
    active: packages.filter(s =>
      s.status === 'extracting' || s.status === 'uploaded' || s.status === 'ready'
    ).length,
    completed: packages.filter(s =>
      s.status === 'filled' || s.status === 'extracted'
    ).length,
    errors: packages.filter(s => s.status === 'error').length,
  }
  return {
    client,
    loading,
    error,

    packages,
    activePackageId,
    setActivePackageId,
    activePackage,
    selectedInputsByPackage,
    toggleInputSelection,
    selectAllInputs,
    clearInputSelection,

    uploadedRows,
    isUploading,
    statusText,
    message,
    workflowError,
    removeRow,

    createFolder,
    uploadFilesToActiveFolder,
    refreshClient,

    stats,
  }
}
