import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { rpc } from '../lib/api'

export default function OnboardingPage() {
  const { session, loading, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [department, setDepartment] = useState('')
  const [hall, setHall] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && !session) {
    return <Navigate to="/login" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await rpc('create_profile', {
      p_display_name: displayName,
      p_student_id: studentId || null,
      p_department: department || null,
      p_hall: hall || null,
      p_phone: phone || null,
    })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    await refreshProfile()
    navigate('/', { replace: true })
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200'

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Complete your profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Required before you can post or accept deliveries
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="display_name" className="block text-sm font-medium text-slate-700">
              Display name
            </label>
            <input
              id="display_name"
              type="text"
              required
              minLength={2}
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="student_id" className="block text-sm font-medium text-slate-700">
              Student ID <span className="text-slate-400">(private)</span>
            </label>
            <input
              id="student_id"
              type="text"
              pattern="[A-Za-z0-9]{4,20}"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="department" className="block text-sm font-medium text-slate-700">
                Department
              </label>
              <input
                id="department"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="hall" className="block text-sm font-medium text-slate-700">
                Hall
              </label>
              <input
                id="hall"
                type="text"
                value={hall}
                onChange={(e) => setHall(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
              Phone <span className="text-slate-400">(private)</span>
            </label>
            <input
              id="phone"
              type="tel"
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>
    </main>
  )
}
