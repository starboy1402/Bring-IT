# 07 — Testing Strategy

**Authoritative for:** testing approach, TDD rules, coverage tiers, and the **required tests per feature** (each implementation task must carry acceptance criteria + tests).
**Status:** Proposed.

## 1. Principle: testing is continuous, not a phase

Every implementation task in `08` has **acceptance criteria** and **required tests** attached. No task is "done" without its tests green. We follow strict **TDD** (see `../adr` note / skill): write a failing test first, watch it fail for the right reason, implement minimally, refactor, keep green. Exceptions (config, generated code) require explicit human sign-off.

## 2. Test tiers & tooling

| Tier | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest | Pure logic: validation, scoring-free helpers, state-machine *rules* (mirrored from RPC), rating uniqueness logic, realtime dedup/ordering helpers, cursor encoding. |
| Component | Vitest + RTL | Rendering, form validation, role-gated buttons, accessible labels, empty/loading states. |
| Integration | Supabase local (CLI) + Vitest | RPCs end-to-end against a real Postgres: accept/advance/cancel/complete, `is_participant`, rate-limit, profile CRUD, report submission, admin operations. |
| RLS | Supabase local + Vitest (multiple auth sessions) | **Negative authorization** per `04` §5. |
| Concurrency | Supabase local + parallel clients | Simultaneous acceptance; invalid transitions under load. |
| Realtime | Supabase local + Vitest | Dedup, ordering, missed-event recovery, unauthorized subscription, composite cursor correctness. |
| E2E | Playwright | Full journeys; **main flow uses ≥2 separate browser contexts** (two users). |

## 3. TDD workflow (mandatory per task)

1. Write failing test naming the behavior (e.g. `accept_delivery rejects requester as deliverer`).
2. Run it; confirm it fails because the feature is missing (not a typo).
3. Implement minimal code/RPC.
4. Run; confirm green and no regressions.
5. Refactor; keep green.

## 4. Required tests mapped to MVP features (`01` §2)

| Feature | Unit | Component | Integration/RLS | E2E |
| --- | --- | --- | --- | --- |
| MS-1 verified auth | — | signup/login guard | RLS: unverified blocked | two-user signup |
| MS-2 private profile | validation | onboarding form | `public_profiles` hides PII; profile RPCs enforce field restrictions | — |
| MS-3 create request | validate fields | create form | `create_request` RPC: verified, non-suspended, requester_id = auth.uid(); direct INSERT blocked | requester creates |
| MS-4 browse open | — | list/empty/filter | non-`open` hidden | browse |
| MS-5 atomic accept | accept rules | accept button gating | `ALREADY_ACCEPTED` concurrency | deliverer accepts |
| MS-6 DB state machine | transition rules | status UI | invalid transition rejected | lifecycle |
| MS-7 status history | — | history view | events written | visible to both |
| MS-8 participant chat | dedup/order, cursor | chat UI | non-participant blocked; `send_message` RPC enforces participant + rate-limit | two-user chat |
| MS-9 completion | — | mark-delivered | `delivered` only by deliverer | complete |
| MS-10 bilateral rating | uniqueness | rating form | duplicate/self/wrong-role rejected; `submit_rating` RPC only | both rate |
| MS-11 a11y/mobile | — | a11y checks | — | responsive smoke |
| MS-12 RLS/concurrency | — | — | all `04` §5 negatives | two-user E2E |
| MS-13 report & admin | admin authorization | report form | report RPC roles; composite list cursor; non-admin denial; trusted account deletion; outbox claim/ack/fail isolation; rate-limit policies inaccessible | report → admin review/resolve E2E |

## 5. Critical security & concurrency tests (explicit)

- **Simultaneous acceptance:** two clients call `accept_delivery` on the same `open` request concurrently → exactly one `accepted`, the other `ALREADY_ACCEPTED`; `delivery_requests.deliverer_id` is a single non-null user; `no_self_delivery` constraint holds.
- **Unauthorized message access:** user C (not participant) cannot `SELECT` messages of request A/B and cannot `INSERT` a message into it (RLS `msg_no_client_insert` + `msg_select_participant`). Assert empty/403.
- **Self-accept forbidden:** requester calling `accept_delivery` → `SELF_ACCEPT_FORBIDDEN`.
- **Invalid transition:** direct client `UPDATE status` → rejected by `dr_no_client_update`; calling `advance_delivery(open→delivered)` → `INVALID_TRANSITION`.
- **PII leakage:** `SELECT phone, student_id FROM profiles` by authenticated user → denied; only `public_profiles` columns returned.
- **Rating abuse:** second rating same (request,rater,role) → `RATING_ALREADY_EXISTS`; rating self → rejected; rating before `delivered` → `RATING_NOT_ALLOWED`; wrong role → `RATING_NOT_ALLOWED`.
- **Realtime recovery:** with socket paused, insert messages, resume → client backfill recovers all, dedup yields no duplicates, order is `(created_at,id)`.
- **Composite cursor:** backfill query uses `(created_at, id) > (last_created_at, last_id)`; UUID-only cursor `id > lastSeenId` is **not** used for chronological pagination.
- **Profile RPC security:** unauthenticated caller → `UNAUTHENTICATED`; caller supplying `is_verified=true` in `create_profile` → field ignored/server-overridden (`is_verified` never accepts client values); caller attempting `update_profile` on `is_verified`/`is_suspended`/`student_id`/`admin_roles` → field ignored/rejected.
- **Create request RPC security:** unverified caller → `NOT_VERIFIED`; suspended caller → `SUSPENDED`; caller supplying `requester_id` ≠ self → rejected; caller supplying `status='delivered'` → rejected; raw client INSERT into `delivery_requests` → blocked by RLS.
- **Report RPC security:** non-participant caller → `REPORT_NOT_ALLOWED`; verified viewer reporting a visible open request → allowed; caller-supplied reporter identity rejected; non-admin report read → empty/403.
- **Admin operations & MS-13:** non-admin list/get/resolve/suspend/cancel calls → `ADMIN_REQUIRED`; report listing uses both `(created_at,id)` cursor fields and neither skips nor duplicates equal-timestamp rows; direct `admin_roles` mutation is denied.
- **Admin notification outbox:** two workers claim concurrently → disjoint rows; stale worker token cannot ack/fail a reclaimed row; duplicate producer key creates one row; failure schedules backoff and reaches terminal state exactly at `max_attempts`; stale lease is reclaimed; anon/authenticated cannot execute worker functions.
- **Rate-limit hardening:** authenticated user cannot call `check_rate_limit`; cannot read/write policies; concurrent calls enforce the threshold; expired cleanup is scoped to the same actor/operation; the inserted event uses the captured operation timestamp.
- **Deletion/anonymization:** non-admin `authorize_admin_user_deletion` fails; active-delivery preflight and trigger both reject; successful Auth Admin deletion clears all PII through `handle_auth_user_before_delete`, removes the Auth user, preserves the profile UUID, excludes it from `public_profiles`, writes no old PII to audit metadata, and prevents profile recreation with an old token.
- **SECURITY DEFINER hardening tests:**
  - Unauthenticated callers cannot execute any client-callable privileged RPC; service-only and trigger-only functions have no API-role grant.
  - Unauthorized caller (e.g., non-admin on `admin_suspend_user`) cannot execute privileged behavior (`ADMIN_REQUIRED`).
  - `search_path` is empty/safe for each function (query `pg_proc.proconfig`).
  - Function owner is least-privileged (query `pg_proc.proowner`).
  - `REVOKE EXECUTE FROM PUBLIC` is in effect (query `pg_catalog.pg_default_acl` or `information_schema.role_routine_grants`).

## 6. CI gate (`09`)

On every PR: `tsc --noEmit` → Vitest (unit/component/integration/RLS/concurrency/realtime) → Playwright (two-user E2E). Any failure blocks merge. No merge with skipped security tests.

## 7. Cross-references

- Features under test: `01-product-requirements.md`.
- Schema/RPCs tested: `03`, `05`.
- Threats covered: `04-security-and-threat-model.md` §5.
- Realtime tests: `06-realtime-design.md` §4–§5.
- Task→test mapping: `08-implementation-roadmap.md`.
