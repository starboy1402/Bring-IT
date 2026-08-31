# 08 — Implementation Roadmap

**Authoritative for:** task breakdown, **dependency ordering**, **critical path**, milestone definition, and task→feature→test mapping.
**Status:** Proposed. **No calendar estimates are used** (see §2); ordering only.

## 1. Status rule

Every task below is **planned, not started**. None is marked complete. Completion requires its acceptance criteria + required tests green in CI (`07` §6).

## 2. On estimates

This roadmap uses **dependency order**, not weeks. The earlier plans assigned "Weeks 1–12" with no stated team size/velocity assumption; those are removed. If the team later supplies velocity + headcount, durations can be derived, but they are **not** invented here.

## 3. Tasks (MVP = Milestone 1)

Legend: 🔴 = critical path. `dep:` lists prerequisite task IDs.

### Foundation
- **T-F1** Repo + Vite + React 19 + TS + Tailwind v4 + RR v7 scaffold. `dep: none`. 🔴
  - AC: app builds; `tsc --noEmit` clean; base layout + theme render.
  - Tests: smoke render (Vitest/RTL).
- **T-F2** Supabase client + env config (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); CI secret-scan to block service-role key in client (`04` T8). `dep: T-F1`. 🔴
  - AC: client initializes; no `service_role`/`SUPABASE_KEY` secret in bundle (CI check).
  - Tests: build-only / secret-scan gate.

### Database & security (critical path root)
- **T-D1** Create schema: enums, `profiles`, `delivery_requests`, `delivery_events`, `messages`, `ratings`, `reports`, `admin_roles`, `audit_log`, `rate_limit_events`, `rate_limit_policies`, `notification_outbox`, `public_profiles` view (`03` §2–§3, §6). `dep: T-F2`. 🔴
  - AC: migrations apply on local Supabase; types correct (`timestamptz`, `numeric`, `uuid`); partial index exists.
  - Tests: migration applies; constraint violations rejected (unit/integration).
- **T-D2** RLS policies (`03` §6) + `is_participant()`, `has_admin_role()`, `get_own_admin_role()`, `check_rate_limit()` + `public_profiles` grant + `rate_limit_policies` REVOKE ALL. `dep: T-D1`. 🔴
  - AC: all tables RLS-enabled; client cannot SELECT base `profiles` PII or UPDATE requests; admin checks via SECURITY DEFINER only.
  - Tests: **all `04` §5 negative cases** + `07` §5 security tests.
- **T-D3** State-machine RPCs: `accept_delivery`, `advance_delivery`, `cancel_delivery`, `submit_rating`, `send_message` (rate-limited) (`05`). `dep: T-D1,T-D2`. 🔴
  - AC: transitions enforced; row lock; rejects invalid actor/transition; self-accept blocked.
  - Tests: integration + **concurrency simultaneous-accept** + invalid-transition + rating-uniqueness (`07` §5).
- **T-D4** Profile & request RPCs: `create_profile`, `update_profile`, `get_own_private_profile`, `create_request` (verified, non-suspended, rate-limited) (`05`). `dep: T-D1,T-D2`. 🔴
  - AC: profile fields restricted to approved set; `create_request` enforces `requester_id` derived from caller, `status='open'`, `deliverer_id=NULL`; raw INSERT blocked.
  - Tests: integration profile CRUD; `create_request` preconditions + rate-limit + raw-INSERT-blocked (`07` §5).
- **T-D5** Report/admin operations: report/contact RPCs, `authorize_admin_user_deletion`, the trusted `admin_delete_or_anonymize_user` Edge Function, and the Auth `BEFORE DELETE` trigger (`05`, `03` §8). `dep: T-D1,T-D2,T-D3,T-A1`. 🔴
  - AC: report reads/actions enforce role hierarchy; contact access is participant/status-gated; account deletion uses Auth Admin server-side and the `BEFORE DELETE` trigger; no deleted PII is copied into audit metadata.
  - Tests: report submission/list/get/resolve; non-admin denial; composite report cursor; active-delivery deletion rollback; Auth row removed; profile anonymized; old token cannot recreate a profile.
- **T-D6** Notification mechanism: `notification_outbox` plus service-only `claim_notification_outbox`, `ack_notification_outbox`, and `fail_notification_outbox`, consumed by the scheduled `process-notification-outbox` Edge Function (`03` §3.10). `dep: T-D1,T-D2,T-F2`.
  - AC: transactional enqueue; `FOR UPDATE SKIP LOCKED` claim; at-least-once delivery with provider idempotency key; retry/backoff, stale-lease recovery, and terminal failure monitoring.
  - Tests: two-worker claim isolation; acknowledge/fail ownership; duplicate producer key; crash recovery; retry exhaustion; anon/authenticated execute denial.

### Auth & profile
- **T-A1** Supabase Auth signup/login/logout; session in `AuthContext`. `dep: T-F2`. 🔴
  - AC: verified users can authenticate; route guards UX-only.
  - Tests: component login/logout; integration unverified-blocked (partial, needs T-A2 flag).
- **T-A2** Student verification flow (ADR-0003): defines the trusted server-side path that sets `profiles.is_verified = true`. The exact mechanism depends on Q1 (e.g., email-domain hook, SSO). `dep: T-A1,T-D1,T-A3`. 🔴
  - AC: unverified users are blocked from MS-3–MS-10 and user-initiated MS-13 actions; `is_verified` is set only through the approved trusted path; `create_profile` always starts false.
  - Tests: integration `NOT_VERIFIED` for unverified; verified can proceed.
- **T-A3** Privacy-safe profile onboarding (MS-2): `create_profile` RPC creates the profile with `is_verified=false`; `student_id`/`phone` captured private. `dep: T-A1,T-D1,T-D4`.
  - AC: required fields validated; PII not in `public_profiles`.
  - Tests: component form; `public_profiles` column check; verify `is_verified=false` on creation; verify `student_id` immutable after creation.

### Core delivery flow (critical path)
- **T-C1** Create request (MS-3): form + `create_request` RPC. `dep: T-A2,T-D4`. 🔴
  - AC: status `open`; invalid input rejected client+DB; verified non-suspended only.
  - Tests: component validation; integration RPC-only create; direct INSERT blocked.
- **T-C2** Browse open requests (MS-4): list + filter/sort + keyset pagination. `dep: T-C1`. 🔴
  - AC: only `open` visible to verified, non-suspended users; non-`open` hidden from non-participants.
  - Tests: component list/empty; RLS hidden-state; unverified/suspended blocked.
- **T-C3** Atomic accept (MS-5) + status UI (MS-6/MS-7). `dep: T-C2,T-D3`. 🔴
  - AC: one acceptor; self-accept blocked; history renders.
  - Tests: concurrency accept; component gating; history view.
- **T-C4** Advance/complete (MS-6/MS-9) via RPCs. `dep: T-C3`. 🔴
  - AC: only deliverer advances/completes; invalid rejected.
  - Tests: integration transitions; E2E lifecycle.
- **T-C5** Cancellation rules (MS-6, `04` §6.3). `dep: T-C3`. 
  - AC: requester cancels pre-`in_progress`; deliverer cancels pre-`in_progress`; post-`in_progress` blocked.
  - Tests: integration cancel rules.

### Chat & rating
- **T-R1** Participant chat (MS-8) + realtime (MS-8, `06`). `dep: T-C3,T-D3`. 🔴
  - AC: messages persist; only participants read/write; dedup/ordering/recovery; composite cursor.
  - Tests: unauthorized message access; realtime dedup/recovery/composite-cursor (`07` §5).
- **T-R2** Bilateral rating (MS-10). `dep: T-C4`. 
  - AC: both rate once post-`delivered`; duplicate/self/wrong-role rejected.
  - Tests: rating-uniqueness; E2E both-rate.

### Quality & release-readiness
- **T-Q1** Accessibility & mobile (MS-11). `dep: T-C1,T-R1`. 
  - AC: keyboard nav, labels, contrast, responsive.
  - Tests: a11y component checks; responsive E2E smoke.
- **T-Q2** Two-user E2E golden path (MS-12): signup→create→accept→lifecycle→chat→rate, **two browser contexts**. `dep: T-R2,T-Q1`. 🔴
  - AC: full flow passes with two separate authenticated users.
  - Tests: Playwright two-context E2E.
- **T-Q3** CI gate + RLS/concurrency/realtime suites green (`07` §6, `09`). `dep: all`. 🔴

## 4. Dependency graph (critical path)

```text
T-F1 → T-F2
T-F2 → T-A1
T-F2 → T-D1 → T-D2
T-D2 → T-D3
T-D2 → T-D4
T-D2 + T-F2 → T-D6
T-A1 + T-D4 → T-A3 → T-A2
T-A2 + T-D4 → T-C1 → T-C2
T-C2 + T-D3 → T-C3
T-C3 + T-D3 → T-C4, T-C5, T-R1
T-C4 → T-R2
T-C1 + T-R1 → T-Q1
T-R2 + T-Q1 → T-Q2 → T-Q3
T-D1 + T-D2 + T-D3 + T-A1 → T-D5
all MVP tasks → T-Q3
```

The dependency-critical route to the golden-path E2E has two parallel prerequisites—database transitions (`T-D3`) and auth/profile/request creation (`T-A1`, `T-D4`, `T-A3`, `T-A2`, `T-C1`, `T-C2`)—that converge at `T-C3`. A single duration-based critical path is not claimed until tasks are estimated.

> **Lifecycle note:** Profile creation (T-A3) precedes verification (T-A2) because `profiles.is_verified` requires an existing profile row. Verification runs only after onboarding completes and sets `is_verified` via a trusted server-side path (Q1 — email-domain hook or SSO). `create_profile` always creates with `is_verified=false`.

## 5. Milestone definition

**Milestone 1 (MVP) = all T-F*, T-D*, T-A*, T-C*, T-R*, T-Q* above.** Ships: verified auth, private profile, create/browse, atomic accept, DB state machine, history, participant chat, completion, bilateral rating, a11y/mobile, full test baseline, minimal report/admin resolution. **Excludes** everything in `01` §3 (matching, leaderboard, presence, animations, push, photos, payments, disputes console).

Post-MVP milestones (separate plans, depend on Milestone 1 + open-question resolutions):
- PM-2: Matching & traveler availability (ADR-0006).
- PM-3: Reputation/leaderboard (ADR-0007).
- PM-4: Trust & safety console (report/block/dispute admin — `04` §6).
- PM-5: Realtime presence, push, proof-of-delivery photos.

> **Naming note:** post-MVP milestones are prefixed `PM-` to avoid confusion with MVP feature tags `MS-1` … `MS-13`.

## 6. Traceability matrix

| Requirement (01) | ADR | Schema / Table (03) | API / RPC (05) | Roadmap task (08) | Required tests (07) |
| --- | --- | --- | --- | --- | --- |
| MS-1 Verified auth | 0003 | profiles | — | T-A1, T-A3, T-A2 | signup/login guard, profile created with is_verified=false, RLS unverified blocked, two-user signup, verified can proceed |
| MS-2 Private profile | 0003 | profiles, public_profiles | create_profile, update_profile, get_own_private_profile | T-A3 | onboarding form, `public_profiles` hides PII, profile RPC field restrictions |
| MS-3 Create request | 0004 | delivery_requests | create_request | T-C1, T-D4 | create form, integration RPC-only create, direct INSERT blocked |
| MS-4 Browse open | — | delivery_requests | — | T-C2 | list/empty/filter, non-`open` hidden, unverified/suspended blocked, keyset pagination |
| MS-5 Atomic accept | 0004 | delivery_requests | accept_delivery | T-C3, T-D3 | accept button gating, concurrency `ALREADY_ACCEPTED`, E2E deliverer accepts |
| MS-6 DB state machine | 0004 | delivery_requests, delivery_events | accept_delivery, advance_delivery, cancel_delivery | T-C3, T-C4, T-C5, T-D3 | transition rules, status UI, invalid transition rejected, E2E lifecycle |
| MS-7 Status history | 0004 | delivery_events | — | T-C3 | history view, events written, visible to both |
| MS-8 Participant chat | 0005 | messages | send_message | T-R1, T-D3 | chat UI, non-participant blocked, dedup/ordering/recovery, composite cursor, E2E two-user chat |
| MS-9 Completion | 0004 | delivery_requests | advance_delivery('delivered') | T-C4 | mark-delivered, `delivered` only by deliverer, E2E complete |
| MS-10 Bilateral rating | 0007 | ratings | submit_rating | T-R2, T-D3 | rating form, duplicate/self/wrong-role rejected, E2E both-rate |
| MS-11 A11y/mobile | 0002 | — | — | T-Q1 | a11y checks, responsive smoke |
| MS-12 Security & test baseline | — | all tables | all RPCs | T-Q2, T-Q3 | all `04` §5 negatives, concurrency, realtime, two-user E2E, CI gate |
| MS-13 Report/admin | — | reports, admin_roles, audit_log, notification_outbox | report/admin RPCs; scheduled notification Edge Function | T-D5, T-D6 | composite report pagination, admin authorization, contact negative tests, two-worker outbox tests |
| Retention/deletion | — | auth.users, profiles, historical tables | trusted `admin_delete_or_anonymize_user` Edge Function + `BEFORE DELETE` trigger | T-D5 | Auth user removed, PII cleared, UUID preserved, active-delivery rollback, old-token denial |

## 7. Recommended first implementation milestone

**Start with T-F1 → T-F2 → T-D1 → T-D2, then implement T-D3 and T-D4 in parallel.** This establishes schema/RLS before state transitions and profile/request operations. In parallel, T-A1 can begin after T-F2; T-A1 plus T-D4 unlock T-A3, then T-A2. Validate each branch with the `07` §5 security and concurrency tests before building dependent UI.

## 8. Cross-references

- Features: `01-product-requirements.md`.
- Schema/RPCs: `03`, `05`.
- Tests: `07-testing-strategy.md`.
- CI/release: `09-release-and-operations.md`.
- Deferrals: ADR-0006, ADR-0007.
