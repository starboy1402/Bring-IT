import { Compass, Home, Plus, LogOut } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function BottomNav() {
  const { profile, signOut } = useAuth()
  const location = useLocation()

  if (!profile) return null

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-6 py-2 backdrop-blur-md shadow-lg md:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-between">
        {/* Home */}
        <Link
          to="/"
          aria-label="Home dashboard"
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold transition-colors ${
            location.pathname === '/' ? 'text-emerald-800' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Home className="h-5 w-5" />
          <span>Home</span>
        </Link>

        {/* Feed / Explore */}
        <Link
          to="/requests"
          aria-label="Browse campus requests"
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold transition-colors ${
            location.pathname === '/requests' ? 'text-emerald-800' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Compass className="h-5 w-5" />
          <span>Feed</span>
        </Link>

        {/* Center Post Button - Foodpanda/DoorDash floating action style */}
        <Link
          to="/requests/new"
          aria-label="Post new delivery request"
          className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-800 text-white shadow-md shadow-emerald-950/30 active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6" />
        </Link>

        {/* My Profile Indicator */}
        <div className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-slate-600">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 border border-slate-200">
            {(profile.display_name || 'U').charAt(0).toUpperCase()}
          </div>
          <span className="truncate max-w-[50px]">{profile.hall ? `Hall ${profile.hall}` : 'CUET'}</span>
        </div>

        {/* Sign Out */}
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out of account"
          className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-slate-600 hover:text-rose-700 active:scale-95 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span>Exit</span>
        </button>
      </div>
    </nav>
  )
}
