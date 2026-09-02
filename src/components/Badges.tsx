import type { ReactNode } from 'react'
import type { DeliveryStatus, Urgency } from '../lib/requests'
import { clsx } from 'clsx'

const urgencyStyles: Record<Urgency, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-700',
}

const statusStyles: Record<DeliveryStatus, string> = {
  open: 'bg-emerald-100 text-emerald-800',
  accepted: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-slate-200 text-slate-700',
  cancelled: 'bg-rose-100 text-rose-700',
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        urgencyStyles[urgency],
      )}
    >
      {urgency} urgency
    </span>
  )
}

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        statusStyles[status],
      )}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{children}</div>
  )
}
