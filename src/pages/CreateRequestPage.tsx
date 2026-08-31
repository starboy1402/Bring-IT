import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { createRequest, type Urgency } from '../lib/requests'

const formSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().trim().max(1000, 'Description must be at most 1000 characters'),
  pickup_location: z
    .string()
    .trim()
    .min(3, 'Pickup location must be at least 3 characters')
    .max(200),
  dropoff_location: z
    .string()
    .trim()
    .min(3, 'Dropoff location must be at least 3 characters')
    .max(200),
  urgency: z.enum(['low', 'medium', 'high']),
  reward: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Reward must be a non-negative amount (e.g. 50 or 49.99)'),
})

const inputClasses =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none'
const labelClasses = 'block text-sm font-medium text-slate-700'

export default function CreateRequestPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '',
    description: '',
    pickup_location: '',
    dropoff_location: '',
    urgency: 'medium' as Urgency,
    reward: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verified = profile?.is_verified ?? false

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const parsed = formSchema.safeParse(form)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        if (!errors[key]) errors[key] = issue.message
      }
      setFieldErrors(errors)
      return
    }

    setSubmitting(true)
    const res = await createRequest({
      title: parsed.data.title,
      description: parsed.data.description || null,
      pickup_location: parsed.data.pickup_location,
      dropoff_location: parsed.data.dropoff_location,
      urgency: parsed.data.urgency,
      reward_suggestion: parsed.data.reward === '' ? null : Number(parsed.data.reward),
    })
    setSubmitting(false)

    if (res.ok) {
      void navigate(`/requests/${res.request_id}`)
    } else {
      setError(res.message)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New delivery request</h1>

        {!verified && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your account is not verified yet — you can fill the form, but posting requires a
            verified CUET email.
          </p>
        )}

        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="title" className={labelClasses}>
              Title
            </label>
            <input
              id="title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputClasses}
              aria-invalid={fieldErrors.title ? true : undefined}
              aria-describedby={fieldErrors.title ? 'title-error' : undefined}
            />
            {fieldErrors.title && (
              <p id="title-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="description" className={labelClasses}>
              Description (optional)
            </label>
            <textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pickup" className={labelClasses}>
                Pickup location
              </label>
              <input
                id="pickup"
                value={form.pickup_location}
                onChange={(e) => set('pickup_location', e.target.value)}
                className={inputClasses}
                aria-invalid={fieldErrors.pickup_location ? true : undefined}
                aria-describedby={fieldErrors.pickup_location ? 'pickup-error' : undefined}
              />
              {fieldErrors.pickup_location && (
                <p id="pickup-error" className="mt-1 text-sm text-red-600">
                  {fieldErrors.pickup_location}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="dropoff" className={labelClasses}>
                Dropoff location
              </label>
              <input
                id="dropoff"
                value={form.dropoff_location}
                onChange={(e) => set('dropoff_location', e.target.value)}
                className={inputClasses}
                aria-invalid={fieldErrors.dropoff_location ? true : undefined}
                aria-describedby={fieldErrors.dropoff_location ? 'dropoff-error' : undefined}
              />
              {fieldErrors.dropoff_location && (
                <p id="dropoff-error" className="mt-1 text-sm text-red-600">
                  {fieldErrors.dropoff_location}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="urgency" className={labelClasses}>
                Urgency
              </label>
              <select
                id="urgency"
                value={form.urgency}
                onChange={(e) => set('urgency', e.target.value as Urgency)}
                className={inputClasses}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label htmlFor="reward" className={labelClasses}>
                Suggested reward (৳, optional)
              </label>
              <input
                id="reward"
                inputMode="decimal"
                value={form.reward}
                onChange={(e) => set('reward', e.target.value)}
                className={inputClasses}
                aria-invalid={fieldErrors.reward ? true : undefined}
                aria-describedby={fieldErrors.reward ? 'reward-error' : undefined}
              />
              {fieldErrors.reward && (
                <p id="reward-error" className="mt-1 text-sm text-red-600">
                  {fieldErrors.reward}
                </p>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Post request'}
          </button>
        </form>
      </main>
    </div>
  )
}