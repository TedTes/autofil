import { useCallback, useEffect, useRef, useState } from 'react'
import type { Client, ClientSubmissionPackage } from '@/types'
import { getClientById, getClientSubmissions, createClientSubmission, uploadPdf, getMergedData } from '@/lib/api-client'
import useToast from '@/hooks/useToast' 
import type { MergedData } from '@/types/merged-data'
export type UploadedRow = {
  submissionId: string
  filename: string
  uploadedAt: string
  fileType: 'pdf' | 'excel' | 'csv' | 'other'
  status?: 'totalFiles' | 'totalFiles' | 'statusFile' | 'extractedFile' | 'outputFile' | 'uploaded' | 'extracting' | 'error' | 'uploading' | 'extracted'
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

  const [mergedData, setMergedData] = useState<MergedData | null>(null)
  const [isMergedDataLoading, setIsMergedDataLoading] = useState(false)
  const [mergedDataError, setMergedDataError] = useState<string | null>(null)

  const toast = useToast()
  // Input file selection (existing)
  const [selectedInputsByPackage, setSelectedInputsByPackage] = useState<
    Record<string, string[]>
  >({})
  
  // NEW: Output file selection
  const [selectedOutputsByPackage, setSelectedOutputsByPackage] = useState<
    Record<string, string[]>
  >({})

  const tempIdRef = useRef(0)

  const activePackage = activePackageId
    ? packages.find(pkg => pkg.submission_id === activePackageId)
    : undefined
  const loadMergedData = useCallback(async (packageId: string) => {
    setIsMergedDataLoading(true)
    setMergedDataError(null)
    try {
      const data = await getMergedData(packageId)
      setMergedData(data)
    } catch (err) {
      setMergedDataError(err instanceof Error ? err.message : 'Failed to load merged data')
      setMergedData(null)
    } finally {
      setIsMergedDataLoading(false)
    }
  }, [])
useEffect(() => {
    if (activePackageId && activePackage) {
      // Check if package has extracted files
      const hasExtractedFiles = activePackage.inputs?.some(
        input => input.extraction_status === 'extracted' || input.extraction_status === 'ready'
      ) || false
      
      if (hasExtractedFiles) {
        loadMergedData(activePackageId)
      } else {
        setMergedData(null)
      }
    } else {
      setMergedData(null)
    }
  }, [activePackageId, activePackage, loadMergedData])
  
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

  // ---- INPUT selection management ----
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

  // NEW: OUTPUT selection management ----
  const toggleOutputSelection = (submissionId: string, filename: string) => {
    if (!submissionId || !filename) return
    setSelectedOutputsByPackage(prev => {
      const current = prev[submissionId] || []
      const exists = current.includes(filename)
      const nextSelections = exists
        ? current.filter(f => f !== filename)
        : [...current, filename]
      return { ...prev, [submissionId]: nextSelections }
    })
  }

  const selectAllOutputs = (submissionId: string, filenames: string[]) => {
    if (!submissionId) return
    if (!filenames.length) return
    setSelectedOutputsByPackage(prev => {
      const current = prev[submissionId] || []
      const allSelected = filenames.every(f => current.includes(f))
      return { ...prev, [submissionId]: allSelected ? [] : filenames }
    })
  }

  const clearOutputSelection = (submissionId: string) => {
    if (!submissionId) return
    setSelectedOutputsByPackage(prev => {
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
      const [detail, clientPackages] = await Promise.all([
        getClientById(clientId),
        getClientSubmissions(clientId),
      ])
      if (!detail) {
        setError('Client not found')
        return
      }
      setClient(detail)
      setPackages(clientPackages || [])
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

  // Clean up invalid selections when packages change
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
    
    // NEW: Also clean up output selections
    setSelectedOutputsByPackage(prev => {
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

const currentPackage = packages.find(pkg => pkg.submission_id === activePackageId)
  const packageName = currentPackage?.name ?? 'selected package'
    let successCount = 0
  let failureCount = 0
    for (const file of files) {
      const tempId = `tmp-${clientId}-${Date.now()}-${tempIdRef.current++}`
      const uploadedAt = new Date().toISOString()

      addRow({
        submissionId: tempId,
      filename: file.name,
      uploadedAt,
      fileType: getFileType(file.name),
      fileSize: file.size,
      status: 'uploading',
      uploadPercent: 0,
      extractionStatus: 'pending',
      extractionProgress: 0,
      })

      try {
        const result = await uploadPdf(
          file,
          (progress) => {
            setStatusText(`Uploading ${file.name} (${progress}%)`)
            updateRow(tempId, { uploadPercent: progress,status: 'uploading' })
          },
          { clientId, submissionId: activePackageId }
        )

      const extractionPayload = result?.data as Record<string, unknown> | undefined
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
                status: result ? 'extracted' : 'uploaded',
                extractionStatus: result ? 'extracted' : 'pending',
                extractionProgress: result ? 100 : 0,
                confidence: result?.confidence ?? payloadConfidence,
                extractionData: extractionPayload,
              }
            : row
        )
      )

      successCount += 1

      if (!result) {
        setMessage(`Uploaded ${file.name} (awaiting extraction)`)
      } else {
        setMessage(`Extracted ${file.name}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      failureCount += 1
      updateRow(tempId, {
        status: 'error',
        extractionStatus: 'error',
        extractionError: msg,
      })
      setWorkflowError(msg)
    }
  }

  setIsUploading(false)
  setStatusText(null)
  await loadClientData({ silent: true })
  setUploadedRows([])

    if (successCount > 0) {
      const filesWord = successCount === 1 ? 'file' : 'files'
      const text = `Moved ${successCount} ${filesWord} to "${packageName}"`
      toast.success(text)
      setMessage(text)
    } else if (failureCount > 0) {
      const filesWord = failureCount === 1 ? 'file' : 'files'
      toast.error(`Failed to upload ${failureCount} ${filesWord}`)
    }
  }
  
  const refreshClient = useCallback(async () => {
    await loadClientData({ silent: true })
  }, [loadClientData])

  // NEW: Enhanced stats calculation
  const stats = {
    // Package counts
    total: packages.length,
    totalPackages: packages.length,
    active: packages.filter(s =>
      s.status === 'extracting' || s.status === 'uploaded' || s.status === 'ready'
    ).length,
    completed: packages.filter(s =>
      s.status === 'filled' || s.status === 'extracted'
    ).length,
    errors: packages.filter(s => s.status === 'error').length,
    
    // File counts across all packages
    totalFiles: packages.reduce((sum, pkg) => sum + (pkg.file_count || 0), 0),
    extractedFiles: packages.reduce((sum, pkg) => {
      const extractedCount = pkg.inputs?.filter(
        input => input.extraction_status === 'extracted' || input.extraction_status === 'ready'
      ).length || 0
      return sum + extractedCount
    }, 0),
    outputFiles: packages.reduce((sum, pkg) => sum + (pkg.outputs?.length || 0), 0),
  }
  
  return {
    client,
    loading,
    error,

    packages,
    activePackageId,
    setActivePackageId,
    activePackage,
    
    // Input selection
    selectedInputsByPackage,
    toggleInputSelection,
    selectAllInputs,
    clearInputSelection,
    
    // NEW: Output selection
    selectedOutputsByPackage,
    toggleOutputSelection,
    selectAllOutputs,
    clearOutputSelection,

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
    mergedData,
  isMergedDataLoading,
  mergedDataError,
  loadMergedData,
  }
}
