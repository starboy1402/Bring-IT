# 01 — Product Requirements

**Authoritative for:** MVP scope, must-have vs post-MVP feature classification, product-level acceptance criteria.
**Status:** Proposed. Requires human approval of `10-open-questions.md` (verification method, retention numbers, admin model).

## 1. Problem & users

CUET students frequently need small items moved across campus (food, documents, medicine, parcels between halls/departments/gates). Other students already travel those routes. BringIt connects **requesters** (need an item delivered) with **deliverers** (already traveling) inside a trusted, student-only network.

| Persona | Goal | Primary pain |
| --- | --- | --- |
| Requester | Get a small item delivered cheaply & safely | No trusted, low-cost campus courier |
| Deliverer | Earn reputation / help while already moving | No structured way to offer spare capacity |
| Admin / Moderator | Keep the platform safe | Misuse, disputes, prohibited items |

## 2. MVP scope (must-have)

These are the **only** features in Milestone 1. Each maps to roadmap tasks in `08` and tests in `07`.

| # | MVP feature | Acceptance criteria |
| --- | --- | --- |
| MS-1 | **Verified student authentication** | Signup/login restricted to CUET identity evidence (see ADR-0003). Unverified users cannot create requests or accept. |
| MS-2 | **Privacy-safe profile onboarding** | On first login, user completes profile with display name, department, hall. `student_id` and `phone` captured but treated as private (never public). See `03` §5 visibility tiers. Profile fields may only be updated through approved RPCs; `is_verified`, `is_suspended`, and `student_id` cannot be changed by the user. |
| MS-3 | **Create delivery request** | Authenticated, verified, non-suspended user creates a request with title, description, pickup, dropoff, urgency, suggested reward (NUMERIC). Status starts `open`. `requester_id` always equals caller; `deliverer_id` starts NULL. Enforced by `create_request` RPC. |
| MS-4 | **Browse open requests** | Verified, non-suspended users list `open` requests, filterable by urgency and sortable by newest. Pickup/dropoff labels are exposed for browsing. Once `accepted`, the request becomes participant-only and exact locations are hidden from non-participants. No ranking/scoring (see ADR-0006). |
| MS-5 | **Atomic request acceptance** | Exactly one deliverer can accept an `open` request; the same user cannot be both requester and deliverer; acceptance is concurrency-safe (see ADR-0004). |
| MS-6 | **Database-enforced delivery lifecycle** | Transitions `open → accepted → in_progress → delivered` plus cancellation, enforced by PostgreSQL RPCs (no client PATCH). See ADR-0004, `05`. |
| MS-7 | **Status history** | Every transition is recorded in an append-only `delivery_events` log visible to participants. |
| MS-8 | **Participant-only persisted chat** | Messages persist in DB; readable/writable only by the two participants of a delivery. See `04`, `06`. Composite cursor `(created_at, id)` used for pagination/recovery; UUID alone is not a chronological cursor. |
| MS-9 | **Delivery completion** | Deliverer marks `delivered`; explicit completion (proof-of-delivery photo deferred, see `04` §Trust). |
| MS-10 | **Minimal bilateral rating** | After completion, both parties can rate each other once, with role context. No points/leaderboard. See ADR-0007. Individual ratings are visible only to participants and to the ratee. Public averages are **not** exposed in MVP (see `03` §9). |
| MS-11 | **Mobile-responsive, accessible core UI** | Core flows usable on mobile, keyboard-navigable, labeled inputs, sufficient contrast. No animation library required. |
| MS-12 | **Security & test baseline** | RLS on every table, concurrency test for simultaneous acceptance, two-user E2E, RLS negative tests, SECURITY DEFINER hardening tests. See `04`, `07`. |
| MS-13 | **Minimal report & admin resolution** | Users submit reports through `submit_report`; authorized staff list, inspect, resolve, suspend/unsuspend, and cancel through protected operations. Account deletion is a trusted Auth Admin server operation with database-triggered PII anonymization. Security-sensitive mutations are audit-logged without copying deleted PII. See `04` §6.2, `03` §3.6/§8, `05` §3.12–§3.13. |

## 3. Post-MVP / deferred features (with rationale)

Every deferral is explicit. "Why deferred" ties to risk, scope, or the lack of a safe MVP implementation.

| Feature | Deferred to | Rationale for deferral |
| --- | --- | --- |
| Route-based / map matching & weighted scoring engine | PM-2 (ADR-0006) | No reliable geodata or traveler-route model at launch; risky, non-essential. Browsing + filters suffice for MVP. |
| Traveler routes / availability / delivery time-window model | PM-2 (ADR-0006) | Only needed if matching is in scope. MVP uses simple open-request browsing. Schema sketched in `03` §7 (provisional). |
| Leaderboard & points gamification | PM-3 (ADR-0007) | Gamification invites manipulation (rating/point abuse) and is not needed to complete a delivery. Ratings (MS-10) are enough signal for MVP. |
| Presence / "online now" indicators | PM-5 | Requires Realtime presence; not needed to arrange a delivery. See ADR-0005. |
| Advanced animations (Framer Motion), bottom sheets (Vaul), toast stacks (Sonner) | Post-MVP / per-ADR-0002 | Polish, not function. Native + Tailwind suffice for MVP. |
| Push notifications | PM-5 | Needs service worker / push keys; in-app status + email is enough initially. |
| Proof-of-delivery photo upload (Storage) | PM-5 (ADR-0001, `04`) | Storage adds attack surface; explicit "mark delivered" is enough for MVP. Revisit with admin review. |
| In-app payments / escrow | Post-MVP | High risk, out of MVP scope; reward is suggested/settled out-of-band for now. |
| Dispute/arbitration workflow & admin console | PM-4 (`04`) | MVP handles cancellation before `in_progress`; post-`in_progress` issues need a human workflow handled via minimal report/admin resolution (MS-13). Full console deferred. |
| Peer blocking | PM-4 | Deferred; report + admin suspension covers MVP risk. |
| Analytics dashboard | Post-MVP | Not required to deliver. |

## 4. Non-goals (explicitly out of scope, ever-or-for-now)

- Commercial courier replacement; BringIt is student-only and non-commercial at MVP.
- Real-money handling.
- Driver/rider verification beyond student status.
- Native iOS/Android apps (web responsive only).

## 5. Success metrics (proposed, requires approval)

| Metric | Target (proposed) | Notes |
| --- | --- | --- |
| Verified signups | baseline only | No SLA; used to detect adoption risk |
| Successful deliveries / week | track, no target | See `09` |
| Dispute rate | < 2% of completed (proposed) | Needs dispute flow first |

These targets are **proposed** and must be confirmed by the product owner; do not treat as committed.

## 6. Cross-references

- Scope ↔ roadmap: `08-implementation-roadmap.md` §3 (each MS-1 … MS-13 → task(s)).
- Scope ↔ tests: `07-testing-strategy.md` §4 (each feature → required tests).
- Deferrals ↔ ADRs: ADR-0006 (matching), ADR-0007 (reputation), ADR-0002 (UI deps), ADR-0005 (presence).
- Verification method: ADR-0003; visibility tiers: `03` §5; state machine: ADR-0004; report/admin: `04` §6.2, `03` §3.6, `05` §3.10–§3.13.
