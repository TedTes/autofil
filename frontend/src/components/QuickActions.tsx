'use client'

import { Upload, FolderPlus, FileText, Download } from 'lucide-react'
import type { ViewType } from '@/types'

interface QuickActionsProps {
  onNavigate: (type: ViewType, data?: unknown, breadcrumbs?: string[]) => void
}

export function QuickActions({ onNavigate }: QuickActionsProps) {
  const actions = [
    {
      id: 'upload',
      title: 'Upload Document',
      description: 'Extract data from PDF',
      icon: Upload,
      color: 'bg-blue-500',
      onClick: () => onNavigate('upload', undefined, ['Home', 'Upload'])
    },
    {
      id: 'new-client',
      title: 'New Client',
      description: 'Create client folder',
      icon: FolderPlus,
      color: 'bg-green-500',
      onClick: () => {
        // TODO: would open modal or navigate to create form
        alert('Create Client Modal (to be implemented)')
      }
    },
    {
      id: 'new-submission',
      title: 'New Submission',
      description: 'Start from template',
      icon: FileText,
      color: 'bg-purple-500',
      onClick: () => {
        // TODO : would open modal
        alert('Create Submission Modal (to be implemented)')
      }
    },
    {
      id: 'quick-export',
      title: 'Quick Export',
      description: 'Export current view',
      icon: Download,
      color: 'bg-orange-500',
      onClick: () => onNavigate('export', undefined, ['Home', 'Export'])
    }
  ]

  return (
    <div className="space-y-3">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            className={`${action.color} text-white rounded-lg p-4 w-full text-left hover:opacity-90 transition-all shadow-sm hover:shadow-md`}
          >
            <div className="flex items-start gap-3">
              <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm leading-tight mb-1">
                  {action.title}
                </h4>
                <p className="text-xs opacity-90 leading-tight">
                  {action.description}
                </p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}