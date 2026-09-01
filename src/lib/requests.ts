import type { Result } from './api'
import { rpc } from './api'
import { supabase } from './supabase'

export type Urgency = 'low' | 'medium' | 'high'

export type DeliveryStatus =
  | 'open'
  | 'accepted'
  | 'in_progress'
  | 'delivered'
  | 'cancelled'

export interface DeliveryRequest {
  id: string
  requester_id: string
  deliverer_id: string | null
  title: string
  description: string | null
  pickup_location: string
  dropoff_location: string
  urgency: Urgency
  reward_suggestion: number | null
  status: DeliveryStatus
  created_at: string
  updated_at: string
}

export interface StatusEvent {
  id: number
  from_status: DeliveryStatus | null
  to_status: DeliveryStatus
  note: string | null
  created_at: string
}

export interface CreateRequestInput {
  title: string
  description: string | null
  pickup_location: string
  dropoff_location: string
  urgency: Urgency
  reward_suggestion: number | null
}

// ---------- Reads (RLS-enforced PostgREST selects) ----------

/** Open requests, newest first (docs/planning/01 MS-4). RLS limits to verified users. */
export async function listOpenRequests(urgency?: Urgency): Promise<DeliveryRequest[]> {
  let query = supabase
    .from('delivery_requests')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  if (urgency) {
    query = query.eq('urgency', urgency)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as DeliveryRequest[]
}

/** A single request the caller may see (open rows or participant rows). */
export async function getRequest(id: string): Promise<DeliveryRequest | null> {
  const { data, error } = await supabase
    .from('delivery_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? null) as DeliveryRequest | null
}

/** Display names for profile ids via the PII-free public view (03 §6). */
export async function getProfileNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return {}
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, display_name')
    .in('id', unique)
  if (error) throw new Error(error.message)
  const names: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{ id: string; display_name: string }>) {
    names[row.id] = row.display_name
  }
  return names
}

/** Append-only status history (03 §3.3); composite cursor ordering per 06 §4. */
export async function getStatusHistory(requestId: string): Promise<StatusEvent[]> {
  const { data, error } = await supabase
    .from('delivery_events')
    .select('id, from_status, to_status, note, created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as StatusEvent[]
}

// ---------- Writes (SECURITY DEFINER RPCs — the only mutation path) ----------

export function createRequest(input: CreateRequestInput): Promise<Result<{ request_id: string }>> {
  return rpc('create_request', {
    p_title: input.title,
    p_description: input.description,
    p_pickup_location: input.pickup_location,
    p_dropoff_location: input.dropoff_location,
    p_urgency: input.urgency,
    p_reward_suggestion: input.reward_suggestion,
  })
}

export function acceptRequest(requestId: string): Promise<Result<{ status: string }>> {
  return rpc('accept_delivery', { p_request_id: requestId })
}

export function cancelRequest(
  requestId: string,
  reason?: string,
): Promise<Result<{ status: string }>> {
  return rpc('cancel_delivery', {
    p_request_id: requestId,
    p_reason: reason ?? null,
  })
}

export function advanceRequest(
  requestId: string,
  toStatus: 'in_progress' | 'delivered',
): Promise<Result<{ status: string }>> {
  return rpc('advance_delivery', { p_request_id: requestId, p_to_status: toStatus })
}

// ---------- Chat (MS-8: participant-only persisted messages) ----------

export interface Message {
  id: string
  request_id: string
  sender_id: string
  content: string
  created_at: string
}

/**
 * Messages for a request, ordered by the composite cursor (created_at, id)
 * per docs/planning/06 §4 — never a bare UUID comparison.
 */
export async function listMessages(
  requestId: string,
  afterCursor?: { createdAt: string; id: string }
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (afterCursor) {
    query = query.or(
      `created_at.gt.${afterCursor.createdAt},and(created_at.eq.${afterCursor.createdAt},id.gt.${afterCursor.id})`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Message[]
}

export async function sendMessage(
  requestId: string,
  content: string,
): Promise<Result<{ message_id: string }>> {
  return rpc('send_message', { p_request_id: requestId, p_content: content })
}

// ---------- Ratings (MS-10: minimal bilateral rating) ----------

export interface Rating {
  id: string
  request_id: string
  rater_id: string
  ratee_id: string
  role: 'as_requester' | 'as_deliverer'
  score: number
  comment: string | null
  created_at: string
}

export type RatingRole = 'as_requester' | 'as_deliverer'

export function submitRating(
  requestId: string,
  rateeId: string,
  role: RatingRole,
  score: number,
  comment: string | null,
): Promise<Result<{ rating_id: string }>> {
  return rpc('submit_rating', {
    p_request_id: requestId,
    p_ratee_id: rateeId,
    p_role: role,
    p_score: score,
    p_comment: comment,
  })
}

/** Ratings cast BY the caller for this request (to detect "already rated"). */
export async function getMyRatings(requestId: string): Promise<Rating[]> {
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Rating[]
}

// ---------- Reports (MS-13: minimal user-facing report submission) ----------

export interface SubmitReportInput {
  requestId: string
  targetId: string
  reason: string
  description?: string | null
}

export function submitReport(
  input: SubmitReportInput,
): Promise<Result<{ report_id: string }>> {
  return rpc('submit_report', {
    p_request_id: input.requestId,
    p_target_id: input.targetId,
    p_reason: input.reason,
    p_description: input.description ?? null,
  })
}
