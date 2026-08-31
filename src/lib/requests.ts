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
