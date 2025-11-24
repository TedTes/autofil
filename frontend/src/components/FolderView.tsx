
'use client'

import type { Folder } from '@/types'
import { FolderTree, Plus } from 'lucide-react'

export function FolderView({
  folders,
  onSelectFolder,
  onCreateFolder,
}: {
  folders: Folder[]
  onSelectFolder: (folder: Folder) => void
  onCreateFolder?: (name: string) => void | Promise<void>
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Folders</h2>
          <p className="text-sm text-gray-500">Organize documents by client, policy, or carrier.</p>
        </div>
        {onCreateFolder && (
          <button
            onClick={async () => {
              const name = prompt('Folder name?')
              if (!name) return
              await onCreateFolder(name)
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Folder
          </button>
        )}
      </div>

      {folders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <FolderTree className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 mb-1">No folders yet.</p>
          <p className="text-sm text-gray-400">Create one to start organizing uploads.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map((folder) => {
            const folderKey = folder.folder_id || folder.id || folder.name
            return (
            <button
              key={folderKey}
              onClick={() => onSelectFolder(folder)}
              className="group rounded-xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow-sm p-4 text-left transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <FolderTree className="w-5 h-5" />
                </div>
                <p className="font-medium text-gray-900 group-hover:text-blue-700">
                  {folder.name}
                </p>
              </div>
              <p className="text-xs text-gray-400">
                {folder.created_at
                  ? new Date(folder.created_at).toLocaleDateString()
                  : '—'}
              </p>
            </button>
          )})}
        </div>
      )}
    </div>
  )
}
