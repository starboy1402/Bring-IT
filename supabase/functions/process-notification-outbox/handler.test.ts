import { assertEquals } from 'jsr:@std/assert@0.224.0/assert-equals'
import { assertStringIncludes } from 'jsr:@std/assert@0.224.0/assert-string-includes'
import { handleRequest, type EnvGetter } from './handler.ts'

Deno.test('Edge Function: missing cron secret returns 500 CONFIG_ERROR', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { Authorization: 'Bearer anything' }
  })
  const env: EnvGetter = () => undefined

  const res = await handleRequest(req, env)
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.code, 'CONFIG_ERROR')
  assertStringIncludes(body.message, 'Missing NOTIFICATION_CRON_SECRET')
})

Deno.test('Edge Function: missing Authorization returns 401', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
  })
  const env: EnvGetter = (key) => key === 'NOTIFICATION_CRON_SECRET' ? 'secret123' : undefined

  const res = await handleRequest(req, env)
  assertEquals(res.status, 401)
  const body = await res.json()
  assertEquals(body.code, 'UNAUTHORIZED')
})

Deno.test('Edge Function: wrong Authorization returns 401', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { Authorization: 'Bearer WRONG' }
  })
  const env: EnvGetter = (key) => key === 'NOTIFICATION_CRON_SECRET' ? 'secret123' : undefined

  const res = await handleRequest(req, env)
  assertEquals(res.status, 401)
  const body = await res.json()
  assertEquals(body.code, 'UNAUTHORIZED')
})

Deno.test('Edge Function: missing Supabase URL returns 500 CONFIG_ERROR', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { Authorization: 'Bearer secret123' }
  })
  const env: EnvGetter = (key) => key === 'NOTIFICATION_CRON_SECRET' ? 'secret123' : undefined

  const res = await handleRequest(req, env)
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.code, 'CONFIG_ERROR')
  assertStringIncludes(body.message, 'Missing Supabase config')
})

Deno.test('Edge Function: successfully processes items', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { Authorization: 'Bearer secret123' }
  })

  const env: EnvGetter = (key) => {
    if (key === 'NOTIFICATION_CRON_SECRET') return 'secret123'
    if (key === 'SUPABASE_URL') return 'http://supabase'
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'sr_key'
    if (key === 'NOTIFICATION_WEBHOOK_URL') return 'http://webhook'
    return undefined
  }

  const mockDbClient = {
    rpc: async (fnName: string) => {
      if (fnName === 'claim_notification_outbox') {
        return { data: [
          { id: 1, event_type: 'test_event', payload: { a: 1 }, deduplication_key: 'dedup1' },
          { id: 2, event_type: 'test_event_2', payload: { b: 2 }, deduplication_key: 'dedup2' }
        ], error: null }
      }
      if (fnName === 'ack_notification_outbox') {
        return { error: null }
      }
      return { error: null }
    }
  }

  let fetchCalls = 0
  const mockFetcher = async () => {
    fetchCalls++
    return new Response(null, { status: 200 })
  }

  const res = await handleRequest(req, env, mockFetcher, mockDbClient)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
  assertEquals(body.claimed, 2)
  assertEquals(body.acked, 2)
  assertEquals(body.failed, 0)
  assertEquals(fetchCalls, 2)
})

Deno.test('Edge Function: handles webhook failures and records failure', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { Authorization: 'Bearer secret123' }
  })

  const env: EnvGetter = (key) => {
    if (key === 'NOTIFICATION_CRON_SECRET') return 'secret123'
    if (key === 'SUPABASE_URL') return 'http://supabase'
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'sr_key'
    if (key === 'NOTIFICATION_WEBHOOK_URL') return 'http://webhook'
    return undefined
  }

  let failedCount = 0
  const mockDbClient = {
    rpc: async (fnName: string) => {
      if (fnName === 'claim_notification_outbox') {
        return { data: [
          { id: 1, event_type: 'test_event', payload: {}, deduplication_key: 'dedup1' },
        ], error: null }
      }
      if (fnName === 'fail_notification_outbox') {
        failedCount++
        return { error: null }
      }
      return { error: null }
    }
  }

  const mockFetcher = async () => {
    return new Response(null, { status: 500 }) // simulate failure
  }

  const res = await handleRequest(req, env, mockFetcher, mockDbClient)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
  assertEquals(body.claimed, 1)
  assertEquals(body.acked, 0)
  assertEquals(body.failed, 1)
  assertEquals(failedCount, 1)
})
