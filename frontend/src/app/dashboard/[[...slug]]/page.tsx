'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import { useAuth } from '@/contexts/AuthContext'

export default function DashboardRoutePage() {
  const router = useRouter()
  const { user, isLoading, isConfigured } = useAuth()

  useEffect(() => {
    if (isLoading) return
    if (!isConfigured || !user) {
      router.replace('/login')
    }
  }, [isLoading, isConfigured, user, router])

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
