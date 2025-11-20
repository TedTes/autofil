'use client'

import { FileText } from 'lucide-react'
import React from 'react'
import type { Folder,ViewType } from '@/types'

import { FolderSelect } from '@/components/FolderSelect'

type FilesViewProps = {
  onNavigate: (type: ViewType, data?: unknown, breadcrumbs?: string[]) => void
  currentFolder: Folder | null
  folders: Folder[]
  onFolderChange: (folder: Folder | null) => void
}

// mock files like your original code
const MOCK_FILES: Array<{
  id: string
  name: string
  client: string
  date: string
  confidence: number
  folder_id?: string
}> = [
  {
    id: '1',
    name: 'ACORD_126.pdf',
    client: 'Client ABC',
    date: '2m ago',
    confidence: 95,
  },
  {
    id: '2',
    name: 'Application.pdf',
    client: 'Client XYZ',
    date: '15m ago',
    confidence: 88,
  },
]

export function FilesView({
  onNavigate,
  currentFolder,
  folders,
  onFolderChange,
}: FilesViewProps) {
  // if you later have real folder_id, filter here
  const filesToShow = MOCK_FILES // currentFolder ? MOCK_FILES.filter(f => f.folder_id === currentFolder.id) : MOCK_FILES

  return (
    <div className="space-y-4">
      {/* header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
          <p className="text-sm text-gray-500">
            {currentFolder ? `Showing files in “${currentFolder.name}”` : 'Showing all files'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FolderSelect
            folders={folders}
            value={currentFolder}
            onChange={onFolderChange}
          />
          <button
            onClick={() => onNavigate('upload', undefined, ['Dashboard', 'Upload'])}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Upload
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 divide-y">
        {filesToShow.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">
            No files in this folder yet.
          </div>
        ) : (
          filesToShow.map((file) => (
            <button
              key={file.id}
              onClick={() =>
                onNavigate('file-detail', file, [
                  'Dashboard',
                  'Documents',
                  currentFolder ? currentFolder.name : 'All',
                  file.name,
                ])
              }
              className="w-full p-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-blue-600" />
                  <div>
                    <h4 className="font-semibold text-gray-900">{file.name}</h4>
                    <p className="text-sm text-gray-500">
                      {file.client} • {file.date}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-green-600">
                    {file.confidence}%
                  </span>
                  <p className="text-xs text-gray-500">Confidence</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
