# 10 — Open Questions, Assumptions & Contradictions

**Authoritative for:** unresolved decisions, stated assumptions, and the contradictions log (where earlier plans disagreed, and how this package resolves them).
**Status:** Proposed. Items tagged **[APPROVAL]** block launch until a human decides.

## 1. Open questions requiring human approval

| ID | Question | Impact if unresolved | Proposed recommendation | Launch block level |
| --- | --- | --- | --- | --- |
| Q1 **[APPROVAL]** | **Student verification method.** What constitutes "verified CUET student"? | Blocks MS-1 (auth gate). | Enforce CUET institutional email domain at signup + email confirmation; `student_id` self-asserted but private (not proof). See ADR-0003. | **Blocks implementation** |
| Q2 **[APPROVAL]** | **Admin authorization model.** Approve the proposed `admin_roles` table, initial admin identities, and initial provisioning owner? | Blocks trust/safety ops (`04` §6.9, MS-13). | Separate `admin_roles` table; seed 1–2 owners via migration by project owner. | **Blocks implementation** |
| Q3 **[APPROVAL]** | Data retention window (proposed 12 months post-completion, then anonymize). | Affects `03` §8 deletion design; legal/compliance risk. | Adopt proposed; legal/student-body review. | **Blocks staging** |
| Q4 **[APPROVAL]** | Who provisions staging/prod Supabase + Vercel projects, and owns keys? | Blocks `09` environments. | Project owner / CUET faculty sponsor. | **Blocks staging** |
| Q5 **[APPROVAL]** | Is peer **blocking** required for MVP, or is report+suspend enough? | Affects MVP scope (`04` §6.2, MS-13). | Defer block to PM-4; report+suspend for MVP. | **Can safely remain deferred** |
| Q6 **[APPROVAL]** | Rate-limit thresholds (messages/min, requests/day, reports/day). | Affects `send_message`/`create_request`/`submit_report` RPC security. | Start conservative (e.g. 1 msg/2s/request, 10 req/day, 5 reports/day) then tune. | **Blocks production launch** |
| Q7 **[APPROVAL]** | Is `hall` public or participant-only? | Affects `03` §5 visibility. | Public (campus community feel) — confirm. | **Can safely remain deferred** (default public) |
| Q8 **[APPROVAL]** | Should `phone` be revealed at `accepted` or only `in_progress`? | Affects RLS function and privacy boundary. | Reveal at `accepted` (needed to coordinate). | **Blocks implementation** |
| Q9 **[APPROVAL]** | Should full pickup/dropoff details be visible to every verified user for `open` requests, or should browsing expose only coarse locations? | Affects `03` §5, `04` privacy rules. | Full exact text visible to verified, non-suspended users for `open` requests; participant-only after acceptance. | **Blocks implementation** |
| Q10 **[APPROVAL]** | Should public rating averages be exposed in MVP, or kept participant-only? | Affects `03` §9, `04` §6.5, MS-10. | Keep participant-only for MVP (Option A). If later approved, use SECURITY DEFINER function with minimum-count privacy. | **Blocks production launch** |
| Q11 **[APPROVAL]** | What is the exact initial admin provisioning process, and who can grant/revoke admin access in production? | Affects MS-13, `04` §6.9. | Project owner seeds initial admins via migration; later grants via dedicated admin RPC (not in MVP). | **Blocks production launch** |
| Q12 **[APPROVAL]** | What is the completion confirmation model — how does the requester confirm delivery was received correctly? | Affects MS-9 trust and future proof-of-delivery features. | MVP: deliverer marks `delivered`; requester is prompted to rate (soft confirmation). Explicit "confirm received" UI is a safe default MVP behavior if desired. Proof-of-delivery photos and signed confirmation deferred. | **Can safely remain deferred** (default: deliverer marks complete; rating acts as soft confirmation) |

### Launch-block classification

| Level | Meaning | Items |
| --- | --- | --- |
| **Blocks implementation** | Cannot write code/schema until decided | Q1, Q2, Q8, Q9 |
| **Blocks staging** | Cannot deploy to staging until decided | Q3, Q4 |
| **Blocks production launch** | Can develop/stage but cannot launch without decision | Q6, Q10, Q11 |
| **Can safely remain deferred** | Default path is safe; decision is preference, not risk | Q5, Q7, Q12 |

> **Approval count wording:** 4 approvals required before implementation; 2 additional approvals before staging; 3 additional approvals before production; 3 may remain deferred under documented safe defaults.

## 2. Stated assumptions (explicit, not silently invented)

- A1: CUET issues institutional email addresses usable for signup verification (underpins Q1/ADR-0003).
- A2: Launch scale is low concurrency; Supabase free/low tier is sufficient for MVP.
- A3: No real-money handling; reward is suggested/out-of-band.
- A4: Web-responsive (no native app) satisfies MVP mobile need.
- A5: One Supabase project (single tenant); no multi-tenant isolation needed.
- A6: Team has, or will obtain, Supabase CLI for local testing (`07`).
- A7: Profile identity is permanent and separate from auth identity; deleted-auth profiles persist as distinct pseudonymous records (underpins `03` §8 anonymization).
- A8: `admin_roles` table is created via migration reviewed by project owner; no client RPC creates initial admins (underpins Q2).

## 3. Contradictions log (earlier plans → resolution here)

| # | Contradiction in source docs | Resolution |
| --- | --- | --- |
| C1 | `PLAN.md`/`DEVELOPER_TASK_PLAN.md` put **leaderboard + matching** in MVP; brief says defer. | Deferred to post-MVP (ADR-0006, ADR-0007; `01` §3). |
| C2 | `.kilo/plans` + `gemini` duplicate mutable `status` on both `delivery_requests` and `deliveries`. | Single source of truth = `delivery_requests.status`; `deliveries` removed; history → `delivery_events` (`03` §1, ADR-0004). |
| C3 | `gemini`/`kilo` mark ADRs **Accepted** with no approval evidence. | All reset to **Proposed** (`README`, `../adr/README.md`). |
| C4 | `gemini` RLS: `profiles SELECT USING(true)` leaks `phone`/`student_id`. | Base `profiles` not client-readable; `public_profiles` view exposes only public columns (`03` §6, `04` T5). |
| C5 | `gemini`/`kilo` `messages INSERT` only checks `sender_id=auth.uid()`, allowing injection into any request. | All client writes go through `send_message` RPC; client INSERT blocked (`03` §6, `04` T2, `05` §3.8). |
| C6 | `kilo` allows client `UPDATE` on `delivery_requests` (owner). | All transitions via RPCs; client `UPDATE/DELETE` blocked (`03` §6, ADR-0004). |
| C7 | `gemini` realtime uses per-request public channels (`chat_room_{id}`). | Subscribe only to authorized `request_id` via Postgres Changes; RLS prevents leaking private requests (`06` §2–§3, `04` T9). |
| C8 | `kilo` uses `FLOAT` for reward and `TIMESTAMP` (no tz). | `numeric(10,2)` + `timestamptz` (`03` §3). |
| C9 | `gemini` proposes React Query/Vaul/Sonner/Framer Motion as de-facto. | Proposed add-ons, not approved; rejected/deferred for MVP (ADR-0002, `02` §4). |
| C10 | `kilo` "matching runs as Edge Function" while matching is in MVP. | Matching out of MVP; if later built, runs as RPC/function (ADR-0006). |
| C11 | No rating model (bilateral/uniqueness) defined anywhere. | Added `ratings` with `(request,rater,role)` uniqueness (`03` §3.5, `05`, ADR-0007). |
| C12 | No cancellation-after-`in_progress` policy; no self-accept prevention. | Defined in ADR-0004 + `05` (cancel rules, `SELF_ACCEPT_FORBIDDEN`, `no_self_delivery`). |
| C13 | Realtime cursor uses `id > lastSeenId` for UUID `messages.id`, which is not chronological. | Fixed to composite cursor `(created_at, id) > (last_created_at, last_id)` with matching index (`03` §3.4, `06` §4). |
| C14 | Phone visible during `delivered` indefinitely; privacy boundary unclear. | Fixed: phone visible only during `accepted` or `in_progress`; hidden after `delivered`/`cancelled` (`03` §5, `05` §3.11). |
| C15 | Admin model ambiguous (flag on profile vs separate table); self-promotion risk not addressed. | Resolved: separate `admin_roles` table; profile RPCs cannot modify it; client has no grant (`03` §3.7, `03` §6). |
| C16 | Public rating averages exposed without minimum-count privacy or safe aggregate design. | Resolved: no public averages in MVP (Option A). If later approved, SECURITY DEFINER function with minimum-count privacy (`03` §9). |
| C17 | Deletion design contradictory (nullable vs RESTRICT vs CASCADE); global tombstone causes `rater_id = ratee_id` violations. | Resolved: distinct pseudonymous profile per deleted user; `auth_user_id` set to NULL; PII nulled; display_name replaced with valid non-identifying value; historical relationships preserved (`03` §8). |
| C18 | Recursive RLS on admin_roles leaks role information. | Resolved: no client SELECT on admin_roles; admin checks only via `has_admin_role()` SECURITY DEFINER function with fixed search_path (`03` §6). |
| C19 | Rate limiting described as "application-side gate" which is bypassable. | Resolved: protected RPCs call an internal database helper backed by server-owned policies; API roles cannot invoke or modify it. |
| C20 | Report resolution contract incomplete; no constrained status type. | Resolved: `report_status` enum; `admin_resolve_report` with outcome, resolution, resolved_by, resolved_at (`03` §3.6, `05` §3.12). |
| C21 | No implementable counterpart contact-access operation. | Resolved: `get_delivery_contact` RPC with participant + status check (`05` §3.11). |
| C22 | No admin notification mechanism for reports. | Resolved: `notification_outbox` table + server-side processor (`03` §3.10, `08` T-D6). |
| C23 | Idempotency contracts disagree between summary table and individual RPC descriptions. | Resolved: unified idempotency table with consistent retry-result semantics; individual RPC descriptions now specify retry behavior (`05` §4.1). |
| C24 | MS-13 not fully traced through testing, roadmap, and release gates. | Resolved: MS-13 added to traceability matrix, critical tests, milestone definition (`08` §6). |
| C25 | `03` §4 said post-`in_progress` cancellation/admin flow is deferred, while MS-13 includes `admin_cancel_delivery`. | Resolved: `admin_cancel_delivery` is MVP (not deferred); `03` §4 updated to state admin cancellation is MVP via `admin_cancel_delivery` RPC. |
| C26 | `05` §3 claimed all RPCs lock a request row; only state-machine transition RPCs do. | Resolved: `05` §3 reworded to scope row locking to state-machine transition RPCs only. |
| C27 | `rate_limit_policies` table had no RLS / REVOKE, no cleanup mechanism, and `check_rate_limit` had an unused `window_start` variable and `operation = operation` shadowing. | Resolved: added RLS `USING(false)` + `REVOKE ALL`; added in-function cleanup; renamed param to `p_operation`; fixed variable shadowing (`v_window_start`). |
| C28 | `admin_list_reports` and `admin_get_report` claimed in changelog but absent from API. | Resolved: full contracts added in `05` §3.12 with pagination, authorization, info-disclosure rules, audit, and error codes. |
| C29 | Profile creation (T-A3) was scheduled before verification (T-A2), but verification writes `is_verified` which requires the profile to exist. | Resolved: T-A2 now depends on T-A3; verification only runs after profile creation; `create_profile` always creates with `is_verified=false`; dependency graph and critical path regenerated (`08` §4). |
| C30 | Direct `auth.users` deletion only nulls `auth_user_id` via `ON DELETE SET NULL`, leaving PII intact. | Resolved by the explicit `BEFORE DELETE` trigger in `03` §8, which clears PII before the Auth row disappears and preserves the profile UUID. |
| C31 | Rate limiter renamed its variable but still inserted undefined `window_start`; the column also represented an event timestamp, not a window boundary. | Resolved: renamed the column to `occurred_at`, captured one `v_now`, and used it consistently for cleanup, count, and insert. |
| C32 | Outbox used unsupported PostgreSQL `UPDATE ... LIMIT`, then selected every processing row rather than only rows claimed by that worker. | Resolved: service-only claim/ack/fail functions use `FOR UPDATE SKIP LOCKED`, worker tokens, stale leases, and explicit grants; a scheduled Edge Function performs external delivery. |
| C33 | Auth-delete bridge called an admin-only RPC without an admin session and no trigger DDL existed; its audit metadata copied deleted phone/name data. | Resolved: an explicit `BEFORE DELETE ON auth.users` trigger performs invariant checks/anonymization without `auth.uid()`, and stores no deleted PII. Auth Admin deletion remains server-only. |
| C34 | Report pagination ordered by `(created_at,id)` but accepted only a timestamp cursor, allowing skips/duplicates. | Resolved: `admin_list_reports` uses a two-part cursor and a single status partition per call. |
| C35 | Base `profiles` was described as unreadable but had a self-SELECT RLS policy and no explicit table revoke. | Resolved: base-table SELECT is denied and table privileges are revoked from API roles; private self-read remains RPC-only. |
| C36 | Roadmap dependency diagram omitted required convergence edges and claimed a duration-based critical path without task estimates. | Resolved: graph now lists every dependency edge and describes parallel prerequisite chains without asserting an unmeasured critical path. |
| C37 | Several retry contracts returned success for any current state or duplicate payload. | Resolved: successful retries require matching natural key, authorized actor, target state, and normalized payload; mismatches return the documented conflict. |

## 4. What this package does NOT decide

- Final verification policy (Q1) — **await human approval**.
- Admin model details (Q2) — **await human approval**.
- Retention window (Q3) — **await human approval**.
- Infra ownership (Q4) — **await human approval**.
- Rate-limit thresholds (Q6) — **await human approval**.
- Public rating averages (Q10) — **await human approval**.
- Admin grant/revoke process in production (Q11) — **await human approval**.
- Any post-MVP feature scope beyond deferral rationale.

## 5. Validation checklist (completed at end of authoring)

- [x] Internal links and document consistency validated
- [x] Contradictory requirements searched and resolved (see §3, C1–C37)
- [x] Every table has a complete RLS policy plan (`03` §6, cross-checked in `04` §5)
- [x] Every privileged operation has a SECURITY DEFINER RPC contract (`05`)
- [x] Every SECURITY DEFINER function has documented hardening rules (`03` §6, `05` §3.14)
- [x] Authoritative SQL examples statically follow the documented hardening rules; compilation/runtime proof is deferred to migration tests
- [x] No recursive RLS on admin_roles
- [x] No profiles.is_admin references in active content
- [x] No global tombstone references remain
- [x] No stale "MS-1 through MS-12" range text remains (MS-1 through MS-13)
- [x] No "application-side gate" rate limiting remains
- [x] Every MVP requirement maps to roadmap tasks + acceptance criteria + tests (`08` §6 ↔ `07` §4)
- [x] MS-13 explicitly traced through testing matrix, critical tests, milestone definition, and release gates
- [x] Report/admin requirements represented as actual MVP requirements (`01` MS-13, `08` T-D5, T-D6)
- [x] Phone/location privacy has implementable enforcement (`get_delivery_contact` RPC)
- [x] Report resolution and notification are complete
- [x] Auth/profile/verification lifecycle defined and consistent (T-A3 before T-A2)
- [x] Current audit corrections applied consistently across authoritative documents
- [x] Idempotency contracts internally consistent
- [x] Deletion/anonymization design satisfies all CHECK and FK constraints
- [x] Rate-limiting is server-enforced (not client/application-side); `rate_limit_policies` has RLS + REVOKE ALL
- [x] Admin authorization derives caller internally (no auth.uid() parameter)
- [x] Composite cursor used for UUID message IDs
- [x] SECURITY DEFINER functions never reference the service-role key
- [x] Every declared table has an access-control plan in `03` §6
- [x] Every declared RPC or trusted server operation appears in API inventory, roadmap, and tests
- [x] Dependency graph lists every explicit prerequisite and convergence edge
- [x] Notification processor is one scheduled Edge Function with service-only claim/ack/fail database functions
- [x] No `operation = operation` parameter shadowing in any SQL
- [x] `admin_role_type` schema-qualified in all function signatures and REVOKE/GRANT
- [x] No duplicate Q identifiers (Q1–Q12 unique)
- [x] No "Supersedes:" as ADR frontmatter field

Pending human review:
- [ ] Q1-Q12 approvals resolved (4 implementation + 2 staging + 3 production + 3 deferred)
- [x] Every open launch blocker tagged with level (blocks implementation/staging/production/deferred)
- [x] Deferred features not returned to MVP
- [x] File count correct: 19 files total (11 planning + 8 ADR)
- [x] Idempotency contracts internally consistent
- [x] MS-13 traced through schema, API, roadmap, tests, milestone definition
- [x] Phone/location privacy has implementable enforcement
- [x] Report resolution and notification are complete
- [x] Auth/profile/verification lifecycle defined and consistent

## 6. Cross-references

- Decisions pending approval feed ADRs: ADR-0003 (Q1), ADR-0002 (deps), ADR-0004 (cancel rules), ADR-0005 (realtime), ADR-0006 (matching), ADR-0007 (reputation).
- Retention: `03-data-model.md` §8.
- Verification: `../adr/0003-authentication-and-student-verification.md`.
- Admin model: `03-data-model.md` §3.7, `04-security-and-threat-model.md` §6.9.
  - Report/admin: `03-data-model.md` §3.6, `05-api-and-business-operations.md` §3.10–§3.13.

## 7. Final validation

Fresh static verification on 2026-09-01:

- 19 Markdown files: 11 planning + 8 ADR.
- 14 relative Markdown links checked; 0 broken.
- Q1–Q12 occur exactly once.
- 12 declared tables have 12 corresponding RLS/deny-all plans, including the post-MVP placeholder.
- All Markdown code fences are balanced.
- All seven decision ADRs contain owner, approval, cost, security, and reversibility fields.
- No application code or executable migration exists yet, so SQL compilation and runtime behavior are intentionally not marked complete.

### Files created or updated
- `docs/planning/README.md` — updated validation checklist, MS-13 references, approval-count wording, verdict
- `docs/planning/01-product-requirements.md` — removed is_admin; fixed MS-4 (verified/non-suspended browse), MS-10 (no public averages), MS-13; Q12 added (completion confirmation)
- `docs/planning/02-system-architecture.md` — reviewed, no structural changes required
- `docs/planning/03-data-model.md` — corrected rate-event timestamps; secured policy/outbox tables; replaced invalid outbox SQL with service-only claim/ack/fail functions; denied base-profile access; and replaced the auth-delete bridge with an explicit PII-safe `BEFORE DELETE` trigger.
- `docs/planning/04-security-and-threat-model.md` — removed is_admin; added T13-T15 threats; fixed rate-limit design; added `rate_limit_policies` to RLS coverage matrix; fixed public rating visibility; fixed service-role wording; added report/admin RPC contracts including admin_list_reports/admin_get_report; added rate-limit hardening test for check_rate_limit + rate_limit_policies
- `docs/planning/05-api-and-business-operations.md` — added composite report pagination, exact retry semantics, trusted-server operation boundaries, account-deletion preflight, and corrected error behavior.
- `docs/planning/06-realtime-design.md` — fixed composite cursor; added status recovery contract
- `docs/planning/07-testing-strategy.md` — added two-worker outbox, composite-cursor, Auth deletion, old-token, and PII-free audit tests.
- `docs/planning/08-implementation-roadmap.md` — replaced the inaccurate critical-path diagram with explicit dependency edges and propagated server operations.
- `docs/planning/09-release-and-operations.md` — added outbox and Auth deletion monitoring/release gates.
- `docs/planning/10-open-questions.md` — records corrections C1–C37 and retains the twelve unique approval questions.
- `docs/adr/README.md` — reviewed governance fields
- `docs/adr/0001-backend-platform.md` — fixed ADR metadata (replaced "Supersedes:" with "Legacy proposal replaced")
- `docs/adr/0002-frontend-stack.md` — fixed ADR metadata
- `docs/adr/0003-authentication-and-student-verification.md` — fixed ADR metadata; updated Q2/Q9 wording; added approval conditions
- `docs/adr/0004-delivery-state-machine.md` — fixed ADR metadata
- `docs/adr/0005-realtime-and-chat.md` — fixed ADR metadata; added Approval conditions section
- `docs/adr/0006-matching-scope.md` — fixed ADR metadata
- `docs/adr/0007-reputation-and-leaderboard.md` — fixed ADR metadata

### Corrections made
1. **Replaced invalid global tombstone design:** distinct pseudonymous profile per deleted user; `auth_user_id` set to NULL; PII nulled; display_name replaced with valid non-identifying value; historical relationships preserved.
2. **Removed profiles.is_admin completely:** from schema, visibility matrix, RPC contracts, tests, product requirements, open questions, ADRs, contradiction logs. Q2 rewritten as admin_roles approval.
3. **Fixed recursive RLS on admin_roles:** no client SELECT; admin checks only via `has_admin_role()` SECURITY DEFINER function.
4. **Hardened is_participant SQL:** fixed search_path, schema-qualified references, auth.uid() non-null check, REVOKE FROM PUBLIC, explicit grants.
5. **Resolved auth/profile/verification lifecycle:** documented complete lifecycle; T-A3 depends on T-D4; verification depends on profile creation.
6. **Defined get_delivery_contact operation:** participant + status check; returns counterpart contact only during accepted/in_progress.
7. **Resolved exact-location visibility:** verified, non-suspended users browse open requests; exact locations participant-only after acceptance.
8. **Defined server-enforced rate-limit design:** protected RPCs call the internal `check_rate_limit()` helper; clients cannot execute it or change policies.
9. **Completed reports model:** `report_status` enum; `admin_resolve_report` with outcome, resolution, resolved_by, resolved_at.
10. **Made report submission match product requirement:** verified users can report open requests they can view; participants can report counterparts; self-reporting rejected.
11. **Defined admin-notification mechanism:** a scheduled Edge Function consumes service-only claim/ack/fail functions with leases, retries, and provider idempotency.
12. **Resolved public-rating visibility:** no public averages in MVP; individual ratings visible only to participants and ratee.
13. **Made idempotency contracts internally consistent:** unified table with consistent retry-result semantics.
14. **Repaired MS-13 traceability:** added to traceability matrix, critical tests, milestone definition.
15. **Fixed roadmap dependencies and critical path:** T-A3 depends on T-D4; T-D5 depends on admin helper/RLS; T-D6 added; dependency graph regenerated.
16. **Corrected ADR governance:** added Approval conditions to ADR-0005; reviewed all ADRs for required fields.
17. **Corrected approval-count wording:** 4 before implementation, 2 additional before staging, 3 additional before production, 3 safely deferred.
18. **Re-ran validation honestly:** verified file count; searched for stale references; confirmed all corrections applied.
19. **Secured rate limits:** fixed the event timestamp insert, scoped cleanup, denied policy/helper access to API roles, and added concurrency tests.
20. **Added `admin_list_reports`/`admin_get_report` RPC contracts:** full contracts with keyset pagination, moderator+ authorization, info-disclosure rules, `REPORT_NOT_FOUND` error, audit behavior, idempotency, and SECURITY DEFINER hardening.
21. **Fixed profile/verification lifecycle:** T-A2 now depends on T-A3 (verification after profile creation); `create_profile` always creates with `is_verified=false`; dependency graph and critical path regenerated.
22. **Fixed Auth deletion/anonymization:** Auth Admin deletion is server-only; an explicit trigger clears PII without an admin session and without copying PII to audit metadata.
23. **Finalized notification_outbox:** PostgreSQL-valid atomic claiming, worker ownership, at-least-once semantics, retry exhaustion, crash recovery, and monitoring are specified.
24. **Made idempotency contracts exact:** only matching actor/target/payload retries succeed; duplicate or later-state mismatches return conflicts.
25. **Fixed Q12 duplication:** removed duplicate row; recalculated approval counts.
26. **Fixed ADR-0003 Q2 contradiction:** removed "Q2 resolved" claim; clarified Q2 admin model is chosen but pending approval.
27. **Fixed cross-document contradictions:** `03` §4 admin_cancel_delivery is MVP (not deferred); `05` §3 row-locking scoped to state-machine RPCs only; `admin_role_type` schema-qualified in `has_admin_role()`/`get_own_admin_role()` and REVOKE/GRANT.

### Remaining technical blockers
- No known static cross-document blocker remains after the current audit. This is still a planning package: SQL compilation, migration application, RLS behavior, concurrency, Auth-trigger behavior, and Edge Function integration are release-gated implementation tests, not completed facts.

### Human approvals grouped

**Before implementation (4):**
- Q1: Student verification method
- Q2: Admin authorization model (admin_roles, initial admins, provisioning owner)
- Q8: Phone visibility timing (accepted vs in_progress)
- Q9: Exact-location visibility (full text vs coarse labels)

**Before staging (2 additional):**
- Q3: Data retention window
- Q4: Staging/production ownership

**Before production (3 additional):**
- Q6: Rate-limit thresholds
- Q10: Public rating averages
- Q11: Admin grant/revoke in production

**Safely deferred (3):**
- Q5: Peer blocking
- Q7: Hall visibility
- Q12: Completion confirmation model

### Final file count
- 19 files total
- 11 files in `docs/planning/`
- 8 files in `docs/adr/`

### Verdict
**NOT READY** — Q1, Q2, Q8, and Q9 require human approval before implementation. Static planning checks are documented below; executable behavior remains subject to the mandatory implementation tests in `07`.
