'use client'

import { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import React from 'react'
import {
  Settings,
  HelpCircle,
  Menu,
  X,
  Save,
  Loader2,
  TrendingUp,
  FileText,
  LayoutDashboard,
  Users,
  FileStack,
  FolderOpen,
  BarChart3,
  ChevronRight,
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
  getSubmissionStats,
} from '@/lib/api-client'
import { useAuth } from '@/contexts/AuthContext'

import type { ViewType,  FileDetailActions,ViewDataMap, SubmissionStats } from '@/types'
import type { ClientDetailActions } from '@/types'
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'

type ViewState = {
  type: ViewType
  data?: ViewStateData
  breadcrumbs: string[]
}

interface MainLayoutProps {
  children?: React.ReactNode
}

type ViewStateData = ViewDataMap[ViewType]

const breadcrumbViewMap: Record<string, ViewType> = {
  Dashboard: 'dashboard',
  Documents: 'documents',
  Upload: 'upload',
  Accounts: 'clients',
  Submissions: 'submissions',
  Templates: 'templates',
  Reports: 'reports',
  Settings: 'settings',
  Help: 'help',
}

const NAV_ITEMS: Array<{
  id: ViewType
  label: string
  icon: React.ComponentType<{ className?: string }>
  route: ViewType
  badge?: string
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, route: 'dashboard' },
  { id: 'submissions', label: 'Submissions', icon: FileStack, route: 'submissions' },
  { id: 'clients', label: 'Accounts', icon: Users, route: 'clients' },
  { id: 'documents', label: 'Documents', icon: FolderOpen, route: 'documents' },
  { id: 'templates', label: 'Form Library', icon: FileText, route: 'templates' },
  { id: 'reports', label: 'Reports', icon: BarChart3, route: 'reports' },
]

function buildPathFromView(type: ViewType, data?: ViewStateData): string {
  switch (type) {
    case 'dashboard':
      return '/dashboard'
    case 'documents':
      return '/dashboard/documents'
    case 'upload':
      return '/dashboard/upload'
    case 'file-detail': {
      const detail = data as ViewDataMap['file-detail'] | undefined
      const submissionId = detail?.submissionId
      if (!submissionId) return '/dashboard/documents'
      const params = new URLSearchParams()
      if (detail?.filename) {
        params.set('filename', detail.filename)
      }
      if (detail?.inputId) {
        params.set('inputId', detail.inputId)
      }
      const query = params.toString()
      return `/dashboard/documents/file/${submissionId}${query ? `?${query}` : ''}`
    }
    case 'clients':
      return '/dashboard/clients'
    case 'client-detail': {
      const detail = data as ViewDataMap['client-detail'] | undefined
      const clientId = detail?.clientId
      if (!clientId) return '/dashboard/clients'
      const params = new URLSearchParams()
      if (detail?.clientName) params.set('name', detail.clientName)
      if (detail?.initialSubmissionId) params.set('submission', detail.initialSubmissionId)
      const query = params.toString()
      return `/dashboard/clients/${clientId}${query ? `?${query}` : ''}`
    }
    case 'submissions':
      {
        const detail = data as ViewDataMap['submissions'] | undefined
        const params = new URLSearchParams()
        if (detail?.status) params.set('status', detail.status)
        if (detail?.clientId) params.set('clientId', detail.clientId)
        const query = params.toString()
        return `/dashboard/submissions${query ? `?${query}` : ''}`
      }
    case 'templates':
      return '/dashboard/templates'
    case 'reports':
      return '/dashboard/reports'
    case 'settings':
      return '/dashboard/settings'
    case 'help':
      return '/dashboard/help'
    default:
      return '/dashboard'
  }
}

function mapPathToView(pathname: string, searchParams: URLSearchParams | ReadonlyURLSearchParams): ViewState {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'dashboard') {
    return { type: 'dashboard', breadcrumbs: ['Dashboard'] }
  }
  const slug = segments.slice(1)
  if (slug.length === 0) {
    return { type: 'dashboard', breadcrumbs: ['Dashboard'] }
  }

  const [section, ...rest] = slug

  switch (section) {
    case 'documents': {
      if (rest[0] === 'upload') {
        return { type: 'upload', breadcrumbs: ['Dashboard', 'Upload'] }
      }
      if (rest[0] === 'file' && rest[1]) {
        const filename = searchParams.get('filename') ?? undefined
        const inputId = searchParams.get('inputId') ?? undefined
        return {
          type: 'file-detail',
          data: { submissionId: rest[1], filename, inputId },
          breadcrumbs: ['Dashboard', 'Documents', filename || 'File'],
        }
      }
      return { type: 'documents', breadcrumbs: ['Dashboard', 'Documents'] }
    }
    case 'upload':
      return { type: 'upload', breadcrumbs: ['Dashboard', 'Upload'] }
    case 'clients': {
      if (rest[0]) {
        const name = searchParams.get('name') || undefined
        const initialSubmissionId = searchParams.get('submission') || undefined
        return {
          type: 'client-detail',
          data: { clientId: rest[0], clientName: name, initialSubmissionId },
          breadcrumbs: ['Dashboard', 'Accounts', name || 'Account'],
        }
      }
      return { type: 'clients', breadcrumbs: ['Dashboard', 'Accounts'] }
    }
    case 'submissions':
      return {
        type: 'submissions',
        data: {
          status: searchParams.get('status') || undefined,
          clientId: searchParams.get('clientId') || undefined,
        },
        breadcrumbs: ['Dashboard', 'Submissions'],
      }
    case 'templates':
      return { type: 'templates', breadcrumbs: ['Dashboard', 'Templates'] }
    case 'reports':
      return { type: 'reports', breadcrumbs: ['Dashboard', 'Reports'] }
    case 'settings':
      return { type: 'settings', breadcrumbs: ['Dashboard', 'Settings'] }
    case 'help':
      return { type: 'help', breadcrumbs: ['Dashboard', 'Help'] }
    default:
      return { type: 'dashboard', breadcrumbs: ['Dashboard'] }
  }
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false)
  const [fileDetailActions, setFileDetailActions] = useState<FileDetailActions | null>(null)
  const [clientDetailActions, setClientDetailActions] = useState<ClientDetailActions | null>(null)
  const [sidebarTransitionsEnabled, setSidebarTransitionsEnabled] = useState(false)

  //state to track closing animation
  const [isMobileClosing, setIsMobileClosing] = useState(false)
  const [isMobileOpening, setIsMobileOpening] = useState(false)
  const [submissionStats, setSubmissionStats] = useState<SubmissionStats | null>(null)

  const router = useRouter()
  const { user, signOut } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentView = useMemo(
    () => mapPathToView(pathname, searchParams),
    [pathname, searchParams]
  )
  const autoCollapsedRef = useRef(false)
  const widthCollapsedRef = useRef(false)
  const shouldForceWorkspaceCollapse =
    currentView.type === 'file-detail' || currentView.type === 'client-detail'
  const currentAccountLabel =
    currentView.type === 'client-detail' && currentView.data && 'clientName' in currentView.data
      ? currentView.data.clientName || 'Account'
      : null
  const userLabel = user?.email || user?.user_metadata?.full_name || null

  // Measure sidebar state on mount to avoid flicker on laptop-sized screens
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const shouldCollapse = window.innerWidth <= 1300
    setDesktopSidebarCollapsed(shouldCollapse)
    widthCollapsedRef.current = shouldCollapse
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

  useEffect(() => {
    if (shouldForceWorkspaceCollapse) {
      if (!desktopSidebarCollapsed) {
        setSidebarTransitionsEnabled(false)
        setDesktopSidebarCollapsed(true)
        autoCollapsedRef.current = true
      }
    } else if (autoCollapsedRef.current) {
      // Only expand back if we're not in a width-forced collapsed state
      if (!widthCollapsedRef.current) {
        setSidebarTransitionsEnabled(false)
        setDesktopSidebarCollapsed(false)
      }
      autoCollapsedRef.current = false
    }
  }, [shouldForceWorkspaceCollapse, desktopSidebarCollapsed])

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return
      const shouldCollapse = window.innerWidth <= 1300
      if (shouldCollapse && !desktopSidebarCollapsed) {
        setSidebarTransitionsEnabled(false)
        setDesktopSidebarCollapsed(true)
        widthCollapsedRef.current = true
      } else if (!shouldCollapse && widthCollapsedRef.current && !autoCollapsedRef.current) {
        setSidebarTransitionsEnabled(false)
        setDesktopSidebarCollapsed(false)
        widthCollapsedRef.current = false
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [desktopSidebarCollapsed])


  // Enhanced navigation with unsaved changes guard
  const navigateTo = useCallback((
    type: ViewType,
    data?: unknown,
    _breadcrumbs?: string[]
  ) => {
    const target = buildPathFromView(type, data as ViewStateData)
    router.push(target)
  }, [router])

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
      'Accounts': 'clients',
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

  // Navigate back to previous view
  const navigateBack = useCallback(() => {
    router.back()
  }, [router])

  // Handle file click - navigate to file detail view
  const handleFileClick = useCallback((submissionId: string, filename?: string, inputId?: string) => {
    navigateTo(
      'file-detail',
      { submissionId, filename, inputId },
      ['Dashboard', 'Documents', filename || 'File']
    )
  }, [navigateTo])

  const navigationItems = useMemo(
    () =>
      NAV_ITEMS.map(item => ({
        ...item,
        onClick: () => navigateTo(item.route),
      })),
    [navigateTo]
  )
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
<aside className={`hidden lg:flex lg:flex-col bg-white border-r border-gray-200 ${
  sidebarTransitionsEnabled ? 'transition-all duration-300 ease-in-out' : ''
} ${
  desktopSidebarCollapsed ? 'lg:w-16' : 'lg:w-64'
} fixed left-0 top-0 bottom-0 z-40`}>

  {/* Sidebar Header - Fixed */}
  <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
    <div className={`flex items-center gap-2.5 ${desktopSidebarCollapsed ? 'justify-center' : ''}`}>
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
        <TrendingUp className="w-5 h-5 text-white" />
      </div>
      {!desktopSidebarCollapsed && (
        <div className="transition-opacity duration-200">
          <h1 className="text-sm font-bold text-gray-900 leading-tight">AutoFil</h1>
          <p className="text-[10px] text-gray-500 leading-tight">Smart Form Automation</p>
        </div>
      )}
    </div>
    
    {/* Collapse Button */}
    <button
      onClick={() => {
        setSidebarTransitionsEnabled(true)
        setDesktopSidebarCollapsed(prev => !prev)
      }}
      className="hidden lg:block p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
      title={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      type="button"
    >
      <svg
        className={`w-4 h-4 transition-transform ${
          desktopSidebarCollapsed ? 'rotate-180' : ''
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
      </svg>
    </button>
  </div>

  {/* Sidebar Content - Scrollable */}
  <div className="flex-1 overflow-y-auto flex flex-col">
    <div className={`${desktopSidebarCollapsed ? 'p-2' : 'p-4'}`}>
      {/* Breathing room at top */}
      <div className="h-2"></div>
      
      {/* Navigation Section */}
      <nav>
        {!desktopSidebarCollapsed && (
          <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 px-3 flex items-center gap-2">
            <span className="w-4 h-px bg-gray-300"></span>
            MAIN
          </h3>
        )}

        <div className="space-y-0.5">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = currentView.type === item.id
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className={`
                  w-full flex items-center gap-3 py-2.5 rounded-lg 
                  transition-all duration-200 group
                  ${desktopSidebarCollapsed ? 'justify-center px-0' : 'px-3'}
                  ${isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
                title={desktopSidebarCollapsed ? item.label : undefined}
              >
                <Icon className={`flex-shrink-0 ${
                  desktopSidebarCollapsed && shouldForceWorkspaceCollapse ? 'w-5 h-5' : 'w-[18px] h-[18px]'
                } ${
                  isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
                }`} />
                <span className={`
                  text-[13px] font-medium transition-opacity duration-150
                  ${desktopSidebarCollapsed ? 'sr-only' : 'inline'}
                `}>
                  {item.label}
                </span>

                {!desktopSidebarCollapsed && item.badge && (
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 bg-blue-600 text-white rounded-full shadow-sm">
                    {item.badge}
                  </span>
                )}
                
                {!desktopSidebarCollapsed && isActive && !item.badge && (
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

    </aside>
  </div>
)}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-h-screen ${
  sidebarTransitionsEnabled ? 'transition-all duration-300' : ''
} ${
  desktopSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
}`}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8">
            {currentView.type === 'client-detail' ? (
              <div className="flex h-16 items-center gap-4 min-w-0">
                {/* Mobile menu */}
                <button
                  onClick={() => {
                    setMobileSidebarOpen(true)
                    setIsMobileOpening(true)
                    setTimeout(() => setIsMobileOpening(false), 50)
                  }}
                  className="lg:hidden flex-shrink-0 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Menu className="w-5 h-5" />
                </button>

                {/* Left: breadcrumb */}
                <nav className="flex min-w-0 items-center gap-1.5 text-sm">
                  {currentView.breadcrumbs.map((crumb, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" />}
                      <button
                        onClick={() => {
                          const targetView = breadcrumbViewMap[crumb]
                          if (targetView) navigateTo(targetView)
                        }}
                        className={`truncate transition-colors ${
                          i === currentView.breadcrumbs.length - 1
                            ? 'text-gray-900 font-semibold'
                            : 'text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        {crumb}
                      </button>
                    </React.Fragment>
                  ))}
                </nav>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Center-right: primary actions */}
                {clientDetailActions && (
                  <ClientDetailHeaderActions actions={clientDetailActions} />
                )}

                {/* Divider */}
                <div className="h-5 w-px bg-gray-200 flex-shrink-0 mx-2" />

                {/* Right: avatar menu */}
                <AvatarMenu
                  accountLabel={currentAccountLabel}
                  userLabel={userLabel}
                  onLogout={async () => {
                    await signOut()
                    router.push('/login')
                  }}
                  onSettings={() => navigateTo('settings', undefined, ['Dashboard', 'Settings'])}
                  onHelp={() => navigateTo('help', undefined, ['Dashboard', 'Help'])}
                />
              </div>
            ) : (
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
             {/* Breadcrumbs */}
            

{currentView.type !== 'dashboard' && (
  <nav className="flex items-center gap-2 text-sm text-gray-500">
    {currentView.breadcrumbs.map((crumb, i) => (
      <React.Fragment key={i}>
        {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
        <button
          onClick={() => {
            const targetView = breadcrumbViewMap[crumb]
            if (targetView) navigateTo(targetView)
          }}
          className={`transition-colors ${
            i === currentView.breadcrumbs.length - 1
              ? 'text-gray-900 font-semibold'
              : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          {crumb}
        </button>
      </React.Fragment>
    ))}
  </nav>
)}
              </div>

              <div className="flex items-center gap-2">
                {currentView.type === 'file-detail' && fileDetailActions && (
                  <>
                    <FileDetailActions actions={fileDetailActions} />
                    <div className="h-6 w-px bg-gray-200 flex-shrink-0" />
                  </>
                )}
                <AvatarMenu
                  userLabel={userLabel}
                  onLogout={async () => {
                    await signOut()
                    router.push('/login')
                  }}
                  onSettings={() => navigateTo('settings', undefined, ['Dashboard', 'Settings'])}
                  onHelp={() => navigateTo('help', undefined, ['Dashboard', 'Help'])}
                />
              </div>
            </div>
            )}
          </div>
        </header>

        {/* Views */}
        <main className={`flex-1 bg-gray-50 ${currentView.type === 'file-detail' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={currentView.type === 'file-detail' ? 'h-full' : 'px-4 sm:px-6 lg:px-8'}>
            
            {/* Home View */}
            {currentView.type === 'dashboard' && (
  <HomeView
    submissionStats={submissionStats}
    onGoToFile={handleFileClick}
    onNavigateToClients={() => navigateTo('clients', undefined, ['Dashboard', 'Accounts'])}
    onNavigateToUpload={() => navigateTo('upload', undefined, ['Dashboard', 'Upload'])}
    onNavigateToSubmissions={() => navigateTo('submissions', undefined, ['Dashboard', 'Submissions'])}
    onNavigateToNeedsReview={() => navigateTo('submissions', { status: 'error' }, ['Dashboard', 'Submissions'])}
    onNavigateToReadyToGenerate={() => navigateTo('submissions', { status: 'ready' }, ['Dashboard', 'Submissions'])}
    onNavigateToTemplates={() => navigateTo('templates', undefined, ['Dashboard', 'Templates'])}
  />
)}

            {/* Documents View */}
            {currentView.type === 'documents' && (
              <DocumentsView 
                onNavigate={navigateTo}
                onFileClick ={handleFileClick}
              />
            )}

            {/* Upload View */}
            {currentView.type === 'upload' && (
              <UploadView />
            )}

            {/* File Detail View */}
            {currentView.type === 'file-detail' && currentView.data && 'submissionId' in currentView.data && (
              <FileDetailView
                submissionId={currentView.data.submissionId}
                inputId={'inputId' in currentView.data ? currentView.data.inputId : undefined}
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
    onAccountClick={(clientId, clientName) => {
      navigateTo('client-detail', { clientId, clientName }, ['Dashboard', 'Accounts', clientName])
    }}
    onCreateAccount={() => {
      console.log('Create new account')
    }}
  />
)}
{currentView.type === 'client-detail' && currentView.data && 'clientId' in currentView.data && currentView.data.clientId && (
  <ClientDetailView
    clientId={currentView.data.clientId}
    clientName={('clientName' in currentView.data ? currentView.data.clientName : undefined)}
    initialSubmissionId={('initialSubmissionId' in currentView.data ? currentView.data.initialSubmissionId : undefined)}
    onFileClick={handleFileClick}
    onActionsReady={setClientDetailActions}
  />
)}

{currentView.type === 'submissions' && (
  <SubmissionsView
    initialStatusFilter={
      currentView.data && 'status' in currentView.data ? currentView.data.status : undefined
    }
    onSubmissionClick={(submission) => {
      if (submission.client_id) {
        navigateTo(
          'client-detail',
          {
            clientId: submission.client_id,
            clientName: submission.client_name || 'Account',
            initialSubmissionId: submission.submission_id,
          },
          ['Dashboard', 'Accounts', submission.client_name || 'Account']
        )
        return
      }
      navigateTo(
        'file-detail',
        { submissionId: submission.submission_id },
        ['Dashboard', 'Submissions', 'Detail']
      )
    }}
  />
)}

{currentView.type === 'templates' && (
  <TemplatesView
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

    </div>
  )
}

function AvatarMenu({
  accountLabel,
  userLabel,
  onLogout,
  onSettings,
  onHelp,
}: {
  accountLabel?: string | null
  userLabel?: string | null
  onLogout: () => Promise<void> | void
  onSettings: () => void
  onHelp: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const avatarInitial = (userLabel || accountLabel || 'N').trim().charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 active:scale-95 transition-all duration-100"
        aria-label="User menu"
      >
        {avatarInitial}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-gray-200 bg-white shadow-lg py-1 text-sm">
          {userLabel && (
            <>
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400">Signed in as</p>
                <p className="truncate font-medium text-gray-900">{userLabel}</p>
              </div>
              <div className="my-1 border-t border-gray-100" />
            </>
          )}
          {accountLabel && (
            <>
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400">Account workspace</p>
                <p className="truncate font-medium text-gray-900">{accountLabel}</p>
              </div>
              <div className="my-1 border-t border-gray-100" />
            </>
          )}
          <button
            onClick={() => { onSettings(); setOpen(false) }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Settings className="h-4 w-4 text-gray-400" />
            Settings
          </button>
          <button
            onClick={() => { onHelp(); setOpen(false) }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <HelpCircle className="h-4 w-4 text-gray-400" />
            Help & Support
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => {
              void onLogout()
              setOpen(false)
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-red-600 hover:bg-red-50 transition-colors"
          >
            <X className="h-4 w-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

function ClientDetailHeaderActions({ actions }: { actions: ClientDetailActions }) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Secondary: ghost buttons — icon primary, label secondary */}
      <button
        onClick={actions.openNewSubmission}
        title="New Submission"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100 active:scale-95 active:bg-gray-200 transition-all duration-100"
      >
        <FileStack className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline text-xs font-medium">New Submission</span>
      </button>
      <button
        onClick={actions.openAddFiles}
        disabled={actions.isUploading}
        title="Add Files"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100 active:scale-95 active:bg-gray-200 transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        <FolderOpen className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline text-xs font-medium">Add Files</span>
      </button>

      {/* Primary: Generate — filled, weighted */}
      <button
        onClick={actions.openGenerate}
        disabled={!actions.canGenerate}
        title={!actions.canGenerate ? 'Select files to enable generation' : undefined}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-100 active:scale-95 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:active:scale-100"
      >
        <FileText className="w-4 h-4 flex-shrink-0" />
        <span className="text-xs">Generate</span>
        {actions.selectedTemplateCount > 0 && (
          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums">
            {actions.selectedTemplateCount}
          </span>
        )}
      </button>
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
    </>
  )
}
