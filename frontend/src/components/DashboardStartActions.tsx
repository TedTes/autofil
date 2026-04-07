'use client'

import { useCallback, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'

import { HomeView } from './HomeView'
import { CreateSubmissionModal } from './CreateSubmissionmodal'
import { createClient as createClientApi, getClients } from '@/lib/api-client'
import type { Client, SubmissionStats } from '@/types'

type DashboardStartActionsProps = {
  submissionStats?: SubmissionStats | null
  isAuthenticated?: boolean
  onGoToFile?: (submissionId: string, filename?: string, inputId?: string) => void
  onNavigateToSubmissions?: () => void
  onNavigateToNeedsReview?: () => void
  onNavigateToReadyToGenerate?: () => void
  onNavigateToTemplates?: () => void
  onOpenClientDetail: (
    clientId: string,
    clientName: string,
    intent?: 'create-submission' | 'upload-files'
  ) => void
}

export function DashboardStartActions({
  submissionStats,
  isAuthenticated = true,
  onGoToFile,
  onNavigateToSubmissions,
  onNavigateToNeedsReview,
  onNavigateToReadyToGenerate,
  onNavigateToTemplates,
  onOpenClientDetail,
}: DashboardStartActionsProps) {
  const [accountPickerIntent, setAccountPickerIntent] = useState<'create-submission' | 'upload-files' | null>(null)
  const [dashboardClients, setDashboardClients] = useState<Client[]>([])
  const [dashboardClientsLoading, setDashboardClientsLoading] = useState(false)
  const [dashboardClientsError, setDashboardClientsError] = useState<string | null>(null)
  const [isCreateAccountModalOpen, setIsCreateAccountModalOpen] = useState(false)
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)

  const loadDashboardClients = useCallback(async () => {
    try {
      setDashboardClientsLoading(true)
      setDashboardClientsError(null)
      const data = await getClients()
      setDashboardClients(data)
      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load accounts'
      setDashboardClientsError(message)
      return []
    } finally {
      setDashboardClientsLoading(false)
    }
  }, [])

  const openAccountPicker = useCallback((intent: 'create-submission' | 'upload-files') => {
    setAccountPickerIntent(intent)
    void loadDashboardClients()
  }, [loadDashboardClients])

  const handleSelectClientForIntent = useCallback((clientId: string, clientName: string) => {
    if (!accountPickerIntent) return
    const nextIntent = accountPickerIntent
    setAccountPickerIntent(null)
    onOpenClientDetail(clientId, clientName, nextIntent)
  }, [accountPickerIntent, onOpenClientDetail])

  const handleCreateAccountFromDashboard = useCallback(async (name: string) => {
    if (isCreatingAccount) return
    try {
      setIsCreatingAccount(true)
      const newClient = await createClientApi(name)
      setDashboardClients((prev) => [newClient, ...prev.filter((client) => client.client_id !== newClient.client_id)])
      setIsCreateAccountModalOpen(false)

      if (accountPickerIntent) {
        const nextIntent = accountPickerIntent
        setAccountPickerIntent(null)
        onOpenClientDetail(newClient.client_id, newClient.name, nextIntent)
        return
      }

      onOpenClientDetail(newClient.client_id, newClient.name)
    } finally {
      setIsCreatingAccount(false)
    }
  }, [accountPickerIntent, isCreatingAccount, onOpenClientDetail])

  return (
    <>
      <HomeView
        submissionStats={submissionStats}
        isAuthenticated={isAuthenticated}
        onGoToFile={onGoToFile}
        onNavigateToClients={() => openAccountPicker('create-submission')}
        onNavigateToUpload={() => openAccountPicker('upload-files')}
        onNavigateToNewAccount={() => {
          setAccountPickerIntent(null)
          setIsCreateAccountModalOpen(true)
        }}
        onNavigateToSubmissions={onNavigateToSubmissions}
        onNavigateToNeedsReview={onNavigateToNeedsReview}
        onNavigateToReadyToGenerate={onNavigateToReadyToGenerate}
        onNavigateToTemplates={onNavigateToTemplates}
      />

      {accountPickerIntent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {accountPickerIntent === 'create-submission' ? 'Choose Account for New Submission' : 'Choose Account to Upload Files'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {accountPickerIntent === 'create-submission'
                    ? 'Pick the account that should own the new submission.'
                    : 'Pick the account you want to upload files into.'}
                </p>
              </div>
              <button
                onClick={() => setAccountPickerIntent(null)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6">
              {dashboardClientsLoading ? (
                <div className="py-12 text-center text-sm text-gray-500">Loading accounts...</div>
              ) : dashboardClientsError ? (
                <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-700">{dashboardClientsError}</p>
                  <button
                    onClick={() => void loadDashboardClients()}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : dashboardClients.length > 0 ? (
                <div className="space-y-3">
                  {dashboardClients.map((client) => {
                    const submissionCount = client.submission_count ?? client.submissions?.length ?? 0
                    return (
                      <button
                        key={client.client_id}
                        onClick={() => handleSelectClientForIntent(client.client_id, client.name)}
                        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-4 text-left hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{client.name}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {submissionCount} submission{submissionCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                  <p className="text-sm font-medium text-gray-900">No accounts yet</p>
                  <p className="mt-1 text-sm text-gray-500">Create an account first to continue.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                onClick={() => setAccountPickerIntent(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setIsCreateAccountModalOpen(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                New Account
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateSubmissionModal
        isOpen={isCreateAccountModalOpen}
        onClose={() => {
          if (!isCreatingAccount) {
            setIsCreateAccountModalOpen(false)
          }
        }}
        onConfirm={handleCreateAccountFromDashboard}
        isCreating={isCreatingAccount}
        existingNames={dashboardClients.map((client) => client.name)}
        title="New Account"
        confirmButtonText="Create Account"
        inputLabel="Account Name"
      />
    </>
  )
}
