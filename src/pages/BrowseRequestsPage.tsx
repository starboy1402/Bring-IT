import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, MapPin, ArrowRight, Banknote, RefreshCw, Inbox, AlertCircle, Sparkles } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { Card, StatusBadge, UrgencyBadge } from '../components/Badges'
import { useAuth } from '../context/AuthContext'
import {
  listOpenRequests,
  type DeliveryRequest,
  type Urgency,
} from '../lib/requests'

const URGENCY_FILTERS: Array<{ value: '' | Urgency; label: string }> = [
  { value: '', label: 'All urgencies' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export default function BrowseRequestsPage() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState<DeliveryRequest[] | null>(null)
  const [urgency, setUrgency] = useState<'' | Urgency>('')
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const fetchId = useRef(0)

  useEffect(() => {
    const currentFetch = ++fetchId.current
    listOpenRequests(urgency || undefined)
      .then((rows) => {
        if (currentFetch === fetchId.current) {
          setRequests(rows)
          setHasMore(rows.length === 20)
        }
      })
      .catch((err: Error) => {
        if (currentFetch === fetchId.current) setError(err.message)
      })
  }, [urgency, retryCount])

  async function handleLoadMore() {
    if (!requests || requests.length === 0 || loadingMore) return
    setLoadingMore(true)
    setError(null)
    const currentFetch = ++fetchId.current
    const last = requests[requests.length - 1]
    try {
      const more = await listOpenRequests(urgency || undefined, {
        createdAt: last.created_at,
        id: last.id,
      })
      if (currentFetch === fetchId.current) {
        setRequests([...requests, ...more])
        setHasMore(more.length === 20)
      }
    } catch (err) {
      if (currentFetch === fetchId.current) {
        setError((err as Error).message)
      }
    } finally {
      if (currentFetch === fetchId.current) {
        setLoadingMore(false)
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header & New Request CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Open requests
              </h1>
              {requests && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  {requests.length} live
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Campus peer deliveries waiting for pickup across CUET halls and campus.
            </p>
          </div>

          <Link
            to="/requests/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-900 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>New request</span>
          </Link>
        </div>

        {/* Filter Controls */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label htmlFor="urgency-filter" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Filter:
          </label>
          <div className="relative">
            <select
              id="urgency-filter"
              value={urgency}
              onChange={(e) => {
                setRequests(null)
                setError(null)
                setUrgency(e.target.value as '' | Urgency)
              }}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer"
            >
              {URGENCY_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick filter chips for tactile mobile use */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {URGENCY_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  if (urgency !== f.value) {
                    setRequests(null)
                    setError(null)
                    setUrgency(f.value)
                  }
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  urgency === f.value
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <p role="alert" className="text-sm font-medium text-red-800">
                {error} <a href="mailto:support@bringit.com" className="underline font-semibold hover:text-red-950 ml-1">Contact support</a>
              </p>
            </div>
            <button
              onClick={() => {
                setError(null)
                setRetryCount(c => c + 1)
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-100 px-3.5 py-2 text-xs font-bold text-red-800 hover:bg-red-200 active:scale-95 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loading State */}
        {requests === null && !error && (
          <div className="mt-12 flex flex-col items-center justify-center text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
            <p role="status" className="mt-3 text-sm font-medium text-slate-500">
              Loading requests…
            </p>
          </div>
        )}

        {/* Empty State */}
        {requests !== null && requests.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-slate-300/80 bg-white p-10 sm:p-14 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Inbox className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900 sm:text-lg">No open requests right now</h2>
            <p className="mt-1 max-w-sm mx-auto text-sm text-slate-500">
              Be the first to post something that needs moving across campus.
            </p>
            <Link
              to="/requests/new"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-900 active:scale-95 transition-all"
            >
              <Sparkles className="h-4 w-4" />
              <span>Create a request</span>
            </Link>
          </div>
        )}

        {/* Delivery Cards Feed */}
        <ul className="mt-6 space-y-3.5">
          {requests?.map((r) => (
            <li key={r.id}>
              <Link to={`/requests/${r.id}`} className="block focus:outline-none group">
                <Card className="hover:border-emerald-300/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                          {r.title}
                        </h2>
                        {r.requester_id === profile?.id && (
                          <span className="rounded-full bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Your request
                          </span>
                        )}
                      </div>

                      {/* Route visualization */}
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {r.pickup_location}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                          <MapPin className="h-3 w-3 text-emerald-600" />
                          {r.dropoff_location}
                        </span>
                        <span className="hidden">
                          {r.pickup_location} → {r.dropoff_location}
                        </span>
                      </div>

                      {/* Reward suggestion */}
                      {r.reward_suggestion != null && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-semibold text-emerald-800">
                            <Banknote className="h-3 w-3" />
                            Suggested reward: ৳{r.reward_suggestion}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status & Urgency Badges */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <UrgencyBadge urgency={r.urgency} />
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>

        {/* Load More Button */}
        {hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-400 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loadingMore ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading…</span>
                </>
              ) : (
                <span>Load more</span>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

