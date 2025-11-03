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
  TrendingUp,
  FolderPlus,
} from 'lucide-react'
import {RecentActivity,UploadView,FolderView,HomeView,FilesView,FileDetailView,DocumentsView} from './'



import {
  getFolders,
  createFolder,
} from '@/lib/api-client'

import type { Folder,ViewType } from '@/types' 


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

  const [currentView, setCurrentView] = useState<ViewState>({
    type: 'home',
    breadcrumbs: ['Home'],
  })

  // folders data
  const [folders, setFolders] = useState<Folder[]>([])
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null)

  // load folders once
  useEffect(() => {
    void (async () => {
      try {
        const data = await getFolders()
        setFolders(data)
        // pick first as current by default
        if (data.length > 0) {
          setCurrentFolder(data[0])
        }
      } catch (err) {
        console.warn('Failed to load folders', err)
      }
    })()
  }, [])

  const navigateTo = (type: ViewType, data?: unknown, breadcrumbs?: string[]) => {
    setCurrentView({
      type,
      data,
      breadcrumbs: breadcrumbs || [type.charAt(0).toUpperCase() + type.slice(1)],
    })
  }

  // sidebar items — note we now have "Documents" only
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
                  <TrendingUp className="w-5 h-5 text-white" />
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

        {/* Views */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            {currentView.type === 'home' && <HomeView totalSubmissions={0} />}

            {currentView.type === 'documents' && (
              <DocumentsView
                folders={folders}
                currentFolder={currentFolder}
                onFolderChange={setCurrentFolder}
                onCreateFolder={handleCreateFolder}
                onNavigate={navigateTo}
              />
            )}

            {currentView.type === 'upload' && (
              // keep your existing upload view here
              <div>Upload screen here… (reuse your old UploadView but pass folder)</div>
            )}

            {currentView.type === 'file-detail' && (
              <FileDetailView
                data={currentView.data}
                currentFolder={currentFolder}
              />
            )}

            {currentView.type === 'history' && <div>History view…</div>}
            {currentView.type === 'compare' && <div>Compare view…</div>}
            {currentView.type === 'export' && <div>Export view…</div>}

            {children}
          </div>
        </main>
      </div>
    </div>
  )
}