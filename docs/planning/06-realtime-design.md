# 06 — Realtime Design

**Authoritative for:** realtime architecture choice, subscription authorization, dedup/ordering/missed-event recovery, polling fallback.
**Status:** Proposed. See ADR-0005.

## 1. Decision: Postgres Changes, not Broadcast

| Option | Verdict | Reason |
| --- | --- | --- |
| **Postgres Changes** (subscribe to `delivery_requests` UPDATE + `messages` INSERT) | **Chosen** | Messages are persisted (`03` §3.4) and are the source of truth; Realtime merely notifies. No separate broadcast state to reconcile. |
| Broadcast channels (ephemeral) | Rejected | Would duplicate message state client-side; lost on disconnect; not auditable. |
| Presence | **Deferred** (post-MVP) | "Online now" not needed to arrange a delivery (ADR-0005). |

## 2. Channels & events

- **Status:** subscribe to `postgres_changes` on `delivery_requests` where `event='UPDATE'` and `id = <request_id>`. Supabase applies RLS, so a non-participant **cannot** receive updates for a non-`open` request (mitigates T9).
- **Chat:** subscribe to `postgres_changes` on `messages` where `event='INSERT'` and `request_id = <request_id>`. RLS ensures only participants receive rows.
- **No per-request public channel name leakage:** the client only ever subscribes to a `request_id` it has already been authorized to view (it learned the id from a participant-only or open list). We do **not** broadcast a discoverable channel name that reveals private requests.

## 3. Subscription authorization

1. Client fetches the request it is allowed to see (RLS-enforced list/detail).
2. Only then does it open a Realtime subscription filtered by that `request_id`.
3. RLS on the tables is the enforcement; the client cannot subscribe to rows it cannot `SELECT`.

## 4. Dedup, ordering, missed-event recovery

| Concern | Approach |
| --- | --- |
| **Ordering** | Sort by `(created_at ASC, id ASC)` — the index `idx_messages_request_time` (`03` §3.4). Use stable `id` as tiebreaker. |
| **Cursor (critical fix)** | `messages.id` is UUID. Do **not** use `id > lastSeenId` as a chronological cursor. Use composite cursor `(created_at, id) > (last_created_at, last_id)` with index `(request_id, created_at ASC, id ASC)`. |
| **Deduplication** | Track `lastSeenCreatedAt` / `lastSeenId`. On each insert, ignore rows where `(created_at, id) <= (lastSeenCreatedAt, lastSeenId)`. Realtime may deliver an insert the client already has from a refetch. |
| **Missed-event recovery** | On (re)connect, immediately run a **backfill query**: `SELECT … WHERE request_id=$1 AND (created_at, id) > (last_created_at, last_id) ORDER BY created_at ASC, id ASC`. This recovers any events delivered while disconnected. |
| **Status recovery** | Refetch authoritative `delivery_requests` row and/or `delivery_events` ordered by `(created_at ASC, id ASC)`. Do **not** treat request UUIDs as event cursors. |
| **Reconnection** | Supabase client auto-reconnects; on `SUBSCRIBED`/`CHANNEL_ERROR`/`CLOSED`, re-run backfill and reset `lastSeen`. Exponential backoff on repeated errors. |
| **Polling fallback** | If Realtime is unavailable for >N seconds (config, proposed 15s), fall back to polling the backfill query every 15s until the socket recovers. UI shows a non-blocking "Reconnecting…" state (native, no Sonner dependency — ADR-0002). |

## 5. Client contract (pseudocode)

```
on mount (request authorized):
  lastSeenCreatedAt = null
  lastSeenId = null
  subscribe(status UPDATE, messages INSERT) with RLS
  refetchSince(lastSeenCreatedAt, lastSeenId)  // initial + recovery

on message INSERT:
  if (row.created_at, row.id) > (lastSeenCreatedAt, lastSeenId):
    append; lastSeenCreatedAt = row.created_at; lastSeenId = row.id

on reconnect:
  refetchSince(lastSeenCreatedAt, lastSeenId)  // dedup by composite cursor
  resubscribe

on realtime-unavailable > 15s:
  start polling refetchSince(lastSeenCreatedAt, lastSeenId) every 15s
```

## 6. Cross-references

- Persisted source of truth: `03-data-model.md` §3.4.
- Composite cursor index: `03-data-model.md` §3.4 (`idx_messages_request_time`).
- RLS that protects subscriptions: `03` §6, `04` §5 (T9).
- State transitions that drive status events: ADR-0004, `05`.
- Tests: `07-testing-strategy.md` §5 (realtime dedup/ordering/recovery, unauthorized subscription).
