'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  Table,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LandingPreviewResult } from '@/contexts/LandingUploadContext'

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
])

const ACCEPTED_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.csv']

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return <FileText className="h-4 w-4 text-red-400" />
  if (name.endsWith('.csv')) return <Table className="h-4 w-4 text-blue-500" />
  return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
}

function isAcceptedFile(file: File) {
  if (ACCEPTED_TYPES.has(file.type)) return true
  const lowerName = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

function formatPreviewValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function LandingUploadPanel({
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onContinue,
  isAuthenticated,
  previewFile,
  previewResult,
  isPreviewLoading,
  previewError,
  previewProgress,
  previewStageLabel,
  isContinuePending = false,
}: {
  files: File[]
  onAddFiles: (files: File[]) => void
  onRemoveFile: (index: number) => void
  onClearFiles: () => void
  onContinue: () => void
  isAuthenticated: boolean
  previewFile: File | null
  previewResult: LandingPreviewResult | null
  isPreviewLoading: boolean
  previewError: string | null
  previewProgress: number
  previewStageLabel: string
  isContinuePending?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const addMoreRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)

  const hasFiles = files.length > 0

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files]
  )

  const previewEntries = useMemo(() => {
    const semanticSections = Array.isArray(previewResult?.data?.semantic_sections)
      ? previewResult.data.semantic_sections
      : []
    const rows: Array<{ label: string; value: string }> = []
    for (const section of semanticSections) {
      const fields = Array.isArray(section?.fields) ? section.fields : []
      for (const field of fields) {
        const values = Array.isArray(field?.values) ? field.values : []
        const firstMeaningfulValue = values.find((entry: { value?: unknown }) => {
          const value = entry?.value
          if (value === null || value === undefined) return false
          return String(value).trim().length > 0
        })
        if (!firstMeaningfulValue) continue
        rows.push({
          label: field?.label || field?.id || 'Field',
          value: formatPreviewValue(firstMeaningfulValue.value),
        })
        if (rows.length >= 6) return rows
      }
    }
    const metadata = previewResult?.data?.metadata
    if (metadata && typeof metadata === 'object') {
      const fallbackKeys = ['form_type_detected', 'line_of_business', 'carrier']
      for (const key of fallbackKeys) {
        const value = (metadata as Record<string, unknown>)[key]
        if (value === null || value === undefined || String(value).trim().length === 0) continue
        rows.push({ label: key.replace(/[_-]/g, ' '), value: formatPreviewValue(value) })
        if (rows.length >= 6) break
      }
    }
    return rows
  }, [previewResult])

  const previewMeta = useMemo(() => {
    const metadata = previewResult?.data?.metadata
    if (!metadata || typeof metadata !== 'object') return null
    const meta = metadata as Record<string, unknown>
    return {
      formType: typeof meta.form_type_detected === 'string' ? meta.form_type_detected : null,
      lineOfBusiness: typeof meta.line_of_business === 'string' ? meta.line_of_business : null,
    }
  }, [previewResult])

  useEffect(() => {
    if (isPreviewLoading || previewResult || previewError) {
      setIsPreviewModalOpen(true)
    }
  }, [isPreviewLoading, previewError, previewResult])

  const handleFiles = (incoming: FileList | File[]) => {
    const next = Array.from(incoming)
    const supported = next.filter(isAcceptedFile)
    if (supported.length !== next.length) {
      setError('Only PDF, Excel, and CSV files are supported.')
    } else {
      setError(null)
    }
    if (supported.length > 0) {
      if (!isAuthenticated && files.length > 0) {
        onContinue()
        return
      }
      onAddFiles(supported)
    }
  }

  return (
    <section className="relative -mt-10 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[0_24px_64px_-24px_rgba(37,99,235,0.28)]">
          {/* Top accent line */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-400" />

          {/* Hidden file inputs */}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />
          <input
            ref={addMoreRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />

          <AnimatePresence mode="wait">
            {!hasFiles ? (
              /* ── EMPTY STATE: full-width inviting drop zone ── */
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="p-6 sm:p-8"
              >
                <div className="mb-6">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 mb-3">
                    Try It With Your Files
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Start with your documents</h3>
                  <p className="mt-1 text-sm text-gray-500 max-w-xl">
                    Drop a PDF, Excel, or CSV to stage a local submission preview. Nothing leaves your browser until you sign in.
                  </p>
                </div>

                <motion.div
                  animate={{
                    borderColor: isDragging ? 'rgb(59,130,246)' : 'rgb(209,213,219)',
                    backgroundColor: isDragging ? 'rgb(239,246,255)' : 'rgb(249,250,251)',
                  }}
                  transition={{ duration: 0.15 }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
                  onClick={() => inputRef.current?.click()}
                  className="group cursor-pointer rounded-2xl border-2 border-dashed py-14 px-8"
                >
                  <div className="flex flex-col items-center text-center">
                    <motion.div
                      animate={{ scale: isDragging ? 1.08 : 1, y: isDragging ? -4 : 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-gray-100"
                    >
                      <Upload className="h-8 w-8 text-blue-600" />
                    </motion.div>
                    <p className="text-lg font-semibold text-gray-900">
                      {isDragging ? 'Release to add files' : 'Drag files here or click to browse'}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      PDF, Excel, or CSV &mdash; stays local until you choose to continue
                    </p>
                    <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition group-hover:bg-blue-700 group-hover:shadow-md active:scale-[0.98]">
                      <Upload className="h-4 w-4" />
                      Browse files
                    </div>
                    <div className="mt-5 flex items-center gap-4 text-xs text-gray-400">
                      {['PDF', 'Excel', 'CSV'].map((fmt) => (
                        <span key={fmt} className="flex items-center gap-1">
                          <span className="h-1 w-1 rounded-full bg-gray-300" />
                          {fmt}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {error && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                  <Lock className="h-3 w-3" />
                  Files stay private in your browser. Nothing is sent to AutoFil until you sign in.
                </p>
              </motion.div>
            ) : (
              /* ── FILES STAGED: full-width extracted preview ── */
              <motion.div
                key="staged"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="p-6 sm:p-8"
              >
                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                        Staged locally
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-gray-900">
                        {files.length} {files.length === 1 ? 'file' : 'files'}
                        <span className="ml-2 text-xs font-normal text-gray-400">{formatFileSize(totalSize)}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onClearFiles}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <AnimatePresence initial={false}>
                      {files.map((file, index) => (
                        <motion.div
                          key={`${file.name}-${file.size}-${index}`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="group/row flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 hover:border-gray-200 hover:bg-white transition-colors">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-gray-100">
                              {getFileIcon(file)}
                            </div>
                            <p className="flex-1 truncate text-sm font-medium text-gray-800">{file.name}</p>
                            <span className="flex-shrink-0 text-xs text-gray-400 tabular-nums">
                              {formatFileSize(file.size)}
                            </span>
                            <button
                              type="button"
                              onClick={() => onRemoveFile(index)}
                              aria-label={`Remove ${file.name}`}
                              className="flex-shrink-0 rounded-md p-1 text-gray-300 opacity-0 group-hover/row:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50 p-5">
                    {isPreviewLoading ? (
                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            {previewStageLabel}
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-blue-700">
                            {Math.max(0, Math.min(100, Math.round(previewProgress)))}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400"
                            initial={{ width: '0%' }}
                            animate={{ width: `${Math.max(6, Math.min(100, previewProgress))}%` }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                          />
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-gray-500">
                          Building a one-file extraction preview from {previewFile?.name || 'your file'}...
                        </p>
                      </div>
                    ) : previewError ? (
                      <div>
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Preview extraction failed</p>
                            <p className="mt-1 text-xs leading-relaxed text-amber-700">{previewError}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onContinue}
                          disabled={isContinuePending}
                          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all disabled:cursor-wait disabled:bg-blue-500"
                        >
                          {isContinuePending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Sign in to continue
                          {!isContinuePending && <ArrowRight className="h-4 w-4" />}
                        </button>
                      </div>
                    ) : previewResult && previewEntries.length > 0 ? (
                      <div>
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                              Extracted Preview
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900 truncate">
                              {previewFile?.name || previewResult.file_name}
                            </p>
                            {(previewMeta?.formType || previewMeta?.lineOfBusiness) && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {previewMeta?.formType && (
                                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                                    {previewMeta.formType}
                                  </span>
                                )}
                                {previewMeta?.lineOfBusiness && (
                                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                                    {previewMeta.lineOfBusiness}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-blue-700">
                            {Math.round(previewResult.confidence * 100)}%
                          </div>
                        </div>

                        <div className="space-y-2 rounded-xl border border-white/70 bg-white/80 p-4">
                          {previewEntries.slice(0, 4).map((entry) => (
                            <div key={entry.label} className="grid gap-1 sm:grid-cols-[112px_1fr] sm:items-start">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                {entry.label}
                              </p>
                              <p className="text-sm text-gray-800 break-words">
                                {entry.value}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-gray-500">
                          <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                          Sign in to process all staged files, merge data, and continue in the workspace.
                        </div>
                        <button
                          type="button"
                          onClick={onContinue}
                          disabled={isContinuePending}
                          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all disabled:cursor-wait disabled:bg-blue-500"
                        >
                          {isContinuePending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Sign in to continue
                          {!isContinuePending && <ArrowRight className="h-4 w-4" />}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start gap-3 mb-4">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100">
                            <Lock className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              Ready to process
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                              Your file is staged in your browser. Sign in to upload it to AutoFil and continue.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onContinue}
                          disabled={isContinuePending}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all disabled:cursor-wait disabled:bg-blue-500"
                        >
                          {isContinuePending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Sign in to continue
                          {!isContinuePending && <ArrowRight className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Extraction preview modal */}
      <AnimatePresence>
        {isPreviewModalOpen && (previewResult || previewError || isPreviewLoading) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)]"
            >
              <div className="border-b border-gray-100 px-6 py-5 sm:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                      Extraction preview
                    </p>
                    <h3 className="mt-2 truncate text-2xl font-bold text-gray-900">
                      {previewFile?.name || 'Previewing your document'}
                    </h3>
                    {(previewMeta?.formType || previewMeta?.lineOfBusiness) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {previewMeta?.formType && (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                            {previewMeta.formType}
                          </span>
                        )}
                        {previewMeta?.lineOfBusiness && (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                            {previewMeta.lineOfBusiness}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {previewResult?.confidence !== undefined && !isPreviewLoading && !previewError && (
                      <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        {Math.round(previewResult.confidence * 100)}% confidence
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsPreviewModalOpen(false)}
                      className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                      aria-label="Close extraction preview"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-6 sm:px-8">
                {isPreviewLoading ? (
                  <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50">
                    <div className="w-full max-w-lg px-6">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-sm text-gray-700">
                          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                          <span>{previewStageLabel}</span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-blue-700">
                          {Math.max(0, Math.min(100, Math.round(previewProgress)))}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400"
                          initial={{ width: '0%' }}
                          animate={{ width: `${Math.max(6, Math.min(100, previewProgress))}%` }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                        />
                      </div>
                      <p className="mt-4 text-sm text-gray-500">
                        Building a one-file extraction preview from {previewFile?.name || 'your file'}...
                      </p>
                    </div>
                  </div>
                ) : previewError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <div>
                        <p className="font-semibold">Preview extraction failed</p>
                        <p className="mt-1 text-amber-700">{previewError}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-sm text-gray-500">
                        Review the extracted sample, then sign in to continue with the full submission.
                      </p>
                      {previewResult?.confidence !== undefined && (
                        <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {Math.round(previewResult.confidence * 100)}% confidence
                        </div>
                      )}
                    </div>

                    <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                      {previewResult && previewEntries.length > 0 ? (
                        <div className="space-y-3">
                          {previewEntries.map((entry) => (
                            <div key={entry.label} className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-start">
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                {entry.label}
                              </p>
                              <p className="text-sm text-gray-800 break-words">{entry.value}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">
                          AutoFil processed this file, but there were no preview fields worth showing yet.
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-2 text-xs text-gray-500">
                        <Lock className="h-3.5 w-3.5 text-gray-400" />
                        Sign in to process all staged files and continue in the workspace.
                      </p>
                      <button
                        type="button"
                        onClick={onContinue}
                        disabled={isContinuePending}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all disabled:cursor-wait disabled:bg-blue-500"
                      >
                        {isContinuePending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Sign in to continue
                        {!isContinuePending && <ArrowRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
