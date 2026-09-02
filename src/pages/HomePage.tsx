import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'

export default function HomePage() {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Welcome, {profile?.display_name}
        </h1>
        <p className="mt-2 text-slate-600">
          Campus peer-to-peer delivery for CUET students.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/requests"
            className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900"
          >
            Browse open requests
          </Link>
          <Link
            to="/requests/new"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Post a delivery request
          </Link>
        </div>
      </main>
    </div>
  )
}
