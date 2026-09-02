import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
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
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Open requests</h1>
        <Link
          to="/requests/new"
          className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900"
        >
          New request
        </Link>
      </div>

      <div className="mt-4">
        <label htmlFor="urgency-filter" className="sr-only">
          Filter by urgency
        </label>
        <select
          id="urgency-filter"
          value={urgency}
          onChange={(e) => {
            setRequests(null)
            setError(null)
            setUrgency(e.target.value as '' | Urgency)
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {URGENCY_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-3">
          <p role="alert" className="text-sm text-red-700">
            {error} <a href="mailto:support@bringit.com" className="underline hover:text-red-900 ml-1">Contact support</a>
          </p>
          <button
            onClick={() => {
              setError(null)
              setRetryCount(c => c + 1)
            }}
            className="rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {requests === null && !error && (
        <p role="status" className="mt-8 text-center text-slate-500">
          Loading requests…
        </p>
      )}

      {requests !== null && requests.length === 0 && (
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-medium text-slate-700">No open requests right now</p>
          <p className="mt-1 text-sm text-slate-500">
            Be the first to post something that needs moving across campus.
          </p>
          <Link
            to="/requests/new"
            className="mt-4 inline-block rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900"
          >
            Create a request
          </Link>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {requests?.map((r) => (
          <li key={r.id}>
            <Link to={`/requests/${r.id}`} className="block focus:outline-none">
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">{r.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {r.pickup_location} → {r.dropoff_location}
                    </p>
                    {r.reward_suggestion != null && (
                      <p className="mt-1 text-sm text-slate-500">
                        Suggested reward: ৳{r.reward_suggestion}
                      </p>
                    )}
                    {r.requester_id === profile?.id && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">Your request</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <UrgencyBadge urgency={r.urgency} />
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </main>
  )
}
