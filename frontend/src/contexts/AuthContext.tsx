'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  isLoading: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false)
      return
    }

    let mounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      setUser(nextSession?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase auth is not configured')
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw error
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase auth is not configured')
    }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      throw error
    }

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('An account with this email already exists')
    }

    return {
      needsEmailConfirmation: !data.session,
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) {
      throw new Error('Supabase auth is not configured')
    }

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : undefined

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (error) {
      throw error
    }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) {
      throw new Error('Supabase auth is not configured')
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw error
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      resetPassword,
      updatePassword,
      signOut,
    }),
    [user, session, isLoading, signIn, signUp, resetPassword, updatePassword, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
