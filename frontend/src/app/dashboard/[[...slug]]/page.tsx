'use client'

import { useEffect } from 'react'
import MainLayout from '@/components/MainLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function DashboardRoutePage() {
  const router = useRouter()
  const { user, isLoading, isConfigured } = useAuth()

  useEffect(() => {
    if (!isLoading && (!user || !isConfigured)) {
      router.replace('/login')
    }
  }, [isConfigured, isLoading, router, user])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-600">
        Loading workspace...
      </div>
    )
  }

  if (!isConfigured || !user) {
    return null
  }

  return <MainLayout />
}
