import { Navigate, Route, Routes } from 'react-router-dom'

import { AuthPage } from '@/features/auth/AuthPage'
import { useAuth } from '@/features/auth/useAuth'
import { CalendarPage } from '@/features/calendar/CalendarPage'

const LoadingScreen = () => (
  <main className="centered-screen">
    <p>Checking session...</p>
  </main>
)

export const App = () => {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <Routes>
      <Route element={user ? <Navigate replace to="/calendar" /> : <AuthPage />} path="/auth" />
      <Route element={user ? <CalendarPage /> : <Navigate replace to="/auth" />} path="/calendar" />
      <Route element={<Navigate replace to={user ? '/calendar' : '/auth'} />} path="*" />
    </Routes>
  )
}
