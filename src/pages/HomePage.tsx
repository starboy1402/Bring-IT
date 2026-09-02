import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Compass,
  PlusCircle,
  ShieldCheck,
  Zap,
  HeartHandshake,
  Star,
  MapPin,
  Sparkles,
  Footprints,
  Activity,
  CheckCircle2,
} from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { Card, UrgencyBadge } from '../components/Badges'
import { useAuth } from '../context/AuthContext'
import { listOpenRequests, type DeliveryRequest } from '../lib/requests'

const CATEGORIES = [
  { id: 'food', label: 'Cafeteria & Snacks', icon: '🍔' },
  { id: 'pharmacy', label: 'Meds & Pharmacy', icon: '💊' },
  { id: 'print', label: 'Library & Prints', icon: '🖨️' },
  { id: 'parcel', label: 'Gate Parcels', icon: '📦' },
]

export default function HomePage() {
  const { profile } = useAuth()
  const [recentRequests, setRecentRequests] = useState<DeliveryRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    listOpenRequests(undefined, undefined, 3)
      .then((rows) => {
        if (active) {
          setRecentRequests(rows)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const hallClean = profile?.hall && !profile.hall.includes('@') ? profile.hall : null
  const deptClean = profile?.department && !profile.department.includes('@') ? profile.department : null

  return (
    <div className="min-h-screen bg-slate-50/50">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* Main Feed Column (8 cols on lg) */}
          <div className="space-y-6 lg:col-span-8">
            {/* Student Welcome Banner */}
            <section
              aria-labelledby="welcome-heading"
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 sm:p-8 text-white shadow-xl"
            >
              <div className="relative z-10 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-sm border border-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" aria-hidden="true" />
                    CUET Campus Network
                  </span>
                  {hallClean && (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
                      Hall {hallClean}
                    </span>
                  )}
                  {deptClean && (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
                      Dept of {deptClean}
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

            {/* Quick Category Bar */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat.id}
                  to="/requests"
                  className="pressable flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-900 transition-all shrink-0 active:scale-95"
                >
                  <span className="text-base">{cat.icon}</span>
                  <span className="tracking-caption">{cat.label}</span>
                </Link>
              ))}
            </div>

            {/* Primary Action Cards */}
            <section aria-label="Quick Actions" className="grid gap-4 sm:grid-cols-2">
              {/* Action 1: Browse Feed */}
              <Link
                to="/requests"
                aria-label="Browse open requests"
                className="pressable group relative flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md active:scale-[0.99]"
              >
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 transition-colors group-hover:bg-emerald-800 group-hover:text-white shadow-2xs">
                    <Compass className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-slate-900 tracking-title">
                    Browse open requests
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed tracking-body">
                    See what students need delivered across dorms, cafeteria, and library. Pick up a request on your way.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-sm font-bold text-emerald-800 group-hover:text-emerald-900">
                  <span>View campus requests</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>

              {/* Action 2: Post Request */}
              <Link
                to="/requests/new"
                aria-label="Post a delivery request"
                className="pressable group relative flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-md active:scale-[0.99]"
              >
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-800 group-hover:text-white shadow-2xs">
                    <PlusCircle className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-slate-900 tracking-title">
                    Post a delivery request
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed tracking-body">
                    Need food, medicine, prints, or parcels brought to your hall? Create a request with a suggested peer reward.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-sm font-bold text-teal-800 group-hover:text-teal-900">
                  <span>Create request</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            </section>

            {/* Live Campus Errands Waiting for Pickup */}
            <section aria-label="Recent Requests" className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="text-base font-bold text-slate-900">Live Campus Delivery Radar</h2>
                </div>
                <Link to="/requests" className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1">
                  <span>See all open</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="py-8 text-center text-xs text-slate-500">Scanning campus deliveries…</div>
                ) : recentRequests.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm font-semibold text-slate-700">No open errands on radar right now</p>
                    <p className="text-xs text-slate-500 mt-1">Be the first to post what you need delivered.</p>
                    <Link
                      to="/requests/new"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-900 transition-all"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Post an errand</span>
                    </Link>
                  </div>
                ) : (
                  recentRequests.map((req) => (
                    <Link
                      key={req.id}
                      to={`/requests/${req.id}`}
                      className="pressable block rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition-all hover:border-emerald-300 hover:bg-emerald-50/30 active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <h3 className="font-bold text-sm text-slate-900 hover:text-emerald-800 tracking-title">
                            {req.title}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {req.pickup_location}
                            </span>
                            <span>→</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                              {req.dropoff_location}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {req.reward_suggestion != null && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-900 tabular-nums">
                              ৳{req.reward_suggestion}
                            </span>
                          )}
                          <UrgencyBadge urgency={req.urgency} />
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>

            {/* Value Props / Student Guarantee */}
            <section aria-label="Campus Features" className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                How BringIt Works for CUET Students
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Verified Campus Peers</h3>
                    <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                      Exclusive to CUET student emails with private student IDs.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Zap className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Fast Hall-to-Hall</h3>
                    <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                      Direct coordination via realtime chat between requester and deliverer.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <HeartHandshake className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Bilateral Trust</h3>
                    <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                      Reciprocal 5-star ratings build genuine campus reputation.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Desktop Right Sidebar (4 cols on lg) */}
          <div className="space-y-6 lg:col-span-4">
            {/* Student Reputation Hub Card */}
            <Card className="border-slate-200/90 shadow-xs">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-lg font-extrabold text-white shadow-sm shadow-emerald-900/20">
                  {(profile?.display_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">{profile?.display_name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Verified Student
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <div className="flex items-center justify-center gap-1 text-sm font-extrabold text-slate-900">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                    <span className="tabular-nums">5.0</span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500">Peer Rating</span>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <span className="font-extrabold text-sm text-slate-900 tabular-nums">0</span>
                  <p className="text-[10px] font-semibold text-slate-500">Deliveries</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                  <span className="font-extrabold text-sm text-emerald-800 tabular-nums">৳0</span>
                  <p className="text-[10px] font-semibold text-slate-500">Earned</p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500 text-center tracking-body">
                  Deliver for fellow students to build campus rating and earn pocket cash.
                </p>
              </div>
            </Card>

            {/* Campus Walking Times Cheatsheet */}
            <Card className="border-slate-200/90 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Footprints className="h-4 w-4 text-emerald-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  CUET Walking Guide
                </h3>
              </div>
              <ul className="mt-3 space-y-2.5 text-xs text-slate-600">
                <li className="flex items-center justify-between">
                  <span>Cafeteria ↔ Shahid Hall</span>
                  <span className="font-bold text-slate-900 tabular-nums">~4 min walk</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Library ↔ Dr. Q.K. Hall</span>
                  <span className="font-bold text-slate-900 tabular-nums">~6 min walk</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Campus Gate ↔ Hall Block</span>
                  <span className="font-bold text-slate-900 tabular-nums">~10 min walk</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Medical Center ↔ Cafeteria</span>
                  <span className="font-bold text-slate-900 tabular-nums">~3 min walk</span>
                </li>
              </ul>
            </Card>

            {/* Campus Live Activity Pulse */}
            <Card className="border-slate-200/90 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Activity className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Campus Pulse
                </h3>
              </div>
              <ul className="mt-3 space-y-3 text-xs text-slate-600">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <span className="font-semibold text-slate-800">Lunch deliveries active</span>
                    <p className="text-[11px] text-slate-500">Cafeteria orders trending across halls</p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <span className="font-semibold text-slate-800">Direct Hall Delivery</span>
                    <p className="text-[11px] text-slate-500">Dorm-to-dorm errand runners online</p>
                  </div>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
