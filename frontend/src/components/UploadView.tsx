
'use client'

import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { uploadPdf } from '@/lib/api-client'
import { useState, useRef } from 'react'

export function UploadView() {
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file) return
    setUploading(true)
    setError(null)
    setSuccess(false)
    try {
      await uploadPdf(file)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  return (
    <div className="max-w-2xl py-6 space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Upload Files</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload documents without selecting an account. Files will be processed automatically.
        </p>
      </div>

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
              <p className="text-sm font-medium text-gray-700">Uploading...</p>
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
                <p className="mt-1 text-xs text-gray-400">PDF files only</p>
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

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="application/pdf"
      />
    </div>
  )
}
