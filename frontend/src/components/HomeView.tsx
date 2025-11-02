'use client'

import {
  CheckSquare,
  Calendar,
  Download,
  FileText,
  TrendingUp,
  Zap,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import React, { useRef } from 'react'

type HomeViewProps = {
  totalSubmissions: number
  onUploadFiles?: (files: File[]) => void
}

export function HomeView({ totalSubmissions, onUploadFiles }: HomeViewProps) {
  if (totalSubmissions === 0) {
    return <EmptyDashboardState onUploadFiles={onUploadFiles} />
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-sm p-8 text-white">
        <h2 className="text-3xl font-bold mb-2">Welcome to AutoFil</h2>
        <p className="text-blue-100 text-lg">
          Intelligent document processing with automated extraction, version control, and export
          capabilities
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total Submissions" value="0" color="blue" />
        <StatCard icon={TrendingUp} label="Avg Confidence" value="0%" color="green" />
        <StatCard icon={CheckSquare} label="Completed Today" value="0" color="purple" />
        <StatCard icon={Calendar} label="This Week" value="0" color="orange" />
      </div>
    </div>
  )
}

function EmptyDashboardState({
  onUploadFiles,
}: {
  onUploadFiles?: (files: File[]) => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const arr = Array.from(files)
      onUploadFiles?.(arr)
      e.target.value = ''
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Compact 3-step */}
      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        <CompactQuickStartStep number="1" icon={FileText} title="Upload" />
        <CompactQuickStartStep number="2" icon={Zap} title="Extract" />
        <CompactQuickStartStep number="3" icon={Download} title="Download" />
      </div>

      {/* Upload zone (full width) */}
      <div
        className="bg-white rounded-2xl border-2 border-dashed border-blue-200 hover:border-blue-400 transition-all duration-200 group cursor-pointer"
        onClick={triggerFilePicker}
      >
        <div className="px-8 py-14 text-center">
          <div className="w-16 h-16 mx-auto mb-5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center transform group-hover:scale-110 transition-transform duration-200 shadow-lg">
            <FileText className="w-9 h-9 text-white" />
          </div>

          <h3 className="text-2xl font-bold text-gray-900 mb-2">Upload your first document</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Drag and drop your PDF here, or click to browse. We support ACORD forms, loss runs,
            financial statements, and more.
          </p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              triggerFilePicker()
            }}
            className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all duration-150"
          >
            Upload document
          </button>

          <p className="text-sm text-gray-400 mt-4">PDF, Excel, CSV • up to 50 MB</p>
        </div>

        {/* hidden input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          multiple
          accept=".pdf,.csv,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />
      </div>

      {/* Highlights */}
      <div className="grid md:grid-cols-3 gap-6">
        <FeatureHighlight
          icon={CheckCircle2}
          iconColor="text-green-600"
          bgColor="bg-green-50"
          title="95%+ Accuracy"
          description="AI-powered extraction with high confidence scoring"
        />
        <FeatureHighlight
          icon={Clock}
          iconColor="text-purple-600"
          bgColor="bg-purple-50"
          title="Version Control"
          description="Track every change with complete audit history"
        />
        <FeatureHighlight
          icon={Zap}
          iconColor="text-orange-600"
          bgColor="bg-orange-50"
          title="Instant Results"
          description="Process documents in seconds, not hours"
        />
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  value: string
  color: 'blue' | 'green' | 'purple' | 'orange'
}) {
  const colors: Record<typeof color, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
    orange: 'bg-orange-50 border-orange-100 text-orange-700',
  }

  return (
    <div className={`${colors[color]} border rounded-lg p-6`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <p className="text-4xl font-bold">{value}</p>
    </div>
  )
}

function CompactQuickStartStep({
  number,
  icon: Icon,
  title,
}: {
  number: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  title: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-semibold">
        {number}
      </div>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-500" />
        <p className="text-sm font-medium text-gray-900">{title}</p>
      </div>
    </div>
  )
}

function FeatureHighlight({
  icon: Icon,
  iconColor,
  bgColor,
  title,
  description,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  iconColor: string
  bgColor: string
  title: string
  description: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-all duration-150">
      <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center mb-4`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  )
}
