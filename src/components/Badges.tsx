import type { ReactNode } from 'react'
import type { DeliveryStatus, Urgency } from '../lib/requests'
import { clsx } from 'clsx'

const urgencyStyles: Record<Urgency, { badge: string; dot: string }> = {
  low: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
  medium: {
    badge: 'bg-amber-50 text-amber-900 border-amber-200/80',
    dot: 'bg-amber-500',
  },
  high: {
    badge: 'bg-rose-50 text-rose-900 border-rose-200/80',
    dot: 'bg-rose-500 animate-pulse',
  },
}

const statusStyles: Record<DeliveryStatus, { badge: string; dot: string }> = {
  open: {
    badge: 'bg-emerald-50 text-emerald-900 border-emerald-200/80',
    dot: 'bg-emerald-500 animate-pulse',
  },
  accepted: {
    badge: 'bg-sky-50 text-sky-900 border-sky-200/80',
    dot: 'bg-sky-500',
  },
  in_progress: {
    badge: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
    dot: 'bg-indigo-500 animate-pulse',
  },
  delivered: {
    badge: 'bg-slate-100 text-slate-800 border-slate-200',
    dot: 'bg-slate-500',
  },
  cancelled: {
    badge: 'bg-rose-50 text-rose-900 border-rose-200',
    dot: 'bg-rose-400',
  },
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const style = urgencyStyles[urgency]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize',
        style.badge,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {urgency} urgency
    </span>
  )
}

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  const style = statusStyles[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize',
        style.badge,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {status.replace('_', ' ')}
    </span>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'group relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:translate-y-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
