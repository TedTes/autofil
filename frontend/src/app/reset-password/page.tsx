'use client'

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, LockKeyhole, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isConfigured, isLoading, session, resetPassword, updatePassword } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isInitializingRecovery, setIsInitializingRecovery] = useState(true)

  const isRecoveryMode = useMemo(() => {
    const type = searchParams.get('type')
    return type === 'recovery' || Boolean(session)
  }, [searchParams, session])

  useEffect(() => {
    let active = true

    const initializeRecoverySession = async () => {
      if (!isConfigured || !supabase) {
        if (active) setIsInitializingRecovery(false)
        return
      }

      try {
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
        const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const hashType = hashParams.get('type')
        const code = searchParams.get('code')

        if (hashType === 'recovery' && accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionError) throw sessionError
          window.history.replaceState({}, document.title, '/reset-password?type=recovery')
        } else if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
          window.history.replaceState({}, document.title, '/reset-password?type=recovery')
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to validate password reset link')
        }
      } finally {
        if (active) setIsInitializingRecovery(false)
      }
    }

    void initializeRecoverySession()

    return () => {
      active = false
    }
  }, [isConfigured, searchParams])

  useEffect(() => {
    if (isRecoveryMode && session && !isLoading) {
      setMessage('Set a new password for your account.')
    }
  }, [isRecoveryMode, session, isLoading])

  const handleResetEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    try {
      setSubmitting(true)
      setError(null)
      setMessage(null)
      await resetPassword(email.trim())
      setMessage('Password reset email sent. Check your inbox for the reset link.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send password reset email')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    try {
      setSubmitting(true)
      setError(null)
      setMessage(null)

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match')
      }

      await updatePassword(password)
      setMessage('Password updated. Redirecting to sign in...')
      setTimeout(() => {
        router.replace('/login')
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm p-8">
        <div className="mb-8">
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isRecoveryMode ? 'Set new password' : 'Reset password'}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {isRecoveryMode
              ? 'Choose a new password for your AutoFil account.'
              : 'Enter your email and we’ll send you a password reset link.'}
          </p>
        </div>

        {!isConfigured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Supabase auth is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable password reset.
          </div>
        ) : isRecoveryMode ? (
          <form className="space-y-4" onSubmit={handlePasswordUpdate}>
            {isInitializingRecovery ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Validating reset link...
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">New password</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isInitializingRecovery}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Enter a new password"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Confirm new password
              </span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isInitializingRecovery}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Re-enter your new password"
                />
              </div>
            </label>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || isLoading || isInitializingRecovery}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {(submitting || isLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleResetEmail}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="you@company.com"
                />
              </div>
            </label>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {(submitting || isLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
              Send reset link
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm font-medium text-blue-600 transition hover:text-blue-700">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordFallback() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm p-8">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading reset flow...</p>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
