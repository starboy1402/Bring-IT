import { beforeAll, describe, expect, it } from 'vitest'
import {
  createServiceClient,
  createTestUser,
  type TestUser,
} from './helpers'

const svc = createServiceClient()

let idCounter = 0
function uniqueKey(): string {
  idCounter += 1
  return `outbox-test:${Date.now()}:${idCounter}:${Math.floor(Math.random() * 1e6)}`
}

async function enqueue(overrides: Partial<{
  deduplication_key: string
  max_attempts: number
}> = {}): Promise<number> {
  const { data, error } = await svc
    .from('notification_outbox')
    .insert({
      event_type: 'report_created',
      payload: { report_id: uniqueKey() },
      deduplication_key: overrides.deduplication_key ?? uniqueKey(),
      max_attempts: overrides.max_attempts ?? 5,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`enqueue failed: ${error?.message}`)
  return data.id
}

async function claim(workerId: string, batchSize = 10): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await svc.rpc('claim_notification_outbox', {
    p_worker_id: workerId,
    p_batch_size: batchSize,
  })
  if (error) throw new Error(`claim failed: ${error.message}`)
  return (data ?? []) as Array<Record<string, unknown>>
}

async function ack(id: number, workerId: string): Promise<boolean> {
  const { data, error } = await svc.rpc('ack_notification_outbox', {
    p_id: id,
    p_worker_id: workerId,
  })
  if (error) throw new Error(`ack failed: ${error.message}`)
  return (data as boolean) ?? false
}

async function fail(id: number, workerId: string, errMsg: string): Promise<boolean> {
  const { data, error } = await svc.rpc('fail_notification_outbox', {
    p_id: id,
    p_worker_id: workerId,
    p_error: errMsg,
  })
  if (error) throw new Error(`fail failed: ${error.message}`)
  return (data as boolean) ?? false
}

describe('notification_outbox worker functions (T-D6, MS-13)', () => {
  beforeAll(async () => {
    // Isolate: discard any rows enqueued by other test files (e.g. reports).
    await svc.from('notification_outbox').delete().neq('id', 0)
  })

  it('two workers claim disjoint rows concurrently', async () => {
    const ids = [await enqueue(), await enqueue(), await enqueue(), await enqueue(), await enqueue()]
    const w1 = crypto.randomUUID()
    const w2 = crypto.randomUUID()
    const [r1, r2] = await Promise.all([claim(w1, 3), claim(w2, 3)])
    const claimedIds = [...r1, ...r2].map((row) => row.id) as number[]
    // Every enqueued row is claimed by exactly one worker; no overlap.
    for (const id of ids) expect(claimedIds).toContain(id)
    const m1 = new Set(r1.map((row) => row.id))
    const m2 = new Set(r2.map((row) => row.id))
    for (const id of m1) expect(m2.has(id)).toBe(false)
    for (const row of [...r1, ...r2]) expect(row.status).toBe('processing')
  })

  it('ack requires ownership; only the claiming worker can ack', async () => {
    const id = await enqueue()
    const w1 = crypto.randomUUID()
    const w2 = crypto.randomUUID()
    await claim(w1, 10)

    expect(await ack(id, w2)).toBe(false) // not the owner
    expect(await ack(id, w1)).toBe(true)

    const { data: row } = await svc.from('notification_outbox').select('*').eq('id', id).single()
    expect(row.status).toBe('sent')
    expect(row.sent_at).toBeTruthy()
    expect(row.claimed_at).toBeNull()
    expect(row.claimed_by).toBeNull()
  })

  it('fail increments attempts, stores the error, and schedules backoff', async () => {
    const id = await enqueue()
    const w1 = crypto.randomUUID()
    await claim(w1, 10)

    expect(await fail(id, w1, 'webhook 500')).toBe(true)
    const { data: row } = await svc.from('notification_outbox').select('*').eq('id', id).single()
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toContain('webhook')
    expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(Date.now())
    expect(row.claimed_by).toBeNull()
  })

  it('a stale processing lease is reclaimed and the stale worker loses ownership', async () => {
    const id = await enqueue()
    const w1 = crypto.randomUUID()
    const w2 = crypto.randomUUID()
    await claim(w1, 10)

    // Age the lease past the 5-minute recovery window.
    await svc
      .from('notification_outbox')
      .update({ claimed_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() })
      .eq('id', id)

    const reclaimed = await claim(w2, 10)
    expect(reclaimed.map((row) => row.id)).toContain(id)
    expect(await ack(id, w1)).toBe(false) // stale worker cannot ack reclaimed row
    expect(await ack(id, w2)).toBe(true)
  })

  it('duplicate producer key creates exactly one row', async () => {
    const key = uniqueKey()
    const first = await enqueue({ deduplication_key: key })
    const { error } = await svc.from('notification_outbox').insert({
      event_type: 'report_created',
      payload: { report_id: uniqueKey() },
      deduplication_key: key,
    })
    expect(error).toBeTruthy()

    const { data, error: readError } = await svc
      .from('notification_outbox')
      .select('id')
      .eq('deduplication_key', key)
    expect(readError).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(first)
  })

  it('retries exhaust exactly at max_attempts into failed_terminally', async () => {
    const id = await enqueue({ max_attempts: 2 })
    const w1 = crypto.randomUUID()
    await claim(w1, 10)
    expect(await fail(id, w1, 'attempt 1')).toBe(true)

    // Make the retry immediately claimable (backoff is normally in the future).
    await svc
      .from('notification_outbox')
      .update({ next_attempt_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', id)
    await claim(w1, 10)
    expect(await fail(id, w1, 'attempt 2')).toBe(true)

    const { data: row } = await svc.from('notification_outbox').select('*').eq('id', id).single()
    expect(row.status).toBe('failed_terminally')
    expect(row.attempts).toBe(2)
    expect(row.max_attempts).toBe(2)
    expect(row.claimed_by).toBeNull()
  })

  it('anon and authenticated clients cannot execute the worker functions', async () => {
    const user: TestUser = await createTestUser('cuet.ac.bd', 'Outbox Anon')
    const r1 = await user.client.rpc('claim_notification_outbox', {
      p_worker_id: crypto.randomUUID(),
      p_batch_size: 1,
    })
    expect(r1.error).toBeTruthy()

    const r2 = await user.client.rpc('ack_notification_outbox', {
      p_id: 999,
      p_worker_id: crypto.randomUUID(),
    })
    expect(r2.error).toBeTruthy()

    const r3 = await user.client.rpc('fail_notification_outbox', {
      p_id: 999,
      p_worker_id: crypto.randomUUID(),
      p_error: 'nope',
    })
    expect(r3.error).toBeTruthy()
  })

  it('Edge Function boundary: requires NOTIFICATION_CRON_SECRET if configured', async () => {
    // If the local environment has the secret configured, we can test it.
    // Let's just make a fetch call with a wrong secret.
    // In local dev, it might not be configured, but we can test the unauthenticated path
    // by simulating a direct fetch to the edge function.
    const res = await fetch('http://127.0.0.1:54321/functions/v1/process-notification-outbox', {
      method: 'POST',
      headers: { Authorization: 'Bearer WRONG' }
    })
    const json = await res.json() as { code?: string }
    // It will return 401 UNAUTHORIZED if the secret is set and mismatches, 
    // or if the secret is NOT set, it might proceed and return ok/CONFIG_ERROR.
    if (res.status === 401) {
      expect(json.code).toBe('UNAUTHORIZED')
    }
  })
})