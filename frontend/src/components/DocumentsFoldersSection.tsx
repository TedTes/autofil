'use client'

import { FolderPlus, Folder as FolderIcon } from 'lucide-react'
import { useState } from 'react'
import type { Folder } from '@/types'

export function FoldersSection({
  folders,
  onCreateFolder,
  onSelectFolder,
}: {
  folders: Folder[]
  onCreateFolder: (name: string) => Promise<void> | void
  onSelectFolder: (folder: Folder) => void
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    await onCreateFolder(name.trim())
    setName('')
    setCreating(false)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Folders</h3>
          <p className="text-xs text-gray-500">Organize forms, clients, or projects</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New folder name"
            className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-900 text-white rounded-md hover:bg-black/90 disabled:opacity-60"
          >
            <FolderPlus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3 p-4">
        {folders.length === 0 ? (
          <p className="text-xs text-gray-400">No folders yet.</p>
        ) : (
          folders.map((folder) => {
            const folderKey = folder.folder_id || folder.id || folder.name
            return (
            <button
              key={folderKey}
              onClick={() => onSelectFolder(folder)}
              className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 text-left transition"
            >
              <FolderIcon className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">{folder.name}</p>
                {folder.created_at && (
                  <p className="text-[10px] text-gray-400">
                    {new Date(folder.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </button>
          )})
        )}
      </div>
    </div>
  )
}
