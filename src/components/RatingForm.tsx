import { useEffect, useState } from 'react'
import { Card } from './Badges'
import { getMyRatings, submitRating } from '../lib/requests'
import type { DeliveryRequest, Rating, RatingRole } from '../lib/requests'

interface RatingFormProps {
  request: DeliveryRequest
  myProfileId: string
}

const STAR_LABELS = ['Poor', 'Fair', 'Okay', 'Good', 'Excellent']

export default function RatingForm({ request, myProfileId }: RatingFormProps) {
  const isRequester = myProfileId === request.requester_id
  const isDeliverer = request.deliverer_id === myProfileId

  // Only show after delivery; only for participants.
  if (request.status !== 'delivered' || (!isRequester && !isDeliverer)) {
    return null
  }

  const role: RatingRole = isRequester ? 'as_requester' : 'as_deliverer'
  const rateeId = isRequester ? request.deliverer_id : request.requester_id
  const roleLabel = isRequester ? 'your deliverer' : 'your requester'

  const [existing, setExisting] = useState<Rating[]>([])
  const [loading, setLoading] = useState(true)
  const [score, setScore] = useState(0)
  const [hoverScore, setHoverScore] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    let mounted = true
    getMyRatings(request.id)
      .then((ratings) => {
        if (mounted) setExisting(ratings)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
  }, [request.id])

  const alreadyRated = existing.some(
    (r) => r.role === role && r.ratee_id === rateeId,
  )

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>
  }

  if (alreadyRated) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          You have already rated {roleLabel}.
        </p>
      </Card>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (score < 1) {
      setError('Please select a rating.')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await submitRating(
      request.id,
      rateeId!,
      role,
      score,
      comment.trim() || null,
    )
    if (res.ok) {
      setSubmitted(true)
    } else {
      setError(res.message ?? 'Failed to submit rating.')
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Thank you — your rating for {roleLabel} is recorded.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-900">
        Rate your {roleLabel === 'your requester' ? 'requester' : 'deliverer'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <fieldset>
          <legend className="sr-only">Rating (1-5 stars)</legend>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`star ${n}`}
                onClick={() => setScore(n)}
                onMouseEnter={() => setHoverScore(n)}
                onMouseLeave={() => setHoverScore(0)}
                className="text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {n <= (hoverScore || score)
                  ? '★'
                  : '☆'}
                <span className="sr-only">{STAR_LABELS[n - 1]}</span>
              </button>
            ))}
          </div>
        </fieldset>
                <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment (max 500 chars)…"
          maxLength={500}
          disabled={submitting}
          aria-label="Comment"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={submitting || score === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Submit rating
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700">{error}</p>
        )}
      </form>
    </Card>
  )
}