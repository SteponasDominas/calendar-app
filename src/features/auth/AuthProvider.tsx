import type { Session } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { appEnv } from '@/config/env'
import { supabase } from '@/lib/supabase/client'
import {
  AuthContext,
  type AuthContextValue,
  type AuthResult,
  type AuthUser,
} from '@/features/auth/authContext'

const DEMO_USER_STORAGE_KEY = 'calendar-app-demo-user'

const isDemoUser = (value: unknown): value is AuthUser => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<AuthUser>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    candidate.mode === 'demo'
  )
}

const mapSessionToUser = (session: Session | null): AuthUser | null => {
  if (!session?.user) {
    return null
  }

  return {
    id: session.user.id,
    email: session.user.email ?? 'unknown@example.com',
    mode: 'supabase',
  }
}

const createDemoUser = (email: string): AuthUser => ({
  id: `demo-${crypto.randomUUID()}`,
  email,
  mode: 'demo',
})

const readDemoUser = (): AuthUser | null => {
  const raw = window.localStorage.getItem(DEMO_USER_STORAGE_KEY)

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    return isDemoUser(parsed) ? parsed : null
  } catch {
    return null
  }
}

const persistDemoUser = (user: AuthUser): void => {
  window.localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(user))
}

const clearDemoUser = (): void => {
  window.localStorage.removeItem(DEMO_USER_STORAGE_KEY)
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(() => (supabase ? null : readDemoUser()))
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase))

  useEffect(() => {
    if (!supabase) {
      return undefined
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to fetch Supabase session.', error)
        }

        setSession(data.session)
        setUser(mapSessionToUser(data.session))
        setIsLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(mapSessionToUser(nextSession))
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      return {
        error: error?.message ?? null,
      }
    }

    const demoUser = createDemoUser(email)
    persistDemoUser(demoUser)
    setUser(demoUser)

    return {
      error: null,
    }
  }

  const signUp = async (email: string, password: string): Promise<AuthResult> => {
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({ email, password })

      return {
        error: error?.message ?? null,
        needsEmailConfirmation: Boolean(data.user && !data.session),
      }
    }

    const demoUser = createDemoUser(email)
    persistDemoUser(demoUser)
    setUser(demoUser)

    return {
      error: null,
    }
  }

  const signOut = async (): Promise<void> => {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Failed to sign out from Supabase.', error)
      }
    }

    clearDemoUser()
    setSession(null)
    setUser(null)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isSupabaseEnabled: appEnv.isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
    }),
    [isLoading, session, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
