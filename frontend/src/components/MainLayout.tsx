'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Download,
  Settings,
  HelpCircle,
  Menu,
  X,
 Save,  Loader2 ,
  TrendingUp,
  AlertTriangle,
  FileText,
  LayoutDashboard,
  Users,  
  FileStack,
  FolderOpen,
  BarChart3,
} from 'lucide-react'
import {
  UploadView,
  HomeView
} from './'
import { FileDetailView, DocumentsView,  ClientsView,
  SubmissionsView,   
  TemplatesView,   
  ReportsView,   
  HelpView ,ClientDetailView  } from './views'

import {
  getFolders,
  createFolder,
  getSubmissionStats,
} from '@/lib/api-client'

import type { Folder, ViewType,  FileDetailActions,ViewDataMap, SubmissionStats } from '@/types'

type ViewState = {
  type: ViewType
  data?: ViewStateData
  breadcrumbs: string[]
}

interface MainLayoutProps {
  children?: React.ReactNode
}

type ViewStateData = ViewDataMap[ViewType]


interface MainLayoutProps {
  children?: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false)
  const [fileDetailActions, setFileDetailActions] = useState<FileDetailActions | null>(null)
  const [currentView, setCurrentView] = useState<ViewState>({
    type: 'dashboard',
    breadcrumbs: ['Dashboard'],
  })

  //state to track closing animation
const [isMobileClosing, setIsMobileClosing] = useState(false)
const [isMobileOpening, setIsMobileOpening] = useState(false) 
  // Navigation history for back button
  const [viewHistory, setViewHistory] = useState<ViewState[]>([])

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showNavigationWarning, setShowNavigationWarning] = useState(false)
  const [documentsNeedRefresh, setDocumentsNeedRefresh] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<{
    type: ViewType
    data?: unknown
    breadcrumbs?: string[]
  } | null>(null)
  const [submissionStats, setSubmissionStats] = useState<SubmissionStats | null>(null)

  // Folders data
  const [folders, setFolders] = useState<Folder[]>([])
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null)

  // Load folders once
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

  useEffect(() => {
    void (async () => {
      try {
        const stats = await getSubmissionStats()
        setSubmissionStats(stats)
      } catch (err) {
        console.warn('Failed to load submission stats', err)
      }
    })()
  }, [])

  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [mobileSidebarOpen])


  // Enhanced navigation with unsaved changes guard
  const navigateTo = useCallback((
    type: ViewType,
    data?: unknown,
    breadcrumbs?: string[]
  ) => {
    // Check if navigating away from home with unsaved changes
    if (currentView.type === 'dashboard' && type !== 'dashboard' && hasUnsavedChanges) {
      setPendingNavigation({ type, data, breadcrumbs })
      setShowNavigationWarning(true)
      return
    }

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
  }, [currentView, hasUnsavedChanges, desktopSidebarCollapsed])

//  Update close handler
const handleMobileSidebarClose = () => {
  setIsMobileClosing(true)
  setTimeout(() => {
    setMobileSidebarOpen(false)
    setIsMobileClosing(false)
  }, 300) // Match animation duration
}

  const handleBreadcrumbClick = useCallback((index: number, crumb: string) => {
    const breadcrumbMap: Record<string, ViewType> = {
      'Dashboard': 'dashboard',
      'Clients': 'clients',
      'Submissions': 'submissions',
      'Templates': 'templates',
      'Documents': 'documents',
      'Reports': 'reports',
      'Settings': 'settings',
      'Help': 'help',
    }
  
    const viewType = breadcrumbMap[crumb]
    
    if (viewType) {
      const newBreadcrumbs = currentView.breadcrumbs.slice(0, index + 1)
      navigateTo(viewType, undefined, newBreadcrumbs)
    }
  }, [currentView.breadcrumbs, navigateTo])

  // Handle confirmed navigation (from warning dialog)
  const handleConfirmNavigation = useCallback(() => {
    if (pendingNavigation) {
      // Save current view to history
      setViewHistory((prev) => [...prev, currentView])

      // Navigate to pending view
      setCurrentView({
        type: pendingNavigation.type,
        data: pendingNavigation.data as ViewStateData,
        breadcrumbs: pendingNavigation.breadcrumbs || [
          pendingNavigation.type.charAt(0).toUpperCase() + pendingNavigation.type.slice(1)
        ],
      })

      setPendingNavigation(null)
      setHasUnsavedChanges(false)
    }
    setShowNavigationWarning(false)
  }, [pendingNavigation, currentView])

  // Handle cancel navigation
  const handleCancelNavigation = useCallback(() => {
    setShowNavigationWarning(false)
    setPendingNavigation(null)
  }, [])

  // Navigate back to previous view
  const navigateBack = useCallback(() => {
    if (viewHistory.length > 0) {
      const previous = viewHistory[viewHistory.length - 1]
      setCurrentView(previous)
      setViewHistory((prev) => prev.slice(0, -1))
    } else {
      // Default to home if no history
      navigateTo('dashboard', undefined, ['Dashboard'])
    }
  }, [viewHistory, navigateTo])

  // Handle file click - navigate to file detail view
  const handleFileClick = useCallback((submissionId: string, filename?: string) => {
    navigateTo('file-detail', { submissionId, filename }, ['Dashboard', 'Documents', filename || 'File'])
  }, [navigateTo])

  const navigationItems = [
    {
      id: 'dashboard' as const,
      label: 'Dashboard',
      icon: LayoutDashboard,
      onClick: () => navigateTo('dashboard', undefined, ['Dashboard']),
      section: 'primary' as const,
    },
    {
      id: 'clients' as const,
      label: 'Clients',
      icon: Users,
      onClick: () => navigateTo('clients', undefined, ['Dashboard', 'Clients']),
      section: 'primary' as const,
    },
    {
      id: 'submissions' as const,
      label: 'Submissions',
      icon: FileStack,
      onClick: () => navigateTo('submissions', undefined, ['Dashboard', 'Submissions']),
      section: 'primary' as const,
      // Optional: Add badge for pending count
      badge: '12',
    },
    {
      id: 'templates' as const,
      label: 'Templates & Forms',
      icon: FileText,
      onClick: () => navigateTo('templates', undefined, ['Dashboard', 'Templates']),
      section: 'primary' as const,
    },
    {
      id: 'documents' as const,
      label: 'Documents',
      icon: FolderOpen,
      onClick: () => navigateTo('documents', undefined, ['Dashboard', 'Documents']),
      section: 'primary' as const,
    },
    {
      id: 'reports' as const,
      label: 'Reports',
      icon: BarChart3,
      onClick: () => navigateTo('reports', undefined, ['Dashboard', 'Reports']),
      section: 'primary' as const,
    },
  ]
  // Create folder from Documents view
  const handleCreateFolder = useCallback(async (name: string) => {
    const newFolder = await createFolder(name)
    setFolders((prev) => [newFolder, ...prev])
    setCurrentFolder(newFolder)
    return newFolder
  }, [])

  const handleCreateFolderNoReturn = useCallback(async (name: string) => {
    await handleCreateFolder(name)
  }, [handleCreateFolder])

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
<aside className={`hidden lg:flex lg:flex-col bg-white border-r border-gray-200 transition-all duration-300 ease-in-out ${
  desktopSidebarCollapsed ? 'lg:w-0 lg:overflow-hidden' : 'lg:w-64'
} fixed left-0 top-0 bottom-0 z-40`}>
  
  {/* Sidebar Header - Fixed */}
  <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
    {/* Added flex-shrink-0 to prevent compression */}
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
        <TrendingUp className="w-5 h-5 text-white" />
      </div>
      <div>
        <h1 className="text-sm font-bold text-gray-900 leading-tight">AutoFil</h1>
        <p className="text-[10px] text-gray-500 leading-tight">Smart Form Automation</p>
      </div>
    </div>
    
    {/* Collapse Button */}
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

  {/* Sidebar Content - Scrollable */}
  <div className="flex-1 overflow-y-auto flex flex-col">
  {sidebarOpen ? (
    <>
      <div className="p-4">
        {/* Breathing room at top */}
        <div className="h-2"></div>
        
        {/* Navigation Section */}
        <nav>
        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 px-3 flex items-center gap-2">
  <span className="w-4 h-px bg-gray-300"></span>
  MAIN
</h3>

  <div className="space-y-0.5">
    {navigationItems.map((item) => {
      const Icon = item.icon
      const isActive = currentView.type === item.id
      return (
        <button
          key={item.id}
          onClick={item.onClick}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg 
            transition-all duration-200 group
            ${isActive
              ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }
          `}
        >
          <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${
            isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
          }`} />
          <span className="text-[13px] font-medium">{item.label}</span>
          
          {/* Badge for counts (optional) */}
          {item.badge && (
             <span className="ml-auto text-xs font-bold px-2 py-0.5 bg-blue-600 text-white rounded-full shadow-sm">
             {item.badge}
           </span>
          )}
          
          {/* Active indicator dot */}
          {isActive && !item.badge && (
            <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
          )}
        </button>
      )
    })}
  </div>
</nav>
      </div>
      
      {/* Spacer to push footer down */}
      <div className="flex-1"></div>
    </>
  ) : (
    <div className="p-2 space-y-2 mt-4">
      {navigationItems.map((item) => {
        const Icon = item.icon
        const isActive = currentView.type === item.id
        return (
          <button
            key={item.id}
            onClick={() => {
              item.onClick()
              handleMobileSidebarClose()
            }}
            className={`
              w-full p-2.5 rounded-lg transition-colors
              ${isActive
                ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }
            `}
            title={item.label}
          >
            <Icon className="w-5 h-5 mx-auto" />
          </button>
        )
      })}
    </div>
  )}
</div>

  {/* Footer - Fixed at bottom */}
  <div className="border-t border-gray-100 p-4 flex-shrink-0">
  <div className="space-y-1">
  <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 px-3 flex items-center gap-2">
  <span className="w-4 h-px bg-gray-300"></span>
  SUPPORT
</h3>
    
    {/* Settings Button */}
    <button
      onClick={() => navigateTo('settings', undefined, ['Dashboard', 'Settings'])}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg 
        transition-all duration-200 group
        ${currentView.type === 'settings'
          ? 'bg-blue-50 text-blue-700 shadow-sm'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
      `}
    >
      <Settings className={`w-[18px] h-[18px] flex-shrink-0 ${
        currentView.type === 'settings' ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
      }`} />
      <span className="text-[13px] font-medium">Settings</span>
      
      {currentView.type === 'settings' && (
        <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
      )}
    </button>

    {/* Help Button */}
    <button
      onClick={() => navigateTo('help', undefined, ['Dashboard', 'Help'])}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg 
        transition-all duration-200 group
        ${currentView.type === 'help'
          ? 'bg-blue-50 text-blue-700 shadow-sm'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
      `}
    >
      <HelpCircle className={`w-[18px] h-[18px] flex-shrink-0 ${
        currentView.type === 'help' ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
      }`} />
      <span className="text-[13px] font-medium">Help & Support</span>
      
      {currentView.type === 'help' && (
        <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
      )}
    </button>
  </div>
</div>
</aside>

  {/* Mobile Sidebar Overlay */}
{mobileSidebarOpen && (
  <div
  className={`lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${
    isMobileClosing ? 'opacity-0' : 'opacity-100'
  }`}
  onClick={handleMobileSidebarClose}
>
<aside
      className={`absolute left-0 top-0 bottom-0 w-80 bg-white shadow-xl flex flex-col transition-transform duration-300 ease-out
        ${isMobileClosing 
          ? '-translate-x-full' 
          : isMobileOpening 
            ? '-translate-x-full opacity-0' 
            : 'translate-x-0 opacity-100'
        }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Mobile Header*/}
      <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 bg-gradient-to-r from-blue-600 to-blue-700">
  <div className="flex items-center gap-2.5">
    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
      <TrendingUp className="w-5 h-5 text-blue-600" />
    </div>
    <div>
      <h1 className="text-sm font-bold text-white leading-tight">AutoFil</h1>
      <p className="text-[10px] text-blue-100 leading-tight">Smart Form Automation</p>
    </div>
  </div>
  <button
  onClick={handleMobileSidebarClose}
  className="p-2 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
>
  <X className="w-5 h-5" />
</button>
</div>

      {/* Mobile Content - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-8">
          {/* Breathing room */}
          <div className="h-2"></div>
          
          {/* Navigation */}
          <nav>
          <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 px-3 flex items-center gap-2">
  <span className="w-4 h-px bg-gray-300"></span>
  MAIN
</h3>

  <div className="space-y-0.5">
    {navigationItems.map((item) => {
      const Icon = item.icon
      const isActive = currentView.type === item.id
      return (
        <button
          key={item.id}
          onClick={() => {
            item.onClick()
            handleMobileSidebarClose()
          }}
          className={`
            w-full flex items-center gap-3 px-3 py-3.5 rounded-lg 
            transition-all duration-200 group
            ${isActive
              ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }
          `}
        >
          <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${
            isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
          }`} />
          <span className="text-[13px] font-medium">{item.label}</span>
          
          {/* Badge for counts (optional) */}
          {item.badge && (
             <span className="ml-auto text-xs font-bold px-2 py-0.5 bg-blue-600 text-white rounded-full shadow-sm">
             {item.badge}
           </span>
          )}
          
          {/* Active indicator dot */}
          {isActive && !item.badge && (
            <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
          )}
        </button>
      )
    })}
  </div>
</nav>
        </div>
      </div>

      {/* Mobile Footer*/}
      <div className="border-t border-gray-100 p-4 flex-shrink-0">
  <div className="space-y-1">
  <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 px-3 flex items-center gap-2">
  <span className="w-4 h-px bg-gray-300"></span>
  SUPPORT
</h3>
    
    {/* Settings Button */}
    <button
      onClick={() => navigateTo('settings', undefined, ['Dashboard', 'Settings'])}
      className={`
        w-full flex items-center gap-3 px-3 py-3.5 rounded-lg 
        transition-all duration-200 group
        ${currentView.type === 'settings'
          ? 'bg-blue-50 text-blue-700 shadow-sm'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
      `}
    >
      <Settings className={`w-[18px] h-[18px] flex-shrink-0 ${
        currentView.type === 'settings' ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
      }`} />
      <span className="text-[13px] font-medium">Settings</span>
      
      {currentView.type === 'settings' && (
        <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
      )}
    </button>

    {/* Help Button */}
    <button
      onClick={() => navigateTo('help', undefined, ['Dashboard', 'Help'])}
      className={`
        w-full flex items-center gap-3 px-3 py-3.5 rounded-lg 
        transition-all duration-200 group
        ${currentView.type === 'help'
          ? 'bg-blue-50 text-blue-700 shadow-sm'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
      `}
    >
      <HelpCircle className={`w-[18px] h-[18px] flex-shrink-0 ${
        currentView.type === 'help' ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
      }`} />
      <span className="text-[13px] font-medium">Help & Support</span>
      
      {currentView.type === 'help' && (
        <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
      )}
    </button>
  </div>
</div>
    </aside>
  </div>
)}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
  desktopSidebarCollapsed ? 'lg:ml-0' : 'lg:ml-64'
}`}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setMobileSidebarOpen(true)
                    setIsMobileOpening(true)
                    setTimeout(() => setIsMobileOpening(false), 50) // Quick reset
                  }}
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
          onClick={() => handleBreadcrumbClick(idx, crumb)}
          className="text-gray-600 hover:text-gray-900 transition-colors font-medium"
        >
          {crumb}
        </button>
      ) : (
        <span className="text-gray-900 font-semibold">{crumb}</span>
      )}
    </div>
  ))}
</nav>
              </div>

              <div className="flex items-center gap-2">
                {/* Show action buttons when in FileDetailView */}
                {currentView.type === 'file-detail' && fileDetailActions && (
                  <FileDetailActions actions={fileDetailActions} />
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

        {/* Views */}
        <main className={`flex-1 bg-gray-50 ${currentView.type === 'file-detail' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={currentView.type === 'file-detail' ? 'h-full' : 'px-4 sm:px-6 lg:px-8'}>
            
            {/* Home View */}
            {currentView.type === 'dashboard' && (
  <HomeView 
    totalSubmissions={submissionStats?.total_submissions ?? 0}
    submissionStats={submissionStats}
    onGoToFile={handleFileClick}
    onNavigateToDocuments={() => navigateTo('documents', undefined, ['Dashboard', 'Documents'])}
    onNavigateToClients={() => navigateTo('clients', undefined, ['Dashboard', 'Clients'])}
  />
)}

            {/* Documents View */}
            {currentView.type === 'documents' && (
              <DocumentsView
                folders={folders}
                currentFolder={currentFolder}
                onFolderChange={setCurrentFolder}
                onCreateFolder={handleCreateFolderNoReturn}
                onNavigate={navigateTo}
                onFileClick ={handleFileClick}
                shouldRefresh={documentsNeedRefresh}
                onRefreshComplete={() => setDocumentsNeedRefresh(false)}
              />
            )}

            {/* Upload View */}
            {currentView.type === 'upload' && (
              <UploadView 
                currentFolder={currentFolder}
                folders={folders}
                onFolderChange={setCurrentFolder}
                onCreateFolder={handleCreateFolder}
              />
            )}

            {/* File Detail View */}
            {currentView.type === 'file-detail' && currentView.data && 'submissionId' in currentView.data && (
              <FileDetailView
                submissionId={currentView.data.submissionId}
                filename={currentView.data.filename}
                onBack={navigateBack}
                onActionsReady={setFileDetailActions}
              />
            )}
{/* Settings */}
{currentView.type === 'settings' && (
  <div className="p-8">
    <h2 className="text-2xl font-bold text-gray-900 mb-4">Settings</h2>
    <p className="text-gray-600">Configuration options coming soon...</p>
  </div>
)}
{currentView.type === 'clients' && (
  <ClientsView
    onClientClick={(clientId) => {
      // Navigate to client detail view
      navigateTo('client-detail', { clientId, clientName: 'Client' }, ['Dashboard', 'Clients', 'Client'])
    }}
    onCreateClient={() => {
      // TODO: Open create client modal
      console.log('Create new client')
    }}
  />
)}
{currentView.type === 'client-detail' && currentView.data && 'clientId' in currentView.data && currentView.data.clientId && (
  <ClientDetailView
    clientId={currentView.data.clientId}
    clientName={('clientName' in currentView.data ? currentView.data.clientName : undefined)}
    onNavigateBack={() => navigateTo('clients', undefined, ['Dashboard', 'Clients'])}
    onFileClick={handleFileClick}
  />
)}

{currentView.type === 'submissions' && (
  <SubmissionsView
    onSubmissionClick={(submissionId) => {
      navigateTo('file-detail', { submissionId }, ['Dashboard', 'Submissions', 'Detail'])
    }}
  />
)}

{currentView.type === 'templates' && (
  <TemplatesView
    onTemplateClick={(templateId) => {
      // TODO: Show template preview
      console.log('View template:', templateId)
    }}
    onDownloadTemplate={(templateId) => {
      // TODO: Download blank template
      console.log('Download template:', templateId)
    }}
  />
)}

{currentView.type === 'reports' && (
  <ReportsView
    onExportReport={() => {
      // TODO: Export report
      console.log('Export report')
    }}
  />
)}

{currentView.type === 'help' && (
  <HelpView
    onContactSupport={() => {
      // TODO: Open support chat/modal
      console.log('Contact support')
    }}
  />
)}
            {children}
          </div>
        </main>
      </div>

      {/* Navigation Warning Dialog */}
      {showNavigationWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleCancelNavigation}
          />
          
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="flex items-start gap-4 p-6">
              <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Leave without saving?
                </h3>
                <p className="text-sm text-gray-600">
                  You have unsaved extracted data in your workflow. These changes will be lost if you navigate away.
                </p>
              </div>
            </div>
            
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleCancelNavigation}
                className="flex-1 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Stay
              </button>
              <button
                onClick={handleConfirmNavigation}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FileDetailActions({ 
  actions
}: { 
  actions: FileDetailActions
}) {
  if (!actions) return null
  
  const { hasChanges, isSaving, isExporting, isFilling, handleSave, handleExport, handleFill } = actions
  
  return (
    <>
      <button
        onClick={handleSave}
        disabled={!hasChanges || isSaving}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
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
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
          isExporting
            ? 'text-white bg-green-500 cursor-not-allowed'
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
      
      <button
        onClick={handleFill}
        disabled={isFilling}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
          isFilling
            ? 'text-white bg-purple-500 cursor-not-allowed'
            : 'text-white bg-purple-600 hover:bg-purple-700'
        }`}
      >
        {isFilling ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">Filling...</span>
          </>
        ) : (
          <>
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Fill PDF</span>
          </>
        )}
      </button>
    </>
  )
}
