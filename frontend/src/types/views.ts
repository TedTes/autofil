/**
 * View type definitions for navigation
 */

/**
 * All available view types in the application
 */
export type ViewType = 
  | 'dashboard'      // Main overview page
  | 'documents'      // Document library - searchable files (inputs + outputs)
  | 'upload'         // Upload view
  | 'file-detail'    // File detail view
  | 'clients'        // Clients list view
  | 'client-detail'  // Individual client detail with submissions
  | 'submissions'    // Global submissions view across all clients
  | 'templates'      // Templates & Forms - ACORD forms, blank templates
  | 'reports'        // Analytics - fill success, turnaround time, tasks
  | 'settings'       // Settings - user/org preferences, API keys, billing
  | 'help'           // Help & Support - guides and contact

/**
 * Type mapping for view-specific data
 * Defines what data each view type expects when navigating
 */
export type ViewDataMap = {
  'dashboard': undefined
  'documents': undefined
  'upload': undefined
  'file-detail': { submissionId: string; filename?: string; inputId?: string }
  'clients': undefined
  'client-detail': { clientId: string; clientName?: string }
  'submissions': { status?: string; clientId?: string } | undefined
  'templates': undefined
  'reports': undefined
  'settings': undefined
  'help': undefined
}

/**
 * Extract the data type for a given view
 */
export type ViewStateData = ViewDataMap[ViewType]

/**
 * View state structure
 */
export interface ViewState {
  type: ViewType
  data?: ViewStateData
  breadcrumbs: string[]
}

/**
 * Navigation item structure for sidebar
 */
export interface NavigationItem {
  id: ViewType
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  badge?: string | number
  section?: 'primary' | 'secondary'
}
