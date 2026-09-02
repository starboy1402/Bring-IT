import { Link } from 'react-router-dom'
import { ArrowRight, Compass, PlusCircle, ShieldCheck, Zap, HeartHandshake } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'

export default function HomePage() {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50/50">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 pb-24">
        {/* Student Welcome & Campus Status Banner */}
        <section aria-labelledby="welcome-heading" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
          <div className="relative z-10 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-sm border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" aria-hidden="true" />
                CUET Campus Network
              </span>
              {profile?.hall && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
                  Hall {profile.hall}
                </span>
              )}
              {profile?.department && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
                  Dept of {profile.department}
                </span>
              )}
            </div>

            <h1 id="welcome-heading" className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl text-white">
              Welcome, {profile?.display_name}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
              Campus peer-to-peer errand & delivery network. Ask peers walking your way or earn rewards by bringing items to fellow students.
            </p>
          </div>

          {/* Decorative background glow */}
          <div
            className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none"
            aria-hidden="true"
          />
        </section>

        {/* Primary Action Cards */}
        <section aria-label="Quick Actions" className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Action 1: Browse Feed */}
          <Link
            to="/requests"
            aria-label="Browse open requests"
            className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-md active:translate-y-0"
          >
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                <Compass className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900">
                Browse open requests
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                See what students need delivered across dorms, cafeteria, and library. Pick up a request on your way.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">
              <span>View campus requests</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Action 2: Post Request */}
          <Link
            to="/requests/new"
            aria-label="Post a delivery request"
            className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-teal-300 hover:shadow-md active:translate-y-0"
          >
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                <PlusCircle className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900">
                Post a delivery request
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Need food, medicine, prints, or parcels brought to your hall? Create a request with a suggested peer reward.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-teal-700 group-hover:text-teal-800">
              <span>Create request</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </section>

        {/* Value Props / Student Guarantee */}
        <section aria-label="Campus Features" className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            How BringIt Works for CUET Students
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Verified Campus Peers</h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Exclusive to CUET student emails with private student IDs.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Fast Hall-to-Hall</h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Direct coordination via realtime chat between requester and deliverer.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <HeartHandshake className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Bilateral Trust</h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Reciprocal 5-star ratings build genuine campus reputation.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
