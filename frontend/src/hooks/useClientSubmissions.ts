import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Client, ClientSubmissionPackage,OutputTemplate, TemplateSelection, GenerateOutputsResponse } from '@/types'
import {deleteInput, deleteOutput, deleteSubmission, generateOutputs as generateOutputsAPI, getClientById, getClientSubmissions, createClientSubmission, uploadPdf, getMergedData,calculateTemplateReadiness, getSubmissionPackage} from '@/lib'
import useToast from '@/hooks/useToast' 
import type { MergedData,UploadedRow } from '@/types'


function getFileType(filename: string): UploadedRow['fileType'] {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'xlsx' || ext === 'xls') return 'excel'
  if (ext === 'csv') return 'csv'
  return 'other'
}

export function useClientSubmissions(
  clientId: string,
  options?: { initialSubmissionId?: string }
) {
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [packages, setPackages] = useState<ClientSubmissionPackage[]>([])
  const initialSubmissionId = options?.initialSubmissionId ?? null
  const [activePackageId, setActivePackageId] = useState<string | null>(initialSubmissionId)
  const initialAppliedRef = useRef(false)
  const [standalonePackage, setStandalonePackage] = useState<ClientSubmissionPackage | null>(null)
  const [standaloneLoading, setStandaloneLoading] = useState(false)
  const [standaloneError, setStandaloneError] = useState<string | null>(null)
  const resolvedPackages = useMemo(() => {
    if (standalonePackage) {
      const exists = packages.some(pkg => pkg.submission_id === standalonePackage.submission_id)
      if (!exists) {
        return [...packages, standalonePackage]
      }
    }
    return packages
  }, [packages, standalonePackage])

  useEffect(() => {
    initialAppliedRef.current = false
    setActivePackageId(initialSubmissionId)
  }, [clientId, initialSubmissionId])

  const [uploadedRows, setUploadedRows] = useState<UploadedRow[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const [statusText, setStatusText] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)

  const [mergedData, setMergedData] = useState<MergedData | null>(null)
  const [isMergedDataLoading, setIsMergedDataLoading] = useState(false)
  const [mergedDataError, setMergedDataError] = useState<string | null>(null)


  const [availableTemplates, setAvailableTemplates] = useState<OutputTemplate[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  const [isGeneratingOutputs, setIsGeneratingOutputs] = useState(false)
  const [generateOutputsError, setGenerateOutputsError] = useState<string | null>(null)
  const [lastGenerationResult, setLastGenerationResult] = useState<GenerateOutputsResponse | null>(null)

  const toast = useToast()
  // Input file selection (existing)
  const [selectedInputsByPackage, setSelectedInputsByPackage] = useState<
    Record<string, string[]>
  >({})
  
  // NEW: Output file selection
  const [selectedOutputsByPackage, setSelectedOutputsByPackage] = useState<
    Record<string, string[]>
  >({})


  /**
 * Toggle template selection
 */
const toggleTemplateSelection = useCallback((templateId: string) => {
  setSelectedTemplateIds(prev => {
    const exists = prev.includes(templateId)
    return exists 
      ? prev.filter(id => id !== templateId)
      : [...prev, templateId]
  })
}, [])

const tempIdRef = useRef(0)

/**
 * Select all available templates
 */
const selectAllTemplates = useCallback(() => {
  if (!mergedData || !availableTemplates.length) return
  
  const availableIds = availableTemplates
    .filter(template => {
      const readiness = calculateTemplateReadiness(
        template.requiredDataSections,
        template.optionalDataSections || [],
        mergedData
      )
      return readiness.canGenerate
    })
    .map(t => t.id)
  
  setSelectedTemplateIds(availableIds)
}, [availableTemplates, mergedData])
/**
 * Deselect all templates
 */
const deselectAllTemplates = useCallback(() => {
  setSelectedTemplateIds([])
}, [])

/**
 * Check if a template can be generated
 */
const canGenerateTemplate = useCallback((templateId: string): boolean => {
  if (!mergedData) return false
  
  const template = availableTemplates.find(t => t.id === templateId)
  if (!template) return false
  
  const readiness = calculateTemplateReadiness(
    template.requiredDataSections,
    template.optionalDataSections || [],
    mergedData
  )
  
  return readiness.canGenerate
}, [availableTemplates, mergedData])

/**
 * Get template availability info
 */
const getTemplateAvailability = useCallback((templateId: string) => {
  if (!mergedData) return null
  
  const template = availableTemplates.find(t => t.id === templateId)
  if (!template) return null
  
  const readiness = calculateTemplateReadiness(
    template.requiredDataSections,
    template.optionalDataSections || [],
    mergedData
  )
  
  return {
    canGenerate: readiness.canGenerate,
    completeness: readiness.completeness,
    missingRequired: readiness.missingRequired,
    availableOptional: readiness.availableOptional,
  }
}, [availableTemplates, mergedData])

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
const refreshClient = useCallback(async () => {
  await loadClientData({ silent: true })
}, [loadClientData])
/**
 * Generate outputs from selected templates
 */
const generateOutputsFromTemplates = useCallback(async (packageId: string) => {
  if (!packageId || selectedTemplateIds.length === 0) {
    setGenerateOutputsError('No templates selected')
    return null
  }
  
  setIsGeneratingOutputs(true)
  setGenerateOutputsError(null)
  setLastGenerationResult(null)
  
  try {
    const result = await generateOutputsAPI({
      packageId,
      templateIds: selectedTemplateIds,
    })
    
    setLastGenerationResult(result)
    
    // Refresh client data to show new outputs
    await refreshClient()
    
    // Clear selection after successful generation
    setSelectedTemplateIds([])
    
    return result
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to generate outputs'
    setGenerateOutputsError(errorMessage)
    return null
  } finally {
    setIsGeneratingOutputs(false)
  }
}, [selectedTemplateIds, refreshClient])

/**
 * Load available templates (called when templates are fetched)
 */
const setTemplates = useCallback((templates: OutputTemplate[]) => {
  setAvailableTemplates(templates)
}, [])

// ---- Clear template selection when package changes (ADD TO EXISTING useEffect) ----
useEffect(() => {
  // Clear selections when active package changes
  setSelectedTemplateIds([])
  setGenerateOutputsError(null)
  setLastGenerationResult(null)
}, [activePackageId])
 

const activePackage = activePackageId
    ? resolvedPackages.find(pkg => pkg.submission_id === activePackageId)
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

  //  OUTPUT selection management ----
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



  useEffect(() => {
    void loadClientData()
  }, [loadClientData])

  useEffect(() => {
    let cancelled = false
    if (!initialSubmissionId) {
      setStandalonePackage(null)
      setStandaloneError(null)
      setStandaloneLoading(false)
      return
    }

    const exists = packages.some(pkg => pkg.submission_id === initialSubmissionId)
    if (exists) {
      setStandalonePackage(null)
      setStandaloneError(null)
      setStandaloneLoading(false)
      return
    }

    setStandaloneLoading(true)
    setStandaloneError(null)
    setStandalonePackage(null)

    void (async () => {
      try {
        const pkg = await getSubmissionPackage(initialSubmissionId)
        if (!cancelled) {
          setStandalonePackage(pkg)
          setStandaloneLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setStandaloneError(err instanceof Error ? err.message : 'Failed to load submission')
          setStandaloneLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [initialSubmissionId, packages])

  // keep activePackageId aligned with available packages and optional initial submission preference
  useEffect(() => {
    if (resolvedPackages.length === 0) {
      setActivePackageId(null)
      return
    }
    setActivePackageId(prev => {
      const packageIds = new Set(resolvedPackages.map(pkg => pkg.submission_id))
      if (!initialAppliedRef.current && initialSubmissionId && packageIds.has(initialSubmissionId)) {
        initialAppliedRef.current = true
        return initialSubmissionId
      }
      if (prev && packageIds.has(prev)) {
        initialAppliedRef.current = true
        return prev
      }
      initialAppliedRef.current = true
      return resolvedPackages[0].submission_id
    })
  }, [resolvedPackages, initialSubmissionId])

  // Clean up invalid selections when packages change
  useEffect(() => {
    setSelectedInputsByPackage(prev => {
      const validIds = new Set(resolvedPackages.map(pkg => pkg.submission_id))
      const next: Record<string, string[]> = {}
      for (const [pkgId, selections] of Object.entries(prev)) {
        if (validIds.has(pkgId)) {
          next[pkgId] = selections
        }
      }
      return next
    })
    
    setSelectedOutputsByPackage(prev => {
      const validIds = new Set(resolvedPackages.map(pkg => pkg.submission_id))
      const next: Record<string, string[]> = {}
      for (const [pkgId, selections] of Object.entries(prev)) {
        if (validIds.has(pkgId)) {
          next[pkgId] = selections
        }
      }
      return next
    })
  }, [resolvedPackages])


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

  const currentPackage = resolvedPackages.find(pkg => pkg.submission_id === activePackageId)
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

  /**
 * Delete an individual input file from a submission
 */
const deleteInputFile = async (submissionId: string, inputId: string) => {
  try {
    setWorkflowError(null)
    
    // Call API to delete the input
    await deleteInput(submissionId, inputId)
    
    // Clear selection for this input if it was selected
    setSelectedInputsByPackage(prev => {
      const current = prev[submissionId] || []
      const updated = current.filter(id => id !== inputId)
      return { ...prev, [submissionId]: updated }
    })
    
    // Refresh client data to update UI
    await loadClientData({ silent: true })
    
    // Show success message
    toast.success('File deleted successfully')
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete file'
    setWorkflowError(errorMsg)
    toast.error(errorMsg)
    throw err
  }
}

/**
 * Delete an individual output file from a submission
 */
const deleteOutputFile = async (submissionId: string, outputId: string) => {
  try {
    setWorkflowError(null)
    
    // Call API to delete the output
    await deleteOutput(submissionId, outputId)
    
    // Clear selection for this output if it was selected
    setSelectedOutputsByPackage(prev => {
      const current = prev[submissionId] || []
      const updated = current.filter(id => id !== outputId)
      return { ...prev, [submissionId]: updated }
    })
    
    // Refresh client data to update UI
    await loadClientData({ silent: true })
    
    // Show success message
    toast.success('Output deleted successfully')
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete output'
    setWorkflowError(errorMsg)
    toast.error(errorMsg)
    throw err
  }
}

/**
 * Delete an entire submission and all its files
 */
const deleteSubmissionPackage = async (submissionId: string) => {
  try {
    setWorkflowError(null)
    
    // Call API to delete the submission
    await deleteSubmission(submissionId)
    
    // Clear any selections for this submission
    setSelectedInputsByPackage(prev => {
      const next = { ...prev }
      delete next[submissionId]
      return next
    })
    
    setSelectedOutputsByPackage(prev => {
      const next = { ...prev }
      delete next[submissionId]
      return next
    })
    
    // If this was the active package, clear it
    if (activePackageId === submissionId) {
      setActivePackageId(null)
    }
    
    // Refresh client data to update UI
    await loadClientData({ silent: true })
    
    // Show success message
    toast.success('Submission deleted successfully')
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete submission'
    setWorkflowError(errorMsg)
    toast.error(errorMsg)
    throw err
  }
}
  


  // NEW: Enhanced stats calculation
  const stats = {
    // Package counts
    total: resolvedPackages.length,
    totalPackages: resolvedPackages.length,
    active: resolvedPackages.filter(s =>
      s.status === 'extracting' || s.status === 'uploaded' || s.status === 'ready'
    ).length,
    completed: resolvedPackages.filter(s =>
      s.status === 'filled' || s.status === 'extracted'
    ).length,
    errors: resolvedPackages.filter(s => s.status === 'error').length,

    // File counts across all packages
    totalFiles: resolvedPackages.reduce((sum, pkg) => sum + (pkg.file_count || 0), 0),
    extractedFiles: resolvedPackages.reduce((sum, pkg) => {
      const extractedCount = pkg.inputs?.filter(
        input => input.extraction_status === 'extracted' || input.extraction_status === 'ready'
      ).length || 0
      return sum + extractedCount
    }, 0),
    outputFiles: resolvedPackages.reduce((sum, pkg) => sum + (pkg.outputs?.length || 0), 0),
  }
  
  return {
    client,
    loading,
    error,

    packages: resolvedPackages,
    standaloneLoading,
    standaloneError,
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

  availableTemplates,
  selectedTemplateIds,
  isGeneratingOutputs,
  generateOutputsError,
  lastGenerationResult,
  toggleTemplateSelection,
  selectAllTemplates,
  deselectAllTemplates,
  canGenerateTemplate,
  getTemplateAvailability,
  generateOutputsFromTemplates,
  setTemplates,

  deleteInputFile,
    deleteOutputFile,
    deleteSubmissionPackage,
  }
}
