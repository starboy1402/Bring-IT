import { LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function HomePage() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">BringIt</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{profile?.display_name}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-slate-600">
          Campus peer-to-peer delivery for CUET students. Request browsing arrives in the
          next milestone.
        </p>
      </main>
    </div>
  )
}
