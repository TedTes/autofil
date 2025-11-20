/**
 * ClientsView Component
 */

'use client'

import React, { useState } from 'react'
import { Users, Plus, Search, Building2, Phone, Mail, Calendar } from 'lucide-react'

interface ClientsViewProps {
  onClientClick?: (clientId: string) => void
  onCreateClient?: () => void
}

export function ClientsView({ onClientClick, onCreateClient }: ClientsViewProps) {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
              <p className="text-sm text-gray-600">Manage your clients and their submissions</p>
            </div>
          </div>
          <button 
            onClick={onCreateClient}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Client
          </button>
        </div>

        {/* Search Bar */}
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Placeholder Empty State */}
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Clients Yet
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Get started by adding your first client. You&apos;ll be able to manage their submissions, 
            track documents, and generate reports all in one place.
          </p>
          <button 
            onClick={onCreateClient}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Your First Client
          </button>

          {/* Feature List */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-3xl mx-auto">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm">Client Profiles</h4>
                <p className="text-xs text-gray-600 mt-1">
                  Store contact info, policies, and notes
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm">Track Submissions</h4>
                <p className="text-xs text-gray-600 mt-1">
                  See all documents per client
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm">Quick Access</h4>
                <p className="text-xs text-gray-600 mt-1">
                  Find client info instantly
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}