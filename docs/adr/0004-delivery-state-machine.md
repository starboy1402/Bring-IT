# ADR-0004: Delivery State Machine

**Status:** Proposed
**Date:** 2026-08-31
**Decision owner:** Project owner
**Deciders:** Project owner
Legacy proposal replaced: the duplicated-status design in `.kilo/plans` (`delivery_requests` + `deliveries` both holding `status`).

## Context
Earlier plans let clients `PATCH` `delivery_requests.status` directly and duplicated mutable status across two tables. This is unsafe: it permits invalid transitions, self-acceptance, double acceptance, and requester=deliverer. We need a single, database-enforced state machine.

## Decision Drivers
- Single source of truth for delivery status
- Invalid transitions impossible (not just UI-guarded)
- Exactly one deliverer per request, atomically
- Requester ≠ deliverer
- Actor-authorized transitions
- Auditability of every change

## Decision
- **Single source of truth:** `delivery_requests.status` (`delivery_status` enum: `open, accepted, in_progress, delivered, cancelled`).
- **No second mutable status** anywhere; the old `deliveries` table is removed.
- **Append-only history:** `delivery_events` records every transition.
- **All transitions via `SECURITY DEFINER` RPCs** (`accept_delivery`, `advance_delivery`, `cancel_delivery`) that:
  - take a `SELECT … FOR UPDATE` row lock,
  - re-check preconditions after locking (prevents races),
  - assert the correct actor,
  - reject illegal `from→to`.
- **Client `UPDATE`/`DELETE` on `delivery_requests` is blocked by RLS** (`dr_no_client_update`, `dr_no_client_delete`).

### Allowed transitions & actors
```
open      --accept (any verified user ≠ requester)------------------> accepted
accepted  --pickup (deliverer)--------------------------------------> in_progress
in_progress --deliver (deliverer)-----------------------------------> delivered
open      --cancel (requester)--------------------------------------> cancelled
accepted  --cancel (requester OR deliverer, before in_progress)----> cancelled
```
- `cancelled` and `delivered` are terminal.
- After `in_progress`, cancellation is **not** self-service → must go through Report/Admin (`04` §6.3, `03` §3.6, `05` §3.13).
- `no_self_delivery` constraint + RPC check prevent requester=deliverer.
- Simultaneous acceptors: lock + null-check → exactly one succeeds (`ALREADY_ACCEPTED`).

## Rationale
Enforces integrity at the only layer that cannot be bypassed (the database), satisfying the brief's requirement for database-enforced, concurrency-safe transitions.

## Consequences
**Positive:** impossible invalid state; safe concurrency; clear audit trail; simple client (call RPCs).
**Negative:** logic lives in Postgres (needs local Supabase for tests); less "flexible" ad-hoc edits.

## Cost implications
- **Dev cost:** RPC authoring + testing is moderate; requires local Supabase for integration tests.
- **Operational cost:** low; row-level locks are narrow and acceptable at MVP volume.
- **Future cost:** adding new transitions requires RPC changes + migration.

## Security implications
- Eliminates client-side state corruption (T3, T4 in `04`).
- RPCs are `SECURITY DEFINER`; function owner is least-privileged; `search_path` fixed; no trust in caller IDs (`03` §6, `05` §3.14).
- All transitions are audit-logged.

## Reversibility
Low once data exists; transitions are explicit and test-covered. Schema migration is straightforward pre-launch.

## Approval conditions
- Project owner reviews allowed transition diagram.
- Team confirms no hidden client-side mutation paths remain.
- `admin_cancel_delivery` scope approved for post-`in_progress` cancellation (MS-13).

## Implementation Implications
- `03-data-model.md` §3.2–§3.3, §6 (RLS), §4 (diagram).
- `05-api-and-business-operations.md` §3 (RPC contracts, error codes).
- Tasks `T-D3`, `T-C3`, `T-C4`, `T-C5` in `08`.

## Related
- `../planning/03-data-model.md`, `../planning/05-api-and-business-operations.md`
- `../planning/04-security-and-threat-model.md` (T3, T4)
- `../planning/07-testing-strategy.md` §5
- `../adr/0001-backend-platform.md` (Supabase Postgres)
