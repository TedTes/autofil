'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, LockKeyhole, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const router = useRouter()
  const { user, isLoading, isConfigured, signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard')
    }
  }, [isLoading, user, router])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    try {
      setSubmitting(true)
      setError(null)
      setMessage(null)
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match')
        }

        const result = await signUp(email.trim(), password)
        if (result.needsEmailConfirmation) {
          setMessage('Account created. Check your email to confirm your account, then sign in.')
          setPassword('')
          setConfirmPassword('')
          setMode('login')
          return
        }
      } else {
        await signIn(email.trim(), password)
      }
      router.replace('/dashboard')
    } catch (err) {
      const rawMessage =
        err instanceof Error
          ? err.message
          : mode === 'signup'
            ? 'Unable to create account'
            : 'Unable to sign in'

      const normalizedMessage =
        mode === 'signup' &&
        (rawMessage.toLowerCase().includes('already registered') ||
          rawMessage.toLowerCase().includes('already been registered') ||
          rawMessage.toLowerCase().includes('user already registered'))
          ? 'An account with this email already exists. Sign in instead or reset your password.'
          : rawMessage

      setError(normalizedMessage)
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
            {mode === 'signup' ? 'Create account' : 'Sign in'}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {mode === 'signup' ? 'Create your AutoFil account.' : 'Access your AutoFil workspace.'}
          </p>
        </div>

        {!isConfigured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Supabase auth is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable login.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
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

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Password</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Enter your password"
                />
              </div>
            </label>

            {mode === 'signup' && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Confirm password
                </span>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Re-enter your password"
                  />
                </div>
              </label>
            )}

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
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>

            {mode === 'login' && (
              <Link
                href="/reset-password"
                className="block w-full text-center text-sm font-medium text-gray-600 transition hover:text-blue-600"
              >
                Forgot your password?
              </Link>
            )}

            <button
              type="button"
              onClick={() => {
                setMode((prev) => (prev === 'login' ? 'signup' : 'login'))
                setError(null)
                setMessage(null)
                setPassword('')
                setConfirmPassword('')
              }}
              className="w-full text-sm font-medium text-blue-600 transition hover:text-blue-700"
            >
              {mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'Need an account? Create one'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
