import { useEffect, useState } from 'react'
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

  useEffect(() => {
    let cancelled = false
    listOpenRequests(urgency || undefined)
      .then((rows) => {
        if (!cancelled) setRequests(rows)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [urgency])

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Open requests</h1>
        <Link
          to="/requests/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
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
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
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
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
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
    </main>
  )
}
