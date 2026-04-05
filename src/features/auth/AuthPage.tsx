import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/features/auth/useAuth'

type AuthScreenMode = 'sign-in' | 'sign-up'

export const AuthPage = () => {
  const { isSupabaseEnabled, signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<AuthScreenMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submitLabel = mode === 'sign-in' ? 'Sign In' : 'Create Account'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setIsSubmitting(true)

    const result =
      mode === 'sign-in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password)

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (mode === 'sign-up' && result.needsEmailConfirmation) {
      setNotice('Check your inbox to confirm your email before signing in.')
      return
    }

    setNotice(mode === 'sign-in' ? 'Signed in.' : 'Account created.')
    navigate('/calendar', { replace: true })
  }

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-live="polite">
        <p className="eyebrow">Calendar Foundation</p>
        <h1>Ship the core before the extras</h1>
        <p className="auth-subtitle">
          This baseline already supports authentication, PWA installability, and Supabase data wiring.
        </p>

        <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
          <button
            className={mode === 'sign-in' ? 'btn tab active' : 'btn tab'}
            onClick={() => setMode('sign-in')}
            type="button"
          >
            Sign In
          </button>
          <button
            className={mode === 'sign-up' ? 'btn tab active' : 'btn tab'}
            onClick={() => setMode('sign-up')}
            type="button"
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
              type="password"
              value={password}
            />
          </label>

          <button className="btn primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Working...' : submitLabel}
          </button>
        </form>

        {!isSupabaseEnabled ? (
          <p className="status-note">
            Supabase keys are not configured, so auth runs in demo mode using local session storage.
          </p>
        ) : null}

        {error ? <p className="status-note error">{error}</p> : null}
        {notice ? <p className="status-note success">{notice}</p> : null}
      </section>
    </main>
  )
}
