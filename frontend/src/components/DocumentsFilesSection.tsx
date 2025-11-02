'use client'

import { FileText } from 'lucide-react'
import type { Folder } from '@/types'
import type { ViewType } from '@/types'
import { FolderSelect } from '@/components/FolderSelect' // use your own select

const MOCK_FILES = [
  { id: '1', name: 'ACORD_126.pdf', client: 'Client ABC', date: '2m ago', confidence: 95 },
  { id: '2', name: 'Application.pdf', client: 'Client XYZ', date: '15m ago', confidence: 88 },
]

export function FilesSection({
  currentFolder,
  folders,
  onFolderChange,
  onNavigate,
}: {
  currentFolder: Folder | null
  folders: Folder[]
  onFolderChange: (folder: Folder | null) => void
  onNavigate: (type: ViewType, data?: unknown, breadcrumbs?: string[]) => void
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Files</h3>
          <p className="text-xs text-gray-500">
            {currentFolder ? `In “${currentFolder.name}”` : 'All recent files'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FolderSelect
            folders={folders}
            value={currentFolder}
            onChange={onFolderChange}
          />
          <button
            onClick={() => onNavigate('upload', undefined, ['Home', 'Upload'])}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Upload
          </button>
        </div>
      </div>

      {/* list */}
      <div className="divide-y divide-gray-100">
        {MOCK_FILES.map((file) => (
          <button
            key={file.id}
            onClick={() =>
              onNavigate('file-detail', file, ['Home', 'Documents', file.name])
            }
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-7 h-7 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {file.client} • {file.date}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-green-600">{file.confidence}%</span>
              <p className="text-[10px] text-gray-400">Confidence</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
