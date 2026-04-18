'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Loader2, LockKeyhole, Mail, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

type AuthPromptModalProps = {
  isOpen: boolean
  actionLabel?: string | null
  onClose: () => void
  onAuthenticated?: () => void | Promise<void>
}

export default function AuthPromptModal({
  isOpen,
  actionLabel,
  onClose,
  onAuthenticated,
}: AuthPromptModalProps) {
  const { user, isLoading, isConfigured, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isCompletingAuth, setIsCompletingAuth] = useState(false)
  const isCompletingAuthRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (!user || isCompletingAuthRef.current) return

    let isCancelled = false
    isCompletingAuthRef.current = true
    setIsCompletingAuth(true)

    void Promise.resolve(onAuthenticated?.())
      .then(() => {
        if (isCancelled) return
        onClose()
      })
      .catch((err) => {
        if (isCancelled) return
        setError(err instanceof Error ? err.message : 'Unable to open your workspace')
      })
      .finally(() => {
        if (isCancelled) return
        isCompletingAuthRef.current = false
        setIsCompletingAuth(false)
      })

    return () => {
      isCancelled = true
    }
  }, [isOpen, onAuthenticated, onClose, user])

  useEffect(() => {
    if (!isOpen) {
      setMode('login')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setSubmitting(false)
      setIsCompletingAuth(false)
      isCompletingAuthRef.current = false
      setError(null)
      setMessage(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    let keepSubmittingUntilAuthSettles = false

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
        keepSubmittingUntilAuthSettles = true
      } else {
        await signIn(email.trim(), password)
        keepSubmittingUntilAuthSettles = true
        return
      }
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
      if (!keepSubmittingUntilAuthSettles) {
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close sign-in prompt"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-8">
          <div className="mb-6">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {actionLabel
                ? `Sign in to ${actionLabel.toLowerCase()}.`
                : 'Sign in to continue using AutoFil.'}
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
                    onChange={(event) => setEmail(event.target.value)}
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
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder={mode === 'signup' ? 'Create a password' : 'Enter your password'}
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
                      onChange={(event) => setConfirmPassword(event.target.value)}
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
                disabled={submitting || isLoading || isCompletingAuth}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {(submitting || isLoading || isCompletingAuth) && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCompletingAuth
                  ? 'Opening workspace...'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Sign in'}
              </button>

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
    </div>
  )
}
