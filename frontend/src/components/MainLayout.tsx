'use client'

import { useState, useEffect } from 'react'
import {
  Home,
  Upload,
  FileText,
  FolderTree,
  Clock,
  GitCompare,
  Download,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  TrendingUp,
  Sparkles,
  Zap,
  CheckCircle2,
  ArrowRight,
  Calendar
} from 'lucide-react'
import { type ComponentType, type SVGProps } from 'react'

import QuickActions from '@/components/QuickActions'
import RecentActivity from '@/components/RecentActivity'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

interface FileData {
  client?: string
  name?: string
  date?: string
  confidence?: number
}

// View types
export type ViewType =
  | 'home'
  | 'upload'
  | 'files'
  | 'file-detail'
  | 'history'
  | 'compare'
  | 'export'

interface ViewState {
  type: ViewType
  data?: unknown
  breadcrumbs: string[]
}

interface MainLayoutProps {
  children?: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Current view state
  const [currentView, setCurrentView] = useState<ViewState>({
    type: 'home',
    breadcrumbs: ['Home']
  })

  // set to 0 to show onboarding
  const [totalSubmissions] = useState(0)

  // Navigation function
  const navigateTo = (type: ViewType, data?: unknown, breadcrumbs?: string[]) => {
    setCurrentView({
      type,
      data,
      breadcrumbs: breadcrumbs || [type.charAt(0).toUpperCase() + type.slice(1)]
    })
  }

  const navigationItems = [
    {
      id: 'home',
      label: 'Dashboard',
      icon: Home,
      onClick: () => navigateTo('home', undefined, ['Home'])
    },
    {
      id: 'files',
      label: 'Browse Files',
      icon: FolderTree,
      onClick: () => navigateTo('files', undefined, ['Home', 'Files'])
    },
    {
      id: 'history',
      label: 'History',
      icon: Clock,
      onClick: () => navigateTo('history', undefined, ['Home', 'History'])
    },
    {
      id: 'compare',
      label: 'Compare',
      icon: GitCompare,
      onClick: () => navigateTo('compare', undefined, ['Home', 'Compare'])
    },
    {
      id: 'export',
      label: 'Export',
      icon: Download,
      onClick: () => navigateTo('export', undefined, ['Home', 'Export'])
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`
          hidden lg:flex flex-col
          bg-white border-r border-gray-200
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-80' : 'w-16'}
        `}
      >
        {/* Sidebar Header */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4">
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-sm font-bold text-gray-900 leading-tight">AutoFil</h1>
                  <p className="text-[10px] text-gray-500 leading-tight">Smart Form Automation</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-full p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-5 h-5 mx-auto" />
            </button>
          )}
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {sidebarOpen ? (
            <div className="space-y-6">
              {/* Navigation */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  NAVIGATION
                </h3>
                <div className="space-y-1">
                  {navigationItems.map((item) => {
                    const Icon = item.icon
                    const isActive = currentView.type === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={item.onClick}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  RECENT ACTIVITY
                </h3>
                <RecentActivity onNavigate={navigateTo} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="w-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Quick Actions"
              >
                <TrendingUp className="w-5 h-5 mx-auto" />
              </button>
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={item.onClick}
                    className="w-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title={item.label}
                  >
                    <Icon className="w-5 h-5 mx-auto" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <aside
            className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-sm font-bold text-gray-900 leading-tight">AutoFil</h1>
                  <p className="text-[10px] text-gray-500 leading-tight">Smart Form Automation</p>
                </div>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  QUICK ACTIONS
                </h3>
                <QuickActions onNavigate={navigateTo} />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  NAVIGATION
                </h3>
                <div className="space-y-1">
                  {navigationItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          item.onClick()
                          setMobileSidebarOpen(false)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  RECENT ACTIVITY
                </h3>
                <RecentActivity onNavigate={navigateTo} />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <div className="lg:hidden">
                  <h1 className="text-lg font-bold text-gray-900">AutoFil</h1>
                </div>

                <div className="hidden lg:block">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {currentView.breadcrumbs[currentView.breadcrumbs.length - 1]}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Breadcrumbs */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 lg:px-8 py-2">
          <nav className="flex items-center space-x-2 text-sm">
            {currentView.breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center">
                {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />}
                <button
                  onClick={() => {
                    if (index === 0) navigateTo('home', undefined, ['Home'])
                  }}
                  className={`${
                    index === currentView.breadcrumbs.length - 1
                      ? 'text-gray-900 font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {crumb}
                </button>
              </div>
            ))}
          </nav>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-fadeIn">
              {currentView.type === 'home' && <HomeView totalSubmissions={totalSubmissions} />}
              {currentView.type === 'upload' && <UploadView />}
              {currentView.type === 'files' && <FilesView onNavigate={navigateTo} />}
              {currentView.type === 'file-detail' && <FileDetailView data={currentView.data} />}
              {currentView.type === 'history' && <HistoryView />}
              {currentView.type === 'compare' && <CompareView />}
              {currentView.type === 'export' && <ExportView />}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

// =====================
// VIEW COMPONENTS
// =====================

function HomeView({ totalSubmissions }: { totalSubmissions: number }) {
  if (totalSubmissions === 0) {
    return <EmptyDashboardState />
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-sm p-8 text-white">
        <h2 className="text-3xl font-bold mb-2">Welcome to AutoFil</h2>
        <p className="text-blue-100 text-lg">
          Intelligent document processing with automated extraction, version control, and export capabilities
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total Submissions" value="0" color="blue" />
        <StatCard icon={TrendingUp} label="Avg Confidence" value="0%" color="green" />
        <StatCard icon={CheckCircle2} label="Completed Today" value="0" color="purple" />
        <StatCard icon={Calendar} label="This Week" value="0" color="orange" />
      </div>
    </div>
  )
}

function EmptyDashboardState() {
  const [showWelcome, setShowWelcome] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowWelcome(false), 2600)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="relative max-w-5xl mx-auto space-y-5">


      {/* small steps row */}
      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        <CompactQuickStartStep number="1" icon={Upload} title="Upload" />
        <CompactQuickStartStep number="2" icon={Zap} title="Extract" />
        <CompactQuickStartStep number="3" icon={Download} title="Download" />
      </div>

      {/* dropzone */}
      <div className="bg-white rounded-2xl border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50/40 transition-all duration-200 group cursor-pointer">
        <div className="px-6 py-10 lg:px-8 lg:py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center transform group-hover:scale-105 transition-transform duration-200 shadow-lg">
            <Upload className="w-9 h-9 text-white" />
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-2">Upload Your First Document</h3>
          <p className="text-gray-600 mb-5 max-w-md mx-auto">
            Drag & drop or click to browse. We support ACORD, loss runs, financials, and more.
          </p>

          <button className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-200">
            <Upload className="w-4 h-4" />
            Choose File
          </button>

          <p className="text-sm text-gray-500 mt-3">PDF, Excel, CSV • up to 50MB</p>
        </div>
      </div>

      {/* feature highlights */}
      <div className="grid md:grid-cols-3 gap-5">
        <FeatureHighlight
          icon={CheckCircle2}
          iconColor="text-green-600"
          bgColor="bg-green-50"
          title="95%+ Accuracy"
          description="AI-powered extraction with confidence"
        />
        <FeatureHighlight
          icon={Clock}
          iconColor="text-purple-600"
          bgColor="bg-purple-50"
          title="Version Control"
          description="Track every change"
        />
        <FeatureHighlight
          icon={Zap}
          iconColor="text-orange-600"
          bgColor="bg-orange-50"
          title="Instant Results"
          description="Process documents in seconds"
        />
      </div>
    </div>
  )
}



function CompactQuickStartStep({
  number,
  icon: Icon,
  title
}: {
  number: string
  icon: IconComponent
  title: string
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-3 flex items-center gap-3 shadow-sm">
      <div className="w-9 h-9 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-semibold">
        {number}
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-800">
        <Icon className="w-4 h-4 text-blue-500" />
        <span className="font-medium">{title}</span>
      </div>
    </div>
  )
}

function UploadView() {
  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-blue-400 transition-colors">
        <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Documents</h3>
        <p className="text-sm text-gray-600 mb-6">Drag and drop your PDF files here, or click to browse</p>
        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Choose Files
        </button>
        <p className="text-xs text-gray-500 mt-4">Supported formats: PDF • Max size: 10MB per file</p>
      </div>
    </div>
  )
}

function FilesView({
  onNavigate
}: {
  onNavigate: (type: ViewType, data?: unknown, breadcrumbs?: string[]) => void
}) {
  const files = [
    { id: '1', name: 'ACORD_126.pdf', client: 'Client ABC', date: '2m ago', confidence: 95 },
    { id: '2', name: 'Application.pdf', client: 'Client XYZ', date: '15m ago', confidence: 88 }
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">All Files</h2>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Upload New</button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 divide-y">
        {files.map((file) => (
          <button
            key={file.id}
            onClick={() => onNavigate('file-detail', file, ['Home', 'Files', file.name])}
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
                <span className="text-sm font-medium text-green-600">{file.confidence}%</span>
                <p className="text-xs text-gray-500">Confidence</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function FileDetailView({ data }: { data: unknown }) {
  const fileData = data as FileData
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{fileData?.name || 'File Details'}</h2>
            <p className="text-sm text-gray-600">
              {fileData?.client || 'Client'} • Uploaded {fileData?.date || 'recently'}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Edit</button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Export</button>
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
            <span className="text-sm font-medium text-green-600">{fileData?.confidence || 0}%</span>
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

function HistoryView() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <Clock className="w-16 h-16 text-orange-600 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Version History</h2>
      <p className="text-gray-600">Track all changes with comprehensive audit trail</p>
    </div>
  )
}

function CompareView() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <GitCompare className="w-16 h-16 text-red-600 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Compare Documents</h2>
      <p className="text-gray-600">Compare data sources and resolve conflicts</p>
    </div>
  )
}

function ExportView() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <Download className="w-16 h-16 text-teal-600 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Export Data</h2>
      <p className="text-gray-600">Export data in multiple formats or send to external systems</p>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color
}: {
  icon: IconComponent
  label: string
  value: string
  color: string
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
    green: 'bg-green-50 border-green-100 text-green-600',
    purple: 'bg-purple-50 border-purple-100 text-purple-600',
    orange: 'bg-orange-50 border-orange-100 text-orange-600'
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

function FeatureHighlight({
  icon: Icon,
  iconColor,
  bgColor,
  title,
  description
}: {
  icon: IconComponent
  iconColor: string
  bgColor: string
  title: string
  description: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
      <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center mb-4`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  )
}
