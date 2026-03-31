'use client'

import React, { useEffect, useState } from 'react'
import { Users, Plus, Search, Building2, Calendar, AlertCircle, Loader2, FileStack, ChevronRight } from 'lucide-react'
import type { Client } from '@/types'
import { getClients, createClient as createClientApi } from '@/lib/api-client'
import { CreateSubmissionModal } from '@/components'

interface ClientsViewProps {
  onAccountClick?: (clientId: string, clientName: string) => void
  onCreateAccount?: () => void
}

export function ClientsView({ onAccountClick, onCreateAccount }: ClientsViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Load clients on mount
  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true)
        const data = await getClients()
        setClients(data)
        setFilteredClients(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounts')
      } finally {
        setLoading(false)
      }
    }
    void fetchClients()
  }, [])

  // Filter clients by search
  useEffect(() => {
    if (!searchQuery) {
      setFilteredClients(clients)
      return
    }
    const lower = searchQuery.toLowerCase()
    setFilteredClients(
      clients.filter((client) =>
        client.name.toLowerCase().includes(lower) ||
        client.client_id.toLowerCase().includes(lower)
      )
    )
  }, [searchQuery, clients])

  const handleCreateAccount = () => {
    if (isCreating) return
    setIsCreateModalOpen(true)
  }

  const handleConfirmCreateAccount = async (name: string) => {
    if (isCreating) return
    try {
      setIsCreating(true)
      const newClient = await createClientApi(name)
      setClients((prev) => [newClient, ...prev])
      setFilteredClients((prev) => [newClient, ...prev])
      onCreateAccount?.()
      setIsCreateModalOpen(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCloseCreateAccountModal = () => {
    if (!isCreating) {
      setIsCreateModalOpen(false)
    }
  }

  const handleAccountClick = (client: Client) => {
    onAccountClick?.(client.client_id, client.name)
  }

  const hasClients = filteredClients.length > 0

  return (
      <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
              <p className="text-sm text-gray-600">Insureds and clients — each with their own submissions</p>
            </div>
          </div>
          <button 
            onClick={handleCreateAccount}
            className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm md:w-auto"
            disabled={isCreating}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isCreating ? 'Creating...' : 'New Account'}
          </button>
        </div>

        {/* Search Bar */}
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search accounts by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading accounts...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 p-8 text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Unable to load accounts</h3>
              <p className="text-gray-600">{error}</p>
            </div>
            <button
              onClick={() => {
                setSearchQuery('')
                setError(null)
                setLoading(true)
                void getClients().then((data) => {
                  setClients(data)
                  setFilteredClients(data)
                  setLoading(false)
                }).catch((err) => {
                  setError(err instanceof Error ? err.message : 'Failed to load accounts')
                  setLoading(false)
                })
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : hasClients ? (
          <div className="grid gap-4">
            {filteredClients.map((client) => (
              <button
                key={client.client_id}
                onClick={() => handleAccountClick(client)}
                className="bg-white border border-gray-200 rounded-xl p-6 text-left hover:border-blue-300 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Client Icon */}
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                      <Building2 className="w-6 h-6 text-blue-600" />
                    </div>
                    
                    {/* Client Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors truncate">
                        {client.name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <FileStack className="w-4 h-4" />
                          <span>{client.submission_count ?? client.submissions?.length ?? 0} submissions</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>Updated {new Date(client.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Arrow Icon */}
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all flex-shrink-0 ml-4" />
                </div>
              </button>
            ))}
          </div>
        ) : (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Accounts Yet
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Add your first account to start organizing submissions. Each account holds submissions, input documents, and generated forms.
          </p>
          <button
            onClick={handleCreateAccount}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Your First Account
          </button>

          {/* Feature List */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-3xl mx-auto">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm">Account Profiles</h4>
                <p className="text-xs text-gray-600 mt-1">
                  Store insured info, policies, and notes
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm">Track Submissions</h4>
                <p className="text-xs text-gray-600 mt-1">
                  See all submissions per account
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <FileStack className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm">Quick Access</h4>
                <p className="text-xs text-gray-600 mt-1">
                  Find account info quickly
                </p>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      <CreateSubmissionModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateAccountModal}
        onConfirm={handleConfirmCreateAccount}
        isCreating={isCreating}
        existingNames={clients.map((client) => client.name)}
        title="New Account"
        confirmButtonText="Create Account"
        inputLabel="Account Name"
        icon={
          <div className="p-2 bg-blue-100 rounded-lg">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
        }
      />
</div>
  )
}
