# ADR-0005: Realtime & Chat Architecture

**Status:** Proposed
**Date:** 2026-08-31
**Decision owner:** Project owner
**Deciders:** Project owner
Legacy proposal replaced: the per-request Broadcast channel design in `gemini-planning.md`.

## Context
The app needs live status updates and chat. Earlier plans used per-request Broadcast channels (`chat_room_{id}`, `delivery_status_{id}`), which risk leaking private request channels and duplicate client-side message state. We need a safe, source-of-truth-backed realtime design.

## Decision Drivers
- Chat must be persisted and auditable
- Subscriptions must be authorization-guarded (no private channel leakage)
- Must survive disconnects without losing/duplicating messages
- Must degrade gracefully when Realtime is unavailable
- Cursor-based pagination must be correct for UUID primary keys

## Considered Options
1. **Postgres Changes (chosen):** subscribe to `delivery_requests` UPDATE and `messages` INSERT. Messages are the DB source of truth; Realtime only notifies. RLS filters rows per subscriber.
2. **Broadcast channels (rejected):** ephemeral, duplicates state, lost on disconnect, not auditable.
3. **Presence (deferred):** "online now" not required to arrange a delivery.

## Decision
Use **Postgres Changes** exclusively for MVP:
- Status: `postgres_changes` on `delivery_requests` (`UPDATE`, filtered by `id`).
- Chat: `postgres_changes` on `messages` (`INSERT`, filtered by `request_id`).
- **No public enumerable channel names**; client subscribes only to a `request_id` it is already authorized to view (learned via RLS-enforced list/detail). RLS prevents non-participants from receiving private rows.
- Client handles **dedup** using composite cursor `(created_at, id)`, **ordering** (`created_at ASC, id ASC`), **missed-event recovery** (backfill query `WHERE (created_at, id) > (last_created_at, last_id)` on reconnect), and **polling fallback** (every ~15s if socket down >15s).
- Presence deferred to post-MVP.
- Status recovery refetches authoritative `delivery_requests` row and/or `delivery_events`; request UUIDs are not treated as event cursors.

## Rationale
Persisted messages remain the single source of truth; Realtime adds liveness without introducing a second mutable state or leaking private channels (addresses `04` T9). Composite cursor fixes chronological ordering for UUID `messages.id`.

## Consequences
**Positive:** auditable, safe under RLS, resilient to disconnects, correct ordering for UUIDs.
**Negative:** depends on Supabase Realtime availability (mitigated by polling fallback); more client logic for dedup/recovery.

## Cost implications
- **Dev cost:** client backfill/dedup logic requires careful implementation and testing.
- **Operational cost:** polling fallback adds mild DB load during Realtime outages.
- **Infra cost:** no extra services; uses existing Postgres Changes.

## Security implications
- RLS on `messages` and `delivery_requests` is the enforcement; client cannot subscribe to rows it cannot `SELECT`.
- No channel name enumeration; request IDs are learned from authorized queries only.
- Composite cursor prevents UUID-guessing attacks via cursor manipulation (UUIDs are not ordered).

## Reversibility
High: switching to Broadcast later would be additive, not required.

## Approval conditions
- Project owner confirms Postgres Changes is acceptable for MVP realtime.
- Team confirms polling fallback is sufficient for Realtime outages.
- Composite cursor design approved for UUID primary keys.

## Implementation Implications
- `06-realtime-design.md` (full contract).
- `03-data-model.md` §3.4 (ordering index), §6 (RLS protecting subscriptions).
- Tasks `T-R1`, realtime tests in `07` §5.

## Related
- `../planning/04-security-and-threat-model.md` (T9)
- `../planning/06-realtime-design.md`
- `../planning/07-testing-strategy.md` §5
- `../adr/0001-backend-platform.md` (Supabase Realtime)
