import { useCallback, useEffect, useRef, useState } from 'react'
import type { Client, ClientSubmissionPackage } from '@/types'
import { getClientById, getSubmission, createClientSubmission, uploadPdf } from '@/lib/api-client'

export type UploadedRow = {
  submissionId: string
  filename: string
  uploadedAt: string
  fileType: 'pdf' | 'excel' | 'csv' | 'other'
  fileSize: number
  uploadPercent: number
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'error'
  extractionProgress: number
  extractionError?: string
  confidence?: number
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
  const [isExtracting, setIsExtracting] = useState(false)

  const [statusText, setStatusText] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)

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

  // ---- load client & packages ----
  const loadClientData = useCallback(async () => {
    try {
      setLoading(true)
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
      setLoading(false)
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

  const activePackage = activePackageId
    ? packages.find(pkg => pkg.submission_id === activePackageId)
    : undefined

  // ---- create folder ----
  const createFolder = async (name: string) => {
    if (!name.trim()) return
    try {
      const created = await createClientSubmission(clientId, name.trim())
      await loadClientData()
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

        setUploadedRows(prev =>
          prev.map(row =>
            row.submissionId === tempId
              ? {
                  ...row,
                  submissionId: result.submission_id,
                  uploadPercent: 100,
                  extractionStatus: 'pending',
                  extractionProgress: 0,
                }
              : row
          )
        )
        setMessage(`Uploaded ${file.name}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        updateRow(tempId, { extractionStatus: 'error', extractionError: msg })
        setWorkflowError(msg)
      }
    }

    setIsUploading(false)
    setStatusText(null)
    setUploadedRows([])
    await loadClientData()
  }

  // ---- extract for selected files ----
  const extractSelected = async (selectedIds: string[]) => {
    if (!selectedIds.length) return
    setIsExtracting(true)
    setMessage(null)
    setWorkflowError(null)

    for (const submissionId of selectedIds) {
      updateRow(submissionId, {
        extractionStatus: 'extracting',
        extractionProgress: 0,
        extractionError: undefined,
      })

      try {
        // fake progress – your existing loop
        for (let progress = 20; progress <= 80; progress += 20) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise(resolve => setTimeout(resolve, 120))
          updateRow(submissionId, { extractionProgress: progress })
        }

        const submission = await getSubmission(submissionId)
        updateRow(submissionId, {
          extractionStatus: 'extracted',
          extractionProgress: 100,
          confidence: submission.confidence,
        })
        setMessage('Extraction complete')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Extraction failed'
        updateRow(submissionId, {
          extractionStatus: 'error',
          extractionError: msg,
        })
        setWorkflowError(msg)
      }
    }

    await loadClientData()
    setIsExtracting(false)
  }

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
  const successRate = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0

  return {
    client,
    loading,
    error,

    packages,
    activePackageId,
    setActivePackageId,
    activePackage,

    uploadedRows,
    isUploading,
    isExtracting,
    statusText,
    message,
    workflowError,
    removeRow,

    createFolder,
    uploadFilesToActiveFolder,
    extractSelected,

    stats,
    successRate,
  }
}
