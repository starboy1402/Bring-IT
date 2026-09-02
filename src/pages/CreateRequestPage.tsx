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
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all'
const labelClasses = 'block text-xs font-bold uppercase tracking-wider text-slate-600'

const CAMPUS_PRESETS = [
  'Central Cafeteria',
  'Central Library',
  'Campus Gate',
  'Shahid Hall',
  'Dr. Q.K. Hall',
  'Bangabandhu Hall',
  'CSE Building',
]

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
    <div className="min-h-screen bg-slate-50/50">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            New delivery request
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Post an errand or item delivery for fellow CUET students across halls.
          </p>
        </div>

        {!verified && (
          <p role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm font-medium text-amber-900 shadow-2xs">
            Your account is not verified yet — you can fill the form, but posting requires a
            verified CUET email.
          </p>
        )}

        <form onSubmit={(e) => void onSubmit(e)} className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-xs space-y-5" noValidate>
          {/* Foodpanda/DoorDash 1-Tap Category Presets */}
          <div>
            <span className={labelClasses}>Quick Presets</span>
            <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: 'Cafeteria Snack', icon: '🍔', pickup: 'Central Cafeteria', title: 'Food from Cafeteria', tip: '40' },
                { label: 'Campus Meds', icon: '💊', pickup: 'Gate Pharmacy', title: 'Medicine from Gate', tip: '50' },
                { label: 'Library Notes', icon: '🖨️', pickup: 'Central Library', title: 'Printout from Library', tip: '30' },
                { label: 'Gate Parcel', icon: '📦', pickup: 'Campus Gate', title: 'Parcel from Gate', tip: '60' },
              ].map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => {
                    set('title', cat.title)
                    set('pickup_location', cat.pickup)
                    set('reward', cat.tip)
                  }}
                  className="pressable flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 p-3 text-center transition-all hover:border-emerald-400 hover:bg-emerald-50/50 active:scale-95 cursor-pointer group shadow-2xs"
                >
                  <span className="text-2xl transition-transform group-hover:scale-110">{cat.icon}</span>
                  <span className="mt-1 text-xs font-bold text-slate-800 tracking-caption">{cat.label}</span>
                  <span className="text-[10px] font-semibold text-emerald-800 tabular-nums">~৳{cat.tip}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="title" className={labelClasses}>
              Request Title
            </label>
            <input
              id="title"
              placeholder="e.g. Lunch from cafeteria, Notes from library"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputClasses}
              aria-invalid={fieldErrors.title ? true : undefined}
              aria-describedby={fieldErrors.title ? 'title-error' : undefined}
            />
            {fieldErrors.title && (
              <p id="title-error" className="mt-1.5 text-xs font-semibold text-red-600">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="description" className={labelClasses}>
              Details & Notes (optional)
            </label>
            <textarea
              id="description"
              rows={3}
              placeholder="e.g. Please pick up parcel #42 from the gate before 5 PM"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={inputClasses}
            />
          </div>

          {/* Quick campus shortcuts */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <span className="text-xs font-bold text-slate-600">Campus Quick-Fill Suggestions:</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CAMPUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    if (!form.pickup_location) set('pickup_location', preset)
                    else if (!form.dropoff_location) set('dropoff_location', preset)
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-800 transition-all cursor-pointer"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="pickup" className={labelClasses}>
                Pickup location
              </label>
              <input
                id="pickup"
                placeholder="e.g. Central Cafeteria"
                value={form.pickup_location}
                onChange={(e) => set('pickup_location', e.target.value)}
                className={inputClasses}
                aria-invalid={fieldErrors.pickup_location ? true : undefined}
                aria-describedby={fieldErrors.pickup_location ? 'pickup-error' : undefined}
              />
              {fieldErrors.pickup_location && (
                <p id="pickup-error" className="mt-1.5 text-xs font-semibold text-red-600">
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
                placeholder="e.g. Shahid Hall, Room 304"
                value={form.dropoff_location}
                onChange={(e) => set('dropoff_location', e.target.value)}
                className={inputClasses}
                aria-invalid={fieldErrors.dropoff_location ? true : undefined}
                aria-describedby={fieldErrors.dropoff_location ? 'dropoff-error' : undefined}
              />
              {fieldErrors.dropoff_location && (
                <p id="dropoff-error" className="mt-1.5 text-xs font-semibold text-red-600">
                  {fieldErrors.dropoff_location}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="urgency" className={labelClasses}>
                Urgency Level
              </label>
              <select
                id="urgency"
                value={form.urgency}
                onChange={(e) => set('urgency', e.target.value as Urgency)}
                className={inputClasses}
              >
                <option value="low">Low (Whenever convenient)</option>
                <option value="medium">Medium (Within a couple hours)</option>
                <option value="high">High (Immediate / Urgent)</option>
              </select>
            </div>
            <div>
              <label htmlFor="reward" className={labelClasses}>
                Suggested reward (৳, optional)
              </label>
              <div className="relative mt-1.5">
                <input
                  id="reward"
                  inputMode="decimal"
                  placeholder="e.g. 50"
                  value={form.reward}
                  onChange={(e) => set('reward', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  aria-invalid={fieldErrors.reward ? true : undefined}
                  aria-describedby={fieldErrors.reward ? 'reward-error' : undefined}
                />
              </div>
              {fieldErrors.reward && (
                <p id="reward-error" className="mt-1.5 text-xs font-semibold text-red-600">
                  {fieldErrors.reward}
                </p>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                {['20', '30', '50', '80', '100'].map((tip) => (
                  <button
                    key={tip}
                    type="button"
                    onClick={() => set('reward', tip)}
                    className={`pressable rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer tabular-nums active:scale-95 ${
                      form.reward === tip
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    ৳{tip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="border-t border-slate-100 pt-5">
            <button
              type="submit"
              disabled={submitting}
              className="pressable w-full sm:w-auto rounded-xl bg-emerald-800 px-6 py-3 text-sm font-bold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-900 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? 'Posting…' : 'Post request'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
