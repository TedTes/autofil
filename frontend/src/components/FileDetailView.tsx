'use client'

import React from 'react'
import { Download } from 'lucide-react'
import type { Folder } from '@/types'

type FileDetailData = {
  name?: string
  client?: string
  date?: string
  confidence?: number
}

function isFileDetailData(value: unknown): value is FileDetailData {
  return typeof value === 'object' && value !== null
}

export function FileDetailView({
  data,
  currentFolder,
}: {
  data: unknown
  currentFolder: Folder | null
}) {
  const fileData: FileDetailData = isFileDetailData(data) ? data : {}

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {fileData.name || 'File details'}
            </h2>
            <p className="text-sm text-gray-600">
              {fileData.client || 'Client'} • Uploaded {fileData.date || 'recently'}
            </p>
            {currentFolder && (
              <p className="text-xs text-gray-400 mt-1">
                Folder: {currentFolder.name}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              Edit
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        <div className="aspect-[8.5/11] bg-gray-100 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">PDF Preview</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Extraction Results</h3>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b">
            <span className="text-sm text-gray-600">Confidence Score</span>
            <span className="text-sm font-medium text-green-600">
              {typeof fileData.confidence === 'number' ? fileData.confidence : 0}%
            </span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-sm text-gray-600">Fields Extracted</span>
            <span className="text-sm font-medium text-gray-900">24</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-gray-600">Status</span>
            <span className="text-sm font-medium text-blue-600">Ready</span>
          </div>
        </div>
      </div>
    </div>
  )
}
