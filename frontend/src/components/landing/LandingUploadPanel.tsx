'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Plus,
  ShieldCheck,
  Table,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

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
  if (name.endsWith('.pdf')) {
    return <FileText className="h-5 w-5 text-red-500" />
  }
  if (name.endsWith('.csv')) {
    return <Table className="h-5 w-5 text-blue-600" />
  }
  return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
}

function isAcceptedFile(file: File) {
  if (ACCEPTED_TYPES.has(file.type)) return true
  const lowerName = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

export default function LandingUploadPanel({
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onContinue,
}: {
  files: File[]
  onAddFiles: (files: File[]) => void
  onRemoveFile: (index: number) => void
  onClearFiles: () => void
  onContinue: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  )

  const handleFiles = (incomingFiles: FileList | File[]) => {
    const nextFiles = Array.from(incomingFiles)
    const supportedFiles = nextFiles.filter(isAcceptedFile)

    if (supportedFiles.length !== nextFiles.length) {
      setError('Only PDF, Excel, and CSV files are supported in this preview.')
    } else {
      setError(null)
    }

    if (supportedFiles.length > 0) {
      onAddFiles(supportedFiles)
    }
  }

  return (
    <section className="relative -mt-10 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_30px_80px_-32px_rgba(37,99,235,0.35)]">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-400" />
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="border-b border-gray-100 p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                    Try It With Your Files
                  </div>
                  <h3 className="mt-3 text-2xl font-bold text-gray-900 sm:text-[30px]">
                    Drop source documents here first
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                    Add PDFs, spreadsheets, or CSVs to stage a submission preview. Files stay in
                    your browser until you sign in and continue.
                  </p>
                </div>
                {files.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearFiles}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear all
                  </button>
                )}
              </div>

              <motion.div
                animate={{
                  borderColor: isDragging ? 'rgb(59, 130, 246)' : 'rgb(209, 213, 219)',
                  backgroundColor: isDragging ? 'rgb(239, 246, 255)' : 'rgb(249, 250, 251)',
                }}
                transition={{ duration: 0.18 }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                  handleFiles(event.dataTransfer.files)
                }}
                onClick={() => inputRef.current?.click()}
                className="group cursor-pointer rounded-3xl border-2 border-dashed p-6 sm:p-8"
              >
                <div className="flex flex-col items-center justify-center text-center">
                  <motion.div
                    animate={{ scale: isDragging ? 1.04 : 1 }}
                    className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm"
                  >
                    <Upload className="h-8 w-8 text-blue-600" />
                  </motion.div>
                  <p className="text-base font-semibold text-gray-900">
                    Drag files here or click to browse
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Supports PDF, Excel, and CSV sources for a local submission preview
                  </p>
                  <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition group-hover:bg-blue-700">
                    <Plus className="h-4 w-4" />
                    Add files locally
                  </div>
                </div>
              </motion.div>

              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS.join(',')}
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    handleFiles(event.target.files)
                  }
                  event.target.value = ''
                }}
              />

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                  Files stay local until you continue
                </div>
                <span>Nothing is uploaded to AutoFil yet.</span>
              </div>
            </div>

            <div className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_45%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_100%)] p-6 sm:p-8">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Staged files</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {files.length} file{files.length === 1 ? '' : 's'} ready for processing
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm ring-1 ring-gray-100">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">Local total</p>
                  <p className="text-sm font-semibold text-gray-900">{formatFileSize(totalSize)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {files.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="rounded-3xl border border-dashed border-gray-200 bg-white/70 px-5 py-10 text-center"
                    >
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                        <FileText className="h-7 w-7 text-gray-400" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-gray-700">No files staged yet</p>
                      <p className="mt-1 text-sm text-gray-500">
                        Add source documents to preview the workflow before signing in.
                      </p>
                    </motion.div>
                  ) : (
                    files.map((file, index) => (
                      <motion.div
                        key={`${file.name}-${file.size}-${index}`}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 18 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-50">
                          {getFileIcon(file)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{file.name}</p>
                          <p className="mt-1 text-xs text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveFile(index)}
                          className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-6 rounded-3xl bg-slate-950 px-5 py-5 text-white shadow-[0_25px_70px_-32px_rgba(15,23,42,0.8)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
                  Next step
                </p>
                <p className="mt-2 text-lg font-semibold">Sign in to process and save this submission</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  We’ll keep these files in the browser for now, then send them to your real
                  workspace after you continue.
                </p>
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={files.length === 0}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  Continue with these files
                  <Upload className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
