import { LogOut, Package, PlusCircle, Compass, ShieldCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Shared app shell header with brand link, quick links, and student profile pill. */
export default function AppHeader() {
  const { profile, signOut } = useAuth()
  const location = useLocation()

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Brand Logo & Campus Badge */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="group flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg p-1"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm shadow-emerald-700/20 transition-transform duration-200 group-hover:scale-105">
              <Package className="h-5 w-5" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-slate-900">
              Bring<span className="text-emerald-600">It</span>
            </span>
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            CUET Verified
          </span>
        </div>

        {/* Quick Nav & User Controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          {profile && (
            <nav aria-label="Main Navigation" className="flex items-center gap-1">
              <Link
                to="/requests"
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  location.pathname === '/requests'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Browse</span>
              </Link>
              <Link
                to="/requests/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-900 active:scale-95 transition-all"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>New</span>
              </Link>
            </nav>
          )}

          {profile && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 border border-slate-200">
                  {(profile.display_name || 'U').charAt(0).toUpperCase()}
                </div>
                {profile.display_name && (
                  <span className="text-xs font-semibold text-slate-700">
                    {profile.display_name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 active:scale-95 transition-all"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

