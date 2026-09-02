import { LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Shared app shell header with brand link and sign-out. */
export default function AppHeader() {
  const { profile, signOut } = useAuth()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-xl font-bold tracking-tight text-slate-900">
          BringIt
        </Link>
        <div className="flex items-center gap-3">
          {profile && <span className="text-sm text-slate-600">{profile.display_name}</span>}
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
  )
}
