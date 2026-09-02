import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, StatusBadge, UrgencyBadge } from '../components/Badges'
import AppHeader from '../components/AppHeader'
import ChatBox from '../components/ChatBox'
import RatingForm from '../components/RatingForm'
import ReportButton from '../components/ReportButton'
import { useAuth } from '../context/AuthContext'
import {
  acceptRequest,
  advanceRequest,
  cancelRequest,
  getRequest,
  getProfileNames,
  getStatusHistory,
  type DeliveryRequest,
  type StatusEvent,
} from '../lib/requests'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const EVENT_LABELS: Record<string, string> = {
  open: 'Request posted',
  accepted: 'Accepted by deliverer',
  in_progress: 'Picked up — in transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export default function RequestDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()

  const [prevId, setPrevId] = useState(id)
  const [request, setRequest] = useState<DeliveryRequest | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<StatusEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (id !== prevId) {
    setPrevId(id)
    setLoading(true)
    setNotFound(false)
    setError(null)
    setRequest(null)
    setEvents([])
  }

  const fetchRequestData = useCallback(async () => {
    const [req, evts] = await Promise.all([getRequest(id), getStatusHistory(id)])
    if (!req) return { req: null, evts: [], fetchedNames: {} }
    const ids = [req.requester_id, req.deliverer_id].filter(
      (v): v is string => v !== null,
    )
    const fetchedNames = await getProfileNames(ids)
    return { req, evts, fetchedNames }
  }, [id])

  const reload = useCallback(async () => {
    try {
      const data = await fetchRequestData()
      if (!data.req) {
        setNotFound(true)
        return
      }
      setRequest(data.req)
      setEvents(data.evts)
      setNames(data.fetchedNames)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [fetchRequestData])

  useEffect(() => {
    let cancelled = false
    fetchRequestData()
      .then((data) => {
        if (cancelled) return
        if (!data.req) {
          setNotFound(true)
          return
        }
        setRequest(data.req)
        setEvents(data.evts)
        setNames(data.fetchedNames)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchRequestData])

  async function runAction(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true)
    setError(null)
    const res = await action()
    setBusy(false)
    if (res.ok) {
      await reload()
    } else {
      setError(res.message ?? 'Something went wrong.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-6">
          <p role="status" className="text-center text-slate-500">Loading request…</p>
        </main>
      </div>
    )
  }

  if (notFound || !request) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-6">
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Request not found or not visible to you.
          </p>
          <Link to="/requests" className="mt-4 inline-block text-sm font-medium text-emerald-700 underline">
            Back to open requests
          </Link>
        </main>
      </div>
    )
  }

  const isRequester = profile?.id === request.requester_id
  const isDeliverer = request.deliverer_id !== null && profile?.id === request.deliverer_id
  const canAccept = request.status === 'open' && !isRequester && profile?.is_verified
  const canCancel =
    (isRequester && (request.status === 'open' || request.status === 'accepted')) ||
    (isDeliverer && request.status === 'accepted')
  const canAdvance =
    isDeliverer && (request.status === 'accepted' || request.status === 'in_progress')

  // Who can this user report? (submit_report RPC re-validates server-side.)
  // - Participants report the other participant.
  // - Any verified non-suspended viewer may report the requester of an open request.
  let reportTarget: { id: string; name: string } | null = null
  if (profile) {
    if (profile.id === request.requester_id && request.deliverer_id) {
      reportTarget = {
        id: request.deliverer_id,
        name: names[request.deliverer_id] ?? 'the deliverer',
      }
    } else if (profile.id === request.deliverer_id) {
      reportTarget = {
        id: request.requester_id,
        name: names[request.requester_id] ?? 'the requester',
      }
    } else if (request.status === 'open' && profile.is_verified && !profile.is_suspended) {
      reportTarget = {
        id: request.requester_id,
        name: names[request.requester_id] ?? 'the requester',
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Link to="/requests" className="inline-block text-sm text-slate-500 underline">
          ← Open requests
        </Link>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{request.title}</h1>
              <p className="mt-1 text-sm text-slate-500">
                Posted by {names[request.requester_id] ?? 'Unknown'} ·{' '}
                {formatDateTime(request.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <StatusBadge status={request.status} />
              <UrgencyBadge urgency={request.urgency} />
            </div>
          </div>

          {request.description && (
            <p className="mt-3 text-sm text-slate-700">{request.description}</p>
          )}

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500">Pickup</dt>
              <dd className="text-slate-900">{request.pickup_location}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Dropoff</dt>
              <dd className="text-slate-900">{request.dropoff_location}</dd>
            </div>
            {request.reward_suggestion != null && (
              <div>
                <dt className="font-medium text-slate-500">Suggested reward</dt>
                <dd className="text-slate-900">৳{request.reward_suggestion}</dd>
              </div>
            )}
            {request.deliverer_id && (
              <div>
                <dt className="font-medium text-slate-500">Deliverer</dt>
                <dd className="text-slate-900">{names[request.deliverer_id] ?? 'Unknown'}</dd>
              </div>
            )}
          </dl>
        </Card>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

                {(canAccept || canCancel || canAdvance) && (
          <Card>
            <div className="flex flex-wrap gap-3">
              {canAccept && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(() => acceptRequest(id))}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  Accept delivery
                </button>
              )}
              {canAdvance && request.status === 'accepted' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(() => advanceRequest(id, 'in_progress'))}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Mark picked up
                </button>
              )}
              {canAdvance && request.status === 'in_progress' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(() => advanceRequest(id, 'delivered'))}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  Mark delivered
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(() => cancelRequest(id))}
                  className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel request
                </button>
              )}
            </div>
          </Card>
        )}

        {profile?.id && (
          <ChatBox
            request={request}
            names={names}
            myProfileId={profile.id}
          />
        )}

        {profile?.id && (
          <RatingForm
            request={request}
            myProfileId={profile.id}
          />
        )}

        {reportTarget && profile?.id && (
          <ReportButton
            requestId={request.id}
            targetId={reportTarget.id}
            targetName={reportTarget.name}
          />
        )}

        <Card>
          <h2 className="font-semibold text-slate-900">Status history</h2>
          <ol className="mt-3 space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <div>
                  <p className="font-medium text-slate-800">
                    {EVENT_LABELS[ev.to_status] ?? ev.to_status}
                  </p>
                  <p className="text-slate-500">{formatDateTime(ev.created_at)}</p>
                </div>
              </li>
            ))}
            {events.length === 0 && (
              <li className="text-sm text-slate-500">No events recorded yet.</li>
            )}
          </ol>
        </Card>
      </main>
    </div>
  )
}
