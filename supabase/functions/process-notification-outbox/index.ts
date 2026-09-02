// Scheduled notification worker (T-D6, docs/planning/03 §3.10, 02 §3).
// Claims due outbox rows, delivers them through the configured adapter, and
// acks or fails each row. At-least-once: the provider receives the
// deduplication_key as its idempotency key. service_role credential lives only
// here — it never reaches the browser.

import { handleRequest } from './handler.ts'

Deno.serve(async (req: Request) => {
  return handleRequest(req, (key: string) => Deno.env.get(key))
})