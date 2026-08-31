# 04 — Security & Threat Model

**Authoritative for:** threats/abuse paths, **RLS coverage validation & negative tests**, and **trust & safety** policy (prohibited items, reporting, disputes, proof of delivery, rate-limit, audit, admin). The *what is enforced* (policy SQL) lives in `03` §6.
**Status:** Proposed.

## 1. Scope & trust boundaries

| Boundary | From → To | Protocol | Auth | Validation | Rate limit |
| --- | --- | --- | --- | --- | --- |
| Browser → Supabase | Client → PostgREST/Auth/Realtime | HTTPS/WSS | JWT (anon key + user JWT) | DB constraints + RLS + RPC checks | Supabase per-IP (coarse) + server-enforced (§3.9) |
| Client → Vercel | Browser → static assets | HTTPS | none (public SPA) | build-time | CDN |
| Realtime channel | Client ↔ Postgres Changes | WSS | JWT; RLS filters rows | n/a | Supabase |

**Key principle:** the Supabase **anon key is public** and shipped in the SPA. All real authorization is enforced by **RLS + RPC SECURITY DEFINER functions**, never by the key, never by route guards (`02` §3).

## 2. Assets & attacker capabilities

**Assets:** student PII (`student_id`, `phone`, `email`, route/location), delivery integrity state, chat contents, ratings/reputation, admin controls, service credentials (service-role key — never in client).

**Attacker (realistic, MVP):** any authenticated CUET user (peer student) and any anonymous internet user probing the public API. Capabilities: forge/inspect client requests, replay JWTs, guess UUIDs, spam messages, attempt to read other users' requests/messages, attempt invalid state transitions, create fake ratings. **Not** assumed: database superuser, insider at Supabase.

## 3. Threats (abuse paths)

| ID | Threat | Asset | Likelihood | Impact | Priority |
| --- | --- | --- | --- | --- | --- |
| T1 | Read another user's private request/messages by guessing UUID or querying `status<>'open'` | PII, chat | Medium | High | **High** |
| T2 | Inject chat into a request the attacker is not part of | Chat integrity | Medium | Medium | **High** |
| T3 | Accept a request twice / as the requester / race two acceptors | Delivery integrity | Medium | High | **High** |
| T4 | Force invalid state transition via direct PATCH (e.g. `open→delivered`) | Delivery integrity | Medium | High | **High** |
| T5 | Exfiltrate `phone`/`student_id` via raw `profiles` SELECT | PII | High (old plans leaked this) | High | **High** |
| T6 | Spam messages / rating abuse / leaderboard manipulation | Reputation | Medium | Medium | **Medium** |
| T7 | Prohibited-item delivery or platform misuse | Safety | Low | High | **Medium** |
| T8 | Service-role key leaked into client bundle | Full compromise | Low | Critical | **High** (prevented by build check) |
| T9 | Realtime channel name leaks request existence to non-participants | PII | Low | Medium | **Medium** |
| T10 | Self-promote to admin by updating own profile | Admin integrity | Low | Critical | **High** |
| T11 | Bypass create_request preconditions by raw INSERT (unverified, suspended, self requester_id) | Delivery integrity | Medium | High | **High** |
| T12 | Anonymization causes `rater_id = ratee_id` after account deletion | Data integrity | Low | Medium | **Medium** |
| T13 | Recursive RLS on admin_roles leaks role information | Admin integrity | Low | High | **High** |
| T14 | Rate limit bypass via client-side gate | Reputation, availability | Medium | Medium | **Medium** |
| T15 | Unauthorized contact access (phone) outside active delivery | PII | Low | High | **Medium** |
| T16 | Client invokes outbox worker functions or concurrent workers duplicate external delivery | Service integrity | Low | High | **Medium** |
| T17 | Profile is anonymized while Auth account remains usable, or Auth deletion leaves PII behind | Account access, PII | Low | High | **High** |

## 4. Mitigations (mapped to location)

| ID | Mitigation | Where |
| --- | --- | --- |
| T1 | `dr_select_open_or_participant`, `msg_select_participant`, `is_participant()` | `03` §6 |
| T2 | `send_message` RPC requires `is_participant(request_id)`; client INSERT blocked | `03` §6, `05` §3.8 |
| T3 | `accept_delivery` RPC: `SELECT … FOR UPDATE`, assert `deliverer_id IS NULL`, assert `actor <> requester_id` | ADR-0004, `05` §3.5 |
| T4 | All transitions only via RPCs; client `UPDATE` blocked by `dr_no_client_update` | `03` §6, ADR-0004 |
| T5 | Base `profiles` not granted to client; expose `public_profiles` view (public columns only) | `03` §6 |
| T6 | Rating uniqueness `ratings_once_per_perspective`; server-enforced rate-limit; no leaderboard in MVP | `03` §3.5, `04` §Trust |
| T7 | Prohibited-items policy + report flow (see §Trust) | `04` §Trust |
| T8 | CI secret-scan; service-role key exists only in CI/secrets and trusted server-side operations, never in SECURITY DEFINER functions or the SPA, never `VITE_*` (`09`) |
| T9 | Subscribe only to request IDs the user is allowed to see; no enumerable public channel names | `06` §3 |
| T10 | Admin model uses separate `admin_roles` table; profile-update RPCs do not touch it; no client grant on `admin_roles`; admin checks only via `has_admin_role()` SECURITY DEFINER function | `03` §3.7, `03` §6 |
| T11 | `create_request` RPC enforces verified + non-suspended + `requester_id` derived from caller; client INSERT blocked | `03` §3.2.1, `05` §3.4 |
| T12 | Anonymization retains distinct profile UUID per user; `rater_id <> ratee_id` preserved | `03` §8 |
| T13 | `admin_roles` has no client SELECT; `has_admin_role()` is SECURITY DEFINER with fixed search_path; no recursive RLS | `03` §6 |
| T14 | Rate limits enforced by internal `check_rate_limit()` helper with server-owned policies; helper and policy table are denied to API roles | `03` §3.9, `05` §3.4 |
| T15 | `get_delivery_contact` RPC enforces participant + status check; returns nothing after delivery/cancellation | `05` §3.11 |
| T16 | Outbox workers are `service_role`-only, claim with `SKIP LOCKED`, use leases/worker tokens, and deliver at-least-once with a provider idempotency key | `03` §3.10 |
| T17 | Account deletion uses Auth Admin server-side; a `BEFORE DELETE` trigger repeats the active-delivery check and clears PII without relying on `auth.uid()` | `03` §8 |

## 5. RLS coverage matrix & negative tests

Every table has a complete policy (`03` §6). Validation = automated negative tests (`07` §5). Required negative cases:

| Table | Negative test (must fail/return empty) |
| --- | --- |
| profiles | Authenticated user cannot SELECT `phone`/`student_id` from base table (only via `public_profiles`) |
| profiles | Authenticated user cannot INSERT/UPDATE/DELETE any profile row (RLS `USING(false)`) |
| delivery_requests | Non-participant cannot SELECT a non-`open` request row |
| delivery_requests | Unverified or suspended user cannot SELECT `open` requests |
| delivery_requests | Authenticated user cannot INSERT/UPDATE/DELETE any request row (RLS `USING(false)`) |
| delivery_events | Client cannot INSERT/UPDATE/DELETE |
| messages | Non-participant cannot SELECT messages of a request |
| messages | Authenticated user cannot INSERT/UPDATE/DELETE any message row (RLS `USING(false)`) |
| ratings | Non-participant cannot SELECT ratings of a request (unless ratee) |
| ratings | Authenticated user cannot INSERT/UPDATE/DELETE any rating row (RLS `USING(false)`) |
| reports | Non-admin cannot SELECT/INSERT/UPDATE/DELETE any report row |
| admin_roles | Non-admin cannot SELECT/INSERT/UPDATE/DELETE any admin_roles row |
| admin_roles | Recursive RLS does not leak role information (verify `has_admin_role()` is SECURITY DEFINER) |
| rate_limit_events | Client cannot read/write any row |
| rate_limit_policies | Client cannot read/write any policy row (REVOKE ALL, RLS USING(false)) |
| notification_outbox | Client cannot read/write rows or execute claim/ack/fail worker functions |
| audit_log | Client cannot read/write any row |
| traveler_availability (post-MVP placeholder) | Deny-all RLS/revokes remain until a future ADR defines participant visibility |

## 6. Trust & Safety

### 6.1 Prohibited items (MVP policy, enforced by UI + disclaimer; not yet auto-detected)
Illegal goods, alcohol/tobacco, weapons, hazardous materials, cash handling as courier, living animals, medications requiring prescription handoff without verification. Reportable; repeated violation → suspension (`is_suspended`). *Content moderation is manual for MVP.*

### 6.2 Reporting & blocking (MVP minimal)
- **MVP:** In-app "Report" on a request/participant creates a `reports` row via `submit_report` RPC (`03` §3.6, `05` §3.10), appends `audit_log` action `report_created`, and enqueues notification via `notification_outbox` (§3.10). User **blocking** is **deferred** to post-MVP; for MVP, reporting + admin suspension covers the main risk.
- **Admin model:** separate `admin_roles` table (`03` §3.7). Initial admins are provisioned by migration (not via client). Admin actions go through `SECURITY DEFINER` functions; never client RLS.
- **Deferred:** full admin console, auto-hide after reports, peer blocking.

### 6.3 Disputes & failed delivery
- **MVP:** either party may cancel **before `in_progress`** (ADR-0004). After `in_progress`, there is **no self-service cancellation**; the only path is **Report → admin resolution** (`admin_cancel_delivery` RPC). This prevents one party from unilaterally voiding an active delivery.
- **Deferred:** formal dispute/arbitration UI, refund/escrow.

### 6.4 Proof of delivery (MVP)
- **MVP:** deliverer taps "Mark delivered"; requester is prompted to rate (acts as soft confirmation). No photo required.
- **Deferred:** optional photo upload via Storage (adds attack surface; revisit ADR-0001).

### 6.5 Rating abuse & leaderboard manipulation
- **MVP mitigations:** bilateral unique ratings (`03` §3.5), no editing after insert, server-enforced rate-limit, no public leaderboard so no points to farm. Rating only allowed after `delivered`.
- **Public rating visibility:** individual ratings are visible only to participants and to the ratee. Public averages are **not** exposed in MVP (see `03` §9). If averages are later approved, they must go through a SECURITY DEFINER function with minimum-count privacy.
- **Deferred:** leaderboard/points (ADR-0007) reintroduces manipulation risk → requires rate-limit + anomaly review.

### 6.6 Rate limiting & spam prevention
- Supabase provides coarse per-IP limits (not enough). Protected RPCs call the internal `check_rate_limit()` helper backed by `rate_limit_events` and server-owned policies (`03` §3.9).
- Applied to: `create_request`, `send_message`, `submit_report`.
- **No client bypass:** clients cannot write to `rate_limit_events`; only RPCs can insert/check.
- *Thresholds require human approval* (`10` Q6).

### 6.7 Audit events
- `audit_log` (`03` §3.8) records: verification result, suspension, cancellation reason, report creation/resolution, rating created, profile created/updated, admin actions, contact access. Written by RPCs/`SECURITY DEFINER`.

### 6.8 Emergency / contact expectations
- BringIt is non-commercial student help; **not** an emergency service. Safety copy: "For emergencies, contact CUET authority / local emergency services." No live support SLA in MVP.

### 6.9 Admin / moderator responsibilities (MVP minimal)
- Admins are users with an `admin_roles` row (`03` §3.7). Model: separate table, **not** a flag on `profiles`. This prevents self-promotion: profile-update RPCs do not touch `admin_roles`, and no client has INSERT/UPDATE on `admin_roles`.
- **Initial provisioning:** 1–2 owner accounts seeded via migration run by project owner.
- **Who can grant/revoke:** only existing admins can modify `admin_roles` (via future RPC, not in MVP — for MVP, grant/revoke is done via direct SQL by project owner).
- **Responsibilities:** verify escalations, suspend abusive users (`is_suspended`), review reports, resolve post-`in_progress` disputes via `admin_cancel_delivery`.
- **Admin authorization model:** database admin RPCs call `has_admin_role()` using caller identity. The trusted account-deletion Edge Function first calls `authorize_admin_user_deletion` with the caller JWT, then uses a separate server-only Auth Admin client; browser-controlled queries never run with the server credential.
- **Admin actions:** report review/resolution, suspension, admin cancellation, and account deletion declare audit behavior. List/get reads do not mutate business state; account deletion logs request/completion without copying prior PII.

## 7. Cross-references

- Enforced policies: `03-data-model.md` §6.
- Profile RPC security contracts: `03-data-model.md` §3.1, `05` §3.1–§3.3.
  - Report/admin schema & RPCs: `03-data-model.md` §3.6, §3.7; `05` §3.10–§3.13.
- Rate limiting: `03-data-model.md` §3.9.
- Notification outbox: `03-data-model.md` §3.10.
- State machine & RPCs: ADR-0004, `05`.
- Realtime exposure: `06-realtime-design.md` §3 (T9).
- Tests for these threats: `07-testing-strategy.md` §5.
- Dependency/secret handling: `02`, `09`.
