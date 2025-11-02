'use client'

import { Upload, CheckCircle, FileEdit, FileCheck, Clock } from 'lucide-react'
import type { ViewType } from '@/types'
import { type ComponentType, type SVGProps } from 'react';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface ActivityItem {
  id: string
  icon: IconComponent
  iconColor: string
  bgColor: string
  text: string
  timestamp: string
  viewType: ViewType
  viewData?: unknown
  breadcrumbs: string[]
}

interface RecentActivityProps {
  onNavigate: (type: ViewType, data?:unknown, breadcrumbs?: string[]) => void
}

export function RecentActivity({ onNavigate }: RecentActivityProps) {
  // Mock data - replace with real data from your backend
  const activities: ActivityItem[] = [
    {
      id: '1',
      icon: Upload,
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      text: 'Uploaded ACORD_126.pdf',
      timestamp: 'Just now',
      viewType: 'file-detail',
      viewData: { id: '1', name: 'ACORD_126.pdf', client: 'Client ABC', confidence: 95 },
      breadcrumbs: ['Home', 'Files', 'ACORD_126.pdf']
    },
    {
      id: '2',
      icon: CheckCircle,
      iconColor: 'text-green-600',
      bgColor: 'bg-green-50',
      text: 'Extracted data with 95% confidence',
      timestamp: '1m ago',
      viewType: 'file-detail',
      viewData: { id: '1', name: 'ACORD_126.pdf', client: 'Client ABC', confidence: 95 },
      breadcrumbs: ['Home', 'Files', 'ACORD_126.pdf']
    },
    {
      id: '3',
      icon: FileEdit,
      iconColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
      text: 'Updated applicant information',
      timestamp: '2m ago',
      viewType: 'files',
      breadcrumbs: ['Home', 'Files']
    },
    {
      id: '4',
      icon: FileCheck,
      iconColor: 'text-orange-600',
      bgColor: 'bg-orange-50',
      text: 'Filled PDF successfully',
      timestamp: '3m ago',
      viewType: 'file-detail',
      viewData: { id: '2', name: 'Application.pdf', client: 'Client XYZ', confidence: 88 },
      breadcrumbs: ['Home', 'Files', 'Application.pdf']
    }
  ]

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Clock className="w-4 h-4 text-gray-500" />
        <h3 className="font-semibold text-sm text-gray-900">Recent Activity</h3>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-gray-100">
        {activities.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No recent activity
          </div>
        ) : (
          activities.map((activity) => {
            const Icon = activity.icon
            return (
              <button
                key={activity.id}
                onClick={() => onNavigate(activity.viewType, activity.viewData, activity.breadcrumbs)}
                className="w-full px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-start gap-3">
                  <div className={`${activity.bgColor} ${activity.iconColor} p-1.5 rounded flex-shrink-0`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 leading-tight mb-0.5">
                      {activity.text}
                    </p>
                    <p className="text-xs text-gray-500">
                      {activity.timestamp}
                    </p>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}