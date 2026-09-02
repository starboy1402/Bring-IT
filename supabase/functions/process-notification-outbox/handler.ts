import { createClient } from 'npm:@supabase/supabase-js@2'

interface OutboxRow {
  id: number
  event_type: string
  payload: Record<string, unknown>
  deduplication_key: string
}

export type EnvGetter = (key: string) => string | undefined

export interface NotificationDbClient {
  rpc(fnName: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
}

export async function handleRequest(req: Request, env: EnvGetter, fetcher: typeof fetch = fetch, dbClient?: NotificationDbClient): Promise<Response> {
  const cronSecret = env('NOTIFICATION_CRON_SECRET')
  if (!cronSecret) {
    return Response.json({ ok: false, code: 'CONFIG_ERROR', message: 'Missing NOTIFICATION_CRON_SECRET' }, { status: 500 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const webhookUrl = env('NOTIFICATION_WEBHOOK_URL')

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, code: 'CONFIG_ERROR', message: 'Missing Supabase config' }, { status: 500 })
  }

  const client = dbClient || createClient(supabaseUrl, serviceRoleKey, {
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
      if (!webhookUrl) {
        throw new Error('NOTIFICATION_WEBHOOK_URL is not configured')
      }
      const res = await fetcher(webhookUrl, {
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
}
