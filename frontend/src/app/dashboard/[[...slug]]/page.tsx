'use client'

import MainLayout from '@/components/MainLayout'
import { useAuth } from '@/contexts/AuthContext'

export default function DashboardRoutePage() {
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-600">
        Loading workspace...
      </div>
    )
  }

  return <MainLayout />
}
