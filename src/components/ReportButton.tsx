import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { submitReport } from '../lib/requests'

interface ReportButtonProps {
  requestId: string
  targetId: string
  targetName: string
}

/**
 * Minimal user-facing report submission (MS-13, 05 §3.10).
 * The server enforces who/what may be reported; this component only collects
 * the reason/description and surfaces the stable error code message.
 */
export default function ReportButton({
  requestId,
  targetId,
  targetName,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  function handleOpen() {
    setOpen(true)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 3 || trimmed.length > 200) {
      setError('Please provide a reason between 3 and 200 characters.')
      return
    }
    if (description.length > 1000) {
      setError('Description must be at most 1000 characters.')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await submitReport({
      requestId,
      targetId,
      reason: trimmed,
      description: description.trim() || null,
    })
    setSubmitting(false)
    if (res.ok) {
      setSubmitted(true)
    } else {
      setError(res.message ?? 'Failed to submit the report.')
    }
  }

  if (submitted) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        Thanks — our moderators will review your report.
      </p>
    )
  }

  return (
    <div className="flex justify-end">
      {open ? (
        <form
          onSubmit={handleSubmit}
          className="w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
        >
          <p className="text-sm font-semibold text-slate-900">
            Report {targetName} on this delivery
          </p>

          <div>
            <label
              htmlFor="report-reason"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Reason
            </label>
            <input
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={200}
              placeholder="e.g. Harassment, no-show, request spam"
              disabled={submitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label
              htmlFor="report-description"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Details (optional)
            </label>
            <textarea
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Anything that helps our moderators review this report…"
              disabled={submitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Submit report
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <AlertTriangle className="h-4 w-4" />
          Report
        </button>
      )}
    </div>
  )
}