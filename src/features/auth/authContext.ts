import type { Session } from '@supabase/supabase-js'
import { createContext } from 'react'

export type AuthMode = 'supabase' | 'demo'

export interface AuthUser {
  id: string
  email: string
  mode: AuthMode
}

export interface AuthResult {
  error: string | null
  needsEmailConfirmation?: boolean
}

export interface AuthContextValue {
  user: AuthUser | null
  session: Session | null
  isLoading: boolean
  isSupabaseEnabled: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
