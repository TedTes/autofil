
'use client'

import { Upload } from 'lucide-react'
import type { Folder } from '@/types'
import { uploadPdf, uploadPdfToFolder } from '@/lib/api-client'
import { FolderSelect } from '@/components/FolderSelect'
import { useState } from 'react'

export function UploadView({
  currentFolder,
  folders,
  onFolderChange,
}: {
  currentFolder: Folder | null
  folders: Folder[]
  onFolderChange: (folder: Folder | null) => void
}) {
  const [uploading, setUploading] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      if (currentFolder?.id) {
        await uploadPdfToFolder(currentFolder.id, file)
      } else {
        await uploadPdf(file)
      }
      // TODO: toast success
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Upload documents</h2>
          <p className="text-sm text-gray-500">
            Choose where to store the upload. You can change the folder later.
          </p>
        </div>
        <FolderSelect
          folders={folders}
          value={currentFolder}
          onChange={onFolderChange}
          onCreate={async (name) => {
            // we can reuse your createFolder here if you want
            // but better to let MainLayout handle adding it to state
            // so leave empty or lift it
          }}
        />
      </div>

      <label
        className={`bg-white rounded-lg border-2 border-dashed ${
          uploading ? 'border-blue-300' : 'border-gray-300'
        } p-12 text-center hover:border-blue-400 transition-colors cursor-pointer block`}
      >
        <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {uploading ? 'Uploading...' : 'Drop your PDF here'}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {currentFolder ? `Will be saved to: ${currentFolder.name}` : 'Will be saved to: Unassigned'}
        </p>
        <input type="file" className="hidden" onChange={handleFileChange} accept="application/pdf" />
      </label>
    </div>
  )
}
