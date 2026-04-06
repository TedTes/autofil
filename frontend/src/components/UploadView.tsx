
'use client'

import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient, getClients, uploadPdf } from '@/lib/api-client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLandingUpload } from '@/contexts/LandingUploadContext'

const LANDING_ACCEPT = '.pdf,.xlsx,.xls,.csv'
const LANDING_DEFAULT_CLIENT_NAME = 'My Workspace'

export function UploadView() {
  const router = useRouter()
  const { files: stagedLandingFiles, setFiles: setStagedLandingFiles, clearFiles: clearLandingFiles } = useLandingUpload()
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [landingTransitionActive, setLandingTransitionActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoUploadStartedRef = useRef(false)
  const isLandingHandoff = landingTransitionActive || stagedLandingFiles.length > 0 || (uploading && autoUploadStartedRef.current)

  const getOrCreateLandingClient = useCallback(async () => {
    const clients = await getClients()
    const exactMatch = clients.find(
      (client) => client.name.trim().toLowerCase() === LANDING_DEFAULT_CLIENT_NAME.toLowerCase()
    )

    if (exactMatch) {
      return exactMatch
    }

    if (clients.length === 0) {
      return createClient(LANDING_DEFAULT_CLIENT_NAME)
    }

    return clients[0]
  }, [])

  const uploadFiles = useCallback(async (files: File[], source: 'manual' | 'landing') => {
    if (!files.length) return

    setUploading(true)
    setError(null)
    setSuccess(false)
    setStatusMessage(source === 'landing' ? 'Preparing your workspace...' : 'Uploading files...')
    if (source === 'landing') {
      setLandingTransitionActive(true)
    }

    const failedFiles: File[] = []
    const successfulResults: Array<{ submission_id?: string; filename?: string }> = []
    let landingClient: Awaited<ReturnType<typeof getOrCreateLandingClient>> | null = null

    try {
      if (source === 'landing') {
        landingClient = await getOrCreateLandingClient()
      }

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        setStatusMessage(
          source === 'landing'
            ? `Processing ${index + 1} of ${files.length}: ${file.name}`
            : `Uploading ${file.name}`
        )

        try {
          const result = await uploadPdf(
            file,
            undefined,
            source === 'landing' && landingClient
              ? { clientId: landingClient.client_id }
              : undefined
          )
          successfulResults.push(result)
        } catch (err) {
          failedFiles.push(file)
          console.error('Upload failed for file', file.name, err)
        }
      }

      if (failedFiles.length > 0) {
        setError(
          failedFiles.length === files.length
            ? 'None of the staged files could be uploaded. Please retry.'
            : `${failedFiles.length} file${failedFiles.length === 1 ? '' : 's'} could not be uploaded.`
        )
        if (source === 'landing') {
          setStagedLandingFiles(failedFiles)
        }
      } else {
        setSuccess(true)
        if (source === 'landing') {
          clearLandingFiles()
          const firstResult = successfulResults[0]
          if (firstResult?.submission_id && landingClient) {
            const params = new URLSearchParams()
            params.set('name', landingClient.name)
            params.set('submission', firstResult.submission_id)
            const query = params.toString()
            router.push(
              `/dashboard/clients/${landingClient.client_id}${query ? `?${query}` : ''}`
            )
            return
          }
          router.push('/dashboard/submissions')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setStatusMessage(null)
    }
  }, [clearLandingFiles, getOrCreateLandingClient, router, setStagedLandingFiles])

  useEffect(() => {
    if (!stagedLandingFiles.length) {
      autoUploadStartedRef.current = false
      return
    }

    if (autoUploadStartedRef.current || uploading) {
      return
    }

    autoUploadStartedRef.current = true
    setLandingTransitionActive(true)
    void uploadFiles(stagedLandingFiles, 'landing')
  }, [stagedLandingFiles, uploadFiles, uploading])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      void uploadFiles(files, 'manual')
    }
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) {
      void uploadFiles(files, 'manual')
    }
  }

  return (
    <div className="max-w-2xl py-6 space-y-4">
      {isLandingHandoff ? (
        <div className="flex min-h-[70vh] items-center">
          <div className="w-full rounded-3xl border border-blue-100 bg-white p-10 shadow-sm">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : success ? (
                  <CheckCircle2 className="h-8 w-8" />
                ) : error ? (
                  <AlertCircle className="h-8 w-8 text-red-500" />
                ) : (
                  <Upload className="h-8 w-8" />
                )}
              </div>

              <div className="mt-6 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
                  Setting Up Your Submission
                </p>
                <h1 className="text-3xl font-semibold text-gray-900">
                  {uploading
                    ? 'Processing your first document'
                    : success
                      ? 'Your document is ready'
                      : error
                        ? 'We could not finish the handoff'
                        : 'Preparing your workspace'}
                </h1>
                <p className="text-sm text-gray-600">
                  {uploading
                    ? statusMessage || 'Uploading your document and creating your workspace.'
                    : success
                      ? 'Taking you to your new submission now.'
                      : error
                        ? error
                        : 'Creating a workspace for your uploaded document.'}
                </p>
              </div>

              {stagedLandingFiles.length > 0 && (
                <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                    First Submission
                  </p>
                  <ul className="mt-3 space-y-2">
                    {stagedLandingFiles.map((file) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm text-gray-700"
                      >
                        <span className="truncate pr-4">{file.name}</span>
                        <span className="shrink-0 text-xs text-gray-500">
                          {Math.max(1, Math.round(file.size / 1024))} KB
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Upload Files</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload documents without selecting an account. Files will be processed automatically.
        </p>
      </div>

      {stagedLandingFiles.length > 0 && !uploading && !success && !error && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {stagedLandingFiles.length} staged file{stagedLandingFiles.length === 1 ? '' : 's'} from
          the landing page will upload automatically here.
        </div>
      )}

      {/* Drop Zone Card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

        {/* Card Header */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-gray-50">
          <Upload className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Drop or select a file</span>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5" />
            Browse files
          </button>
        </div>

        {/* Drop target */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-3 px-6 py-16 text-center cursor-pointer transition-colors ${
            dragOver ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="text-sm font-medium text-gray-700">{statusMessage || 'Uploading...'}</p>
            </>
          ) : success ? (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-sm font-medium text-gray-700">Upload complete</p>
              <button
                onClick={(e) => { e.stopPropagation(); setSuccess(false) }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Upload another file
              </button>
            </>
          ) : error ? (
            <>
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-sm font-medium text-gray-700">Upload failed</p>
              <p className="text-xs text-red-500">{error}</p>
              <button
                onClick={(e) => { e.stopPropagation(); setError(null) }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <FileText className="w-7 h-7 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Drop your file here, or{' '}
                  <span className="text-blue-600">browse</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">PDF, Excel, and CSV files supported</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tip */}
      {!uploading && !success && !error && (
        <p className="text-xs text-gray-400 px-1">
          To associate a file with a specific account, open the account and upload from there.
        </p>
      )}
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept={LANDING_ACCEPT}
        multiple
      />
    </div>
  )
}
