'use client'

import { useState } from 'react'
import { ChevronDown, FolderPlus } from 'lucide-react'
import type { Folder } from '@/types'

interface FolderSelectProps {
  folders: Folder[]
  value: Folder | null
  onChange: (folder: Folder | null) => void
  onCreate?: (name: string) => Promise<void> | void
}

export function FolderSelect({ folders, value, onChange, onCreate }: FolderSelectProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:border-gray-300"
      >
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          {value ? value.name : 'Unassigned'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-52 rounded-lg bg-white shadow-lg ring-1 ring-black/5 overflow-hidden">
          <div className="py-1 max-h-64 overflow-y-auto">
            <button
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Unassigned
            </button>
            {folders.map((folder) => {
              const folderKey = folder.folder_id || folder.id || folder.name
              return (
              <button
                key={folderKey}
                onClick={() => {
                  onChange(folder)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {folder.name}
              </button>
            )})}
          </div>
          {onCreate && (
            <button
              onClick={async () => {
                if (creating) return
                const name = prompt('Folder name?')
                if (!name) return
                setCreating(true)
                try {
                  await onCreate(name)
                  setOpen(false)
                } finally {
                  setCreating(false)
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100"
            >
              <FolderPlus className="w-4 h-4" />
              New folder
            </button>
          )}
        </div>
      )}
    </div>
  )
}
