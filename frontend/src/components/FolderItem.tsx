/**
 * Single folder item component .
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { Folder } from '@/types/folder'
import {
  Folder as FolderIcon,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react'

interface FolderItemProps {
  folder: Folder
  isActive: boolean
  onClick: () => void
  onRename: (folderId: string, newName: string) => Promise<void> | void
  onDelete: (folderId: string) => Promise<void> | void
}

export default function FolderItem({
  folder,
  isActive,
  onClick,
  onRename,
  onDelete,
}: FolderItemProps) {
  const fid = (folder).folder_id ?? (folder).id

  const [menuOpen, setMenuOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(folder.name)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const startEdit = () => {
    setDraftName(folder.name)
    setIsEditing(true)
    setMenuOpen(false)
  }

  const cancelEdit = () => {
    setDraftName(folder.name)
    setIsEditing(false)
  }

  const commitEdit = async () => {
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === folder.name) {
      setIsEditing(false)
      return
    }
    await onRename(fid, trimmed)
    setIsEditing(false)
  }

  const confirmDelete = async () => {
    setMenuOpen(false)
    if (confirm(`Delete folder "${folder.name}" and its contents?`)) {
      await onDelete(fid)
    }
  }

  return (
    <div className="relative">
      {/* OUTER: div role="button" instead of <button> to avoid nested button clicks being blocked */}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        className={`
          w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
          transition-all duration-200 cursor-pointer
          ${isActive
            ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }
        `}
      >
        {/* Icon */}
        <div
          className={`
            flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
            transition-colors duration-200
            ${isActive ? 'bg-blue-100' : 'bg-gray-50'}
          `}
        >
          <FolderIcon
            className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}
            fill={isActive ? 'currentColor' : 'none'}
          />
        </div>

        {/* Name / Inline edit */}
        <div className="flex-1 min-w-0 text-left">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                className="w-full text-sm px-2 py-1 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  commitEdit()
                }}
                className="p-1 rounded hover:bg-green-50"
                title="Save"
              >
                <Check className="w-4 h-4 text-green-600" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  cancelEdit()
                }}
                className="p-1 rounded hover:bg-red-50"
                title="Cancel"
              >
                <X className="w-4 h-4 text-red-600" />
              </button>
            </div>
          ) : (
            <>
              <p
                className={`
                  text-sm font-medium truncate transition-colors
                  ${isActive ? 'text-gray-900' : 'text-gray-700'}
                `}
              >
                {folder.name}
              </p>
              <p className="text-xs text-gray-500">
                {folder.file_count} file{folder.file_count !== 1 ? 's' : ''}
              </p>
            </>
          )}
        </div>

     

        {/* Kebab menu (keep as real buttons; stop propagation) */}
        {!isEditing && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }}
              className="p-1 rounded hover:bg-gray-100"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="w-4 h-4 text-gray-500" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    startEdit()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                  role="menuitem"
                >
                  <Pencil className="w-4 h-4 text-gray-600" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    confirmDelete()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  role="menuitem"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
