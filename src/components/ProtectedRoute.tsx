import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * UX-only guard (docs/planning/04 §4): real authorization is enforced by
 * RLS + RPCs server-side. This just routes unauthenticated users to login
 * and profile-less users to onboarding.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600" role="status">
          Loading…
        </p>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/onboarding" replace />

  return <>{children}</>
}
