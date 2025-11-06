'use client'

import { useState, useEffect } from 'react'
import {
  Home,
  Upload,
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
 Save,  Loader2 ,
  TrendingUp,
  FolderPlus,
} from 'lucide-react'
import {
  RecentActivity,
  UploadView,
  FolderView,
  HomeView,
  FilesView,
  DocumentsView
} from './'
import { FileDetailView } from './views/FileDetailView'

import {
  getFolders,
  createFolder,
} from '@/lib/api-client'

import type { Folder, ViewType } from '@/types'

// Type mapping for view data based on view type
type ViewDataMap = {
  'file-detail': { submissionId: string; filename?: string }
  'home': undefined
  'documents': undefined
  'upload': undefined
  'files': undefined
  'history': undefined
  'compare': undefined
  'export': undefined
  'folders': undefined
}

type ViewStateData = ViewDataMap[ViewType]

interface ViewState {
  type: ViewType
  data?: ViewStateData
  breadcrumbs: string[]
}

interface MainLayoutProps {
  children?: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false) // ✅ NEW
  const [currentView, setCurrentView] = useState<ViewState>({
    type: 'home',
    breadcrumbs: ['Home'],
  })
  // Navigation history for back button
  const [viewHistory, setViewHistory] = useState<ViewState[]>([])

  // folders data
  const [folders, setFolders] = useState<Folder[]>([])
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null)

  // load folders once
  useEffect(() => {
    void (async () => {
      try {
        const data = await getFolders()
        setFolders(data)
        if (data.length > 0) {
          setCurrentFolder(data[0])
        }
      } catch (err) {
        console.warn('Failed to load folders', err)
      }
    })()
  }, [])

  // Enhanced navigation with history tracking
  const navigateTo = (type: ViewType, data?: unknown, breadcrumbs?: string[]) => {
    // Save current view to history before navigating
    setViewHistory((prev) => [...prev, currentView])

    setCurrentView({
      type,
      data: data as ViewStateData,
      breadcrumbs: breadcrumbs || [type.charAt(0).toUpperCase() + type.slice(1)],
    })

    if (type === 'file-detail') {
      setDesktopSidebarCollapsed(true)
    } else if (desktopSidebarCollapsed) {
      // Auto-expand when leaving file detail view
      setDesktopSidebarCollapsed(false)
    }
  }

  // Navigate back to previous view
  const navigateBack = () => {
    if (viewHistory.length > 0) {
      const previous = viewHistory[viewHistory.length - 1]
      setCurrentView(previous)
      setViewHistory((prev) => prev.slice(0, -1))
    } else {
      // Default to home if no history
      navigateTo('home', undefined, ['Home'])
    }
  }

  // Handle file click - navigate to file detail view
  const handleFileClick = (submissionId: string, filename?: string) => {
    navigateTo('file-detail', { submissionId, filename }, ['Home', 'Documents', filename || 'File'])
  }

  // sidebar items
  const navigationItems = [
    {
      id: 'home',
      label: 'Dashboard',
      icon: Home,
      onClick: () => navigateTo('home', undefined, ['Home']),
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: FolderTree,
      onClick: () => navigateTo('documents', undefined, ['Home', 'Documents']),
    },
    {
      id: 'history',
      label: 'History',
      icon: Clock,
      onClick: () => navigateTo('history', undefined, ['Home', 'History']),
    },
    {
      id: 'compare',
      label: 'Compare',
      icon: GitCompare,
      onClick: () => navigateTo('compare', undefined, ['Home', 'Compare']),
    },
    {
      id: 'export',
      label: 'Export',
      icon: Download,
      onClick: () => navigateTo('export', undefined, ['Home', 'Export']),
    },
  ]

  // create folder from Documents view
  const handleCreateFolder = async (name: string) => {
    const newFolder = await createFolder(name)
    setFolders((prev) => [newFolder, ...prev])
    setCurrentFolder(newFolder)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`hidden lg:flex lg:flex-col bg-white border-r border-gray-200 transition-all duration-300 ease-in-out ${
  desktopSidebarCollapsed ? 'lg:w-0 lg:overflow-hidden' : 'lg:w-64'
}`}>
        {/* Sidebar Header */}
   
<div className="h-16 border-b border-gray-200 flex items-center justify-between px-4">
  <div className="flex items-center gap-2.5">
    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
      <TrendingUp className="w-5 h-5 text-white" />
    </div>
    <div>
      <h1 className="text-sm font-bold text-gray-900 leading-tight">AutoFil</h1>
      <p className="text-[10px] text-gray-500 leading-tight">Smart Form Automation</p>
    </div>
  </div>
  
  {/* ✅ Collapse Button (desktop only) */}
  <button
    onClick={() => setDesktopSidebarCollapsed(true)}
    className="hidden lg:block p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
    title="Collapse sidebar"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
    </svg>
  </button>
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
                          isActive
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-100'
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

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <aside
            className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Header */}
            <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
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

            {/* Mobile Nav */}
            <div className="p-4 space-y-6">
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

      {/* Main Content */}
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
  {/* Desktop Sidebar Toggle (shown when collapsed) */}
  {desktopSidebarCollapsed && (
    <button
      onClick={() => setDesktopSidebarCollapsed(false)}
      className="hidden lg:block p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      title="Show sidebar"
    >
      <Menu className="w-5 h-5" />
    </button>
  )}
                {/* Breadcrumbs */}
                <nav className="hidden lg:flex items-center gap-2 text-sm">
                  {currentView.breadcrumbs.map((crumb, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {idx > 0 && (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                      {idx < currentView.breadcrumbs.length - 1 ? (
                        <button
                          onClick={() => {
                            if (idx === 0) navigateTo('home', undefined, ['Home'])
                            else if (crumb === 'Documents') navigateTo('documents', undefined, ['Home', 'Documents'])
                          }}
                          className="text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          {crumb}
                        </button>
                      ) : (
                        <span className="text-gray-900 font-medium">{crumb}</span>
                      )}
                    </div>
                  ))}
                </nav>
              </div>

              <div className="flex items-center gap-2">
  {/* ✅ Show action buttons when in FileDetailView */}
  {currentView.type === 'file-detail' && currentView.data && (
    <FileDetailActions
      submissionId={currentView.data.submissionId}
      filename={currentView.data.filename}
    />
  )}
  
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

        {/* Views - CORRECTED */}
        <main className={`flex-1 bg-gray-50 ${currentView.type === 'file-detail' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={currentView.type === 'file-detail' ? 'h-full' : 'px-4 sm:px-6 lg:px-8 py-6'}>
            
            {/* Home View */}
            {currentView.type === 'home' && (
              <HomeView 
                totalSubmissions={0}
                onGoToFile={handleFileClick}
              />
            )}

            {/* Documents View - CORRECTED: Removed folders/currentFolder props */}
            {currentView.type === 'documents' && (
              <DocumentsView
                folders={folders}
                currentFolder={currentFolder}
                onFolderChange={setCurrentFolder}
                onCreateFolder={handleCreateFolder}
                onNavigate={navigateTo}
              />
            )}

            {/* Upload View */}
            {currentView.type === 'upload' && (
              <UploadView 
                currentFolder={currentFolder}
                folders={folders}
                onFolderChange={setCurrentFolder}
              />
            )}

            {/* File Detail View - CORRECTED: Pass correct props */}
            {currentView.type === 'file-detail' && currentView.data && (
              <FileDetailView
                submissionId={currentView.data.submissionId}
                filename={currentView.data.filename}
                onBack={navigateBack}
              />
            )}

            {/* History */}
            {currentView.type === 'history' && (
              <div className="p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">History</h2>
                <p className="text-gray-600">Version history coming soon...</p>
              </div>
            )}

            {/* Compare */}
            {currentView.type === 'compare' && (
              <div className="p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Compare</h2>
                <p className="text-gray-600">Document comparison coming soon...</p>
              </div>
            )}

            {/* Export */}
            {currentView.type === 'export' && (
              <div className="p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Export Center</h2>
                <p className="text-gray-600">Batch export options coming soon...</p>
              </div>
            )}

            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

// File Detail Action Buttons Component
function FileDetailActions({ 
  submissionId, 
  filename 
}: { 
  submissionId: string
  filename?: string 
}) {
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  // You'll need to access the FileDetailView state somehow
  // For now, using simple local state
  const [hasChanges, setHasChanges] = useState(false)
  
  const handleSave = async () => {
    setIsSaving(true)
    // TODO: Call save API
    setTimeout(() => setIsSaving(false), 1000)
  }
  
  const handleExport = async () => {
    setIsExporting(true)
    // TODO: Call export API
    setTimeout(() => setIsExporting(false), 1000)
  }
  
  return (
    <>
      <button
        onClick={handleSave}
        disabled={!hasChanges || isSaving}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
          hasChanges && !isSaving
            ? 'text-white bg-blue-600 hover:bg-blue-700'
            : 'text-gray-400 bg-gray-100 cursor-not-allowed'
        }`}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">Saving...</span>
          </>
        ) : (
          <>
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </>
        )}
      </button>
      
      <button
        onClick={handleExport}
        disabled={isExporting}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
          isExporting
            ? 'text-white bg-green-500'
            : 'text-white bg-green-600 hover:bg-green-700'
        }`}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">Exporting...</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </>
        )}
      </button>
    </>
  )
}