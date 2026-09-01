// Scheduled notification worker (T-D6, docs/planning/03 §3.10, 02 §3).
// Claims due outbox rows, delivers them through the configured adapter, and
// acks or fails each row. At-least-once: the provider receives the
// deduplication_key as its idempotency key. service_role credential lives only
// here — it never reaches the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const NOTIFICATION_WEBHOOK_URL = Deno.env.get('NOTIFICATION_WEBHOOK_URL') ?? ''

interface OutboxRow {
  id: number
  event_type: string
  payload: Record<string, unknown>
  deduplication_key: string
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET')
  if (cronSecret && req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 })
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return Response.json({ ok: false, code: 'CONFIG_ERROR' }, { status: 500 })
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const workerId = crypto.randomUUID()

  const { data: claimed, error } = await client.rpc('claim_notification_outbox', {
    p_worker_id: workerId,
    p_batch_size: 10,
  })
  if (error) {
    console.error('claim_notification_outbox error:', error.message)
    return Response.json(
      { ok: false, code: 'CLAIM_FAILED', error: error.message },
      { status: 500 },
    )
  }

  const rows = (claimed ?? []) as OutboxRow[]
  let acked = 0
  let failed = 0

  for (const row of rows) {
    try {
      await deliver(row)
      const { error: ackError } = await client.rpc('ack_notification_outbox', {
        p_id: row.id,
        p_worker_id: workerId,
      })
      if (ackError) {
        console.error(`ack failed for row ${row.id}:`, ackError.message)
        failed++
      } else {
        acked++
      }
    } catch (err) {
      console.error(`deliver failed for row ${row.id}:`, err)
      await client.rpc('fail_notification_outbox', {
        p_id: row.id,
        p_worker_id: workerId,
        p_error: err instanceof Error ? err.message : String(err),
      })
      failed++
    }
  }

  return Response.json({ ok: true, claimed: rows.length, acked, failed })
})

/** Delivery adapter. In production, POST to the configured webhook with the
 *  deduplication key as the idempotency key; locally, log. */
async function deliver(row: OutboxRow): Promise<void> {
  if (!NOTIFICATION_WEBHOOK_URL) {
    throw new Error('NOTIFICATION_WEBHOOK_URL is not configured')
  }
  const res = await fetch(NOTIFICATION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dedup-key': row.deduplication_key,
    },
    body: JSON.stringify({ event_type: row.event_type, payload: row.payload }),
  })
  if (!res.ok) {
    throw new Error(`notification webhook returned ${res.status}`)
  }
}