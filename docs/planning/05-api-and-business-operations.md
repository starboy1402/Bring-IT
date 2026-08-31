# 05 — API & Business Operations

**Authoritative for:** distinguishing raw data access from protected operations, **RPC contracts**, and the **stable error-code catalogue**.
**Status:** Proposed.

## 1. Access layers

| Layer | What it is | When used | Authorization |
| --- | --- | --- | --- |
| **Raw data access** (PostgREST) | Direct `SELECT` on safe views (`public_profiles`, `delivery_requests` open rows visible to verified users, `delivery_events` participant rows, `messages` participant rows) | Reads of public/participant data | RLS only |
| **Protected database operations** (RPC) | `SECURITY DEFINER` functions: `create_profile`, `update_profile`, `get_own_private_profile`, `create_request`, `accept_delivery`, `advance_delivery`, `cancel_delivery`, `send_message`, `submit_rating`, `submit_report`, `get_delivery_contact`, `admin_list_reports`, `admin_get_report`, `admin_resolve_report`, `admin_suspend_user`, `admin_unsuspend_user`, `admin_cancel_delivery`, `authorize_admin_user_deletion` | Integrity-sensitive reads/writes and state transitions | In-function authorization; row locks where the contract requires them |
| **Trusted server operations** | Scheduled `process-notification-outbox` and admin `admin_delete_or_anonymize_user` Edge Functions | External notification delivery and Auth Admin deletion | Caller JWT authorization plus a separate server-only client; secret/service credential never reaches browser |

> **Rule:** No browser client may `PATCH`/`UPDATE`/`INSERT` directly into `profiles`, `delivery_requests`, `delivery_events`, `messages`, `ratings`, `reports`, `admin_roles`, `rate_limit_events`, `rate_limit_policies`, or `notification_outbox`. Product writes use the documented RPCs; the two server operations use only their narrowly scoped server contracts.

## 2. Error model (stable codes)

All RPCs return a typed result: `{ ok: true, data }` or `{ ok: false, code, message }`. Frontend branches on `code`, not on English text.

| Code | Meaning | HTTP/rpc behavior |
| --- | --- | --- |
| `UNAUTHENTICATED` | No valid session / `auth.uid()` is null | 401-equivalent |
| `NOT_VERIFIED` | User not `is_verified` | blocked at op |
| `SUSPENDED` | User `is_suspended = true` | blocked at op |
| `PROFILE_NOT_FOUND` | No profile row for caller | — |
| `DELIVERY_NOT_FOUND` | Request id unknown/too unauthorized | — |
| `NOT_PARTICIPANT` | Actor is not requester/deliverer | — |
| `SELF_ACCEPT_FORBIDDEN` | Actor is the requester | — |
| `ALREADY_ACCEPTED` | A different deliverer already owns the request | conflict; same deliverer retry succeeds |
| `INVALID_TRANSITION` | `from→to` not allowed / wrong actor | — |
| `CANCEL_NOT_ALLOWED` | Cancel attempted after `in_progress` | conflict |
| `RATING_ALREADY_EXISTS` | Natural key exists with different score/comment | conflict |
| `RATING_NOT_ALLOWED` | Delivery not `delivered` / rating self / wrong role | — |
| `DELIVERY_NOT_DELIVERED` | Delivery status is not `delivered` | — |
| `RATE_LIMITED` | Too many operations | — |
| `VALIDATION_ERROR` | Input fails constraint | — |
| `REPORT_NOT_ALLOWED` | Reporter not authorized for this target/request | — |
| `REPORT_NOT_FOUND` | Report id unknown to authorized admin | — |
| `TARGET_NOT_FOUND` | Target user or delivery does not exist | — |
| `ADMIN_REQUIRED` | Caller is not an admin/moderator | — |
| `REPORT_NOT_OPEN` | Non-open report does not match the requested resolution retry | conflict |
| `ACTIVE_DELIVERY_EXISTS` | Cannot anonymize user with active deliveries | — |
| `AUTH_DELETE_FAILED` | Trusted server could not delete the Auth user | retryable server error |

## 3. RPC contracts

Protected database operations run in one database transaction. **State-machine transition RPCs** (`accept_delivery`, `advance_delivery`, `cancel_delivery`, `admin_cancel_delivery`) use `SELECT ... FOR UPDATE` on the request row. Other RPCs lock only the rows their own contract names. **Completion is performed by `advance_delivery(..., 'delivered')`**; there is no separate `complete_delivery` RPC.

### 3.1 `create_profile(display_name text, student_id text, department text, hall text, phone text)`
- **Actor:** newly authenticated user with no existing profile.
- **Preconditions:** `auth.uid()` is not null. If a `profiles` row already exists for `auth.uid()`, returns the existing profile (idempotent — see §4.1).
- **Allowed fields:** `display_name`, `student_id`, `department`, `hall`, `phone`.
- **Forbidden fields (server-set):** `id`, `auth_user_id`, `is_verified` (always `false` on creation; set only via trusted verification path), `is_suspended`, `created_at`, `updated_at`.
- **Effects:** INSERT row with server-generated `id`, `auth_user_id = auth.uid()`, `is_verified = false`.
- **Returns:** `{ ok:true, profile_id }` on success; on retry returns `{ ok:true, profile_id, already_existed:true }`.
- **Concurrency:** implement as insert-or-return-existing in one transaction; a unique-key race is caught and resolved by selecting the caller's existing profile.
- **Errors:** `UNAUTHENTICATED`, `VALIDATION_ERROR`.

### 3.2 `update_profile(display_name text, department text, hall text, phone text)`
- **Actor:** profile owner (`auth.uid() = auth_user_id`).
- **Allowed fields:** `display_name`, `department`, `hall`, `phone`.
- **Forbidden fields:** `is_verified`, `is_suspended`, `student_id`, `id`, `auth_user_id`, `created_at`, `updated_at`.
- **Effects:** UPDATE only supplied approved columns.
- **Returns:** `{ ok:true }` or error code above.
- **Audit:** logs `profile_updated`.

### 3.3 `get_own_private_profile()`
- **Actor:** profile owner.
- **Returns:** full private profile row including `student_id`, `phone`, `is_verified`, `is_suspended`, and admin role (if any).
- **Errors:** `UNAUTHENTICATED`, `PROFILE_NOT_FOUND`.

### 3.4 `create_request(title text, description text, pickup_location text, dropoff_location text, urgency urgency_level, reward_suggestion numeric)`
- **Actor:** authenticated, `is_verified = true`, `is_suspended = false`.
- **Preconditions:** `auth.uid()` exists and is non-null; caller profile exists and is verified and not suspended.
- **Server-controlled values:** `requester_id` derived from caller; `deliverer_id` always starts `NULL`; `status` always starts `open`; `id` server-generated.
- **Validation:** all input fields satisfy table CHECK constraints.
- **Rate limiting:** enforced server-side via `check_rate_limit('create_request')`.
- **Effects:** INSERT row; append `delivery_events(open, actor=requester_id)`; audit `request_created`.
- **Returns:** `{ ok:true, request_id, status:'open' }` or stable error code.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `VALIDATION_ERROR`, `RATE_LIMITED`.

### 3.5 `accept_delivery(request_id uuid)`
- **Actor:** any verified user except the requester.
- **Preconditions:** request exists; `status='open'`; `deliverer_id IS NULL`; `actor <> requester_id`; `actor.is_suspended=false`.
- **Atomicity:** `SELECT … FOR UPDATE` on the row; re-check `deliverer_id IS NULL` after lock; if already set → `ALREADY_ACCEPTED`.
- **Effects:** set `deliverer_id`, `status='accepted'`, insert `delivery_events(open→accepted, actor)`, touch `updated_at`; audit `accept`.
- **Returns:** `{ ok:true, status:'accepted' }` on success; on retry by the same user returns `{ ok:true, status:'accepted' }` (idempotent — see §4.1).
- **Concurrency:** two different users calling simultaneously → exactly one succeeds; the other gets `ALREADY_ACCEPTED`.

### 3.6 `advance_delivery(request_id uuid, to_status delivery_status)`
- **Allowed transitions & actors:**
  - `accepted → in_progress`: only `deliverer_id`.
  - `in_progress → delivered`: only `deliverer_id`.
- **Effects:** set `status`, append `delivery_events`, touch `updated_at`. On `delivered`, open rating window; audit `advance`.
- **Returns:** `{ ok:true, status:to_status }` on success. A retry succeeds only when the current state already equals `to_status` and the caller is still the authorized deliverer; a later/different target state returns `INVALID_TRANSITION`.
- **Rejects:** wrong actor → `NOT_PARTICIPANT`/`INVALID_TRANSITION`; illegal jump → `INVALID_TRANSITION`.

### 3.7 `cancel_delivery(request_id uuid, reason text)`
- **Actors & rules (MVP):**
  - Requester may cancel when `status IN ('open','accepted')`.
  - Deliverer may cancel when `status='accepted'` (before `in_progress`).
  - After `in_progress` → `CANCEL_NOT_ALLOWED` (use Report/Admin, `04` §6.3).
- **Effects:** `status='cancelled'`, `delivery_events(→cancelled, note=reason)`, audit `cancel`.
- **Returns:** `{ ok:true, status:'cancelled' }` on success; on retry returns `{ ok:true, status:'cancelled' }` if already cancelled by the same actor (idempotent — see §4.1); after `in_progress` → `CANCEL_NOT_ALLOWED`.

### 3.8 `send_message(request_id uuid, content text)`
- **Actor:** authenticated, `is_verified = true`, `is_suspended = false`, and `auth.uid()` is a participant of `request_id`.
- **Sender derivation:** `sender_id` derived from caller; client-supplied `sender_id` is ignored.
- **Validation:** `content` length 1–2000.
- **Rate limiting:** enforced server-side via `check_rate_limit('send_message')`.
- **Effects:** INSERT row; audit `message_sent`.
- **Returns:** `{ ok:true, message_id, created_at }` or stable error code.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `NOT_PARTICIPANT`, `VALIDATION_ERROR`, `RATE_LIMITED`.

### 3.9 `submit_rating(request_id uuid, ratee_id uuid, role rating_role, score smallint, comment text)`
- **Preconditions:** delivery `status='delivered'`; `auth.uid()` is a participant; `ratee_id` is the other participant; `role` matches the rater's actual role; `(request_id, rater_id, role)` unique; `score` 1–5.
- **Effects:** INSERT row; audit `rating_created`.
- **Returns:** `{ ok:true, rating_id }` on success. A retry returns the existing rating only when `ratee_id`, `score`, and normalized `comment` match; a different payload for the same natural key returns `RATING_ALREADY_EXISTS`.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `DELIVERY_NOT_DELIVERED`, `NOT_PARTICIPANT`, `RATING_NOT_ALLOWED`, `VALIDATION_ERROR`, `RATING_ALREADY_EXISTS`.
- **No editing/deleting:** ratings are immutable after insert.

### 3.10 `submit_report(request_id uuid, target_id uuid, reason text, description text)`
- **Actor:** authenticated, `is_verified = true`, `is_suspended = false`.
- **Preconditions:**
  - `request_id` exists and caller can view it (open request, or caller is a participant).
  - `target_id` is a participant of `request_id`.
  - `reporter_id` is the caller's profile id.
  - `reason` 3–200 chars; `description` ≤1000 if supplied.
  - caller is not the target (self-reporting rejected).
- **Server-controlled:** `reporter_id` derived from caller; `status` starts `'open'`.
- **Rate limiting:** enforced server-side via `check_rate_limit('submit_report')`.
  - **Effects:** INSERT row; append `audit_log` action `report_created`; enqueue notification via `notification_outbox` with `deduplication_key = 'report_created:' || new_report_id`.
- **Returns:** `{ ok:true, report_id }` or stable error code.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `VALIDATION_ERROR`, `REPORT_NOT_ALLOWED`, `RATE_LIMITED`.

### 3.11 `get_delivery_contact(request_id uuid)`
- **Actor:** authenticated, `is_verified = true`, `is_suspended = false`, and `auth.uid()` is a participant (requester or assigned deliverer).
- **Preconditions:** request `status IN ('accepted', 'in_progress')`.
- **Returns:** minimum required contact fields of the **counterpart** (the other participant), e.g., `{ display_name, phone }`.
- **Returns nothing** (empty result) if status is `delivered`, `cancelled`, or `open`.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `NOT_PARTICIPANT`, `CONTACT_NOT_AVAILABLE`.
- **Audit:** writes `contact_accessed` with request/counterpart IDs, but never copies the phone value into audit metadata.

### 3.12 Admin report-read operations (SECURITY DEFINER)

- **`admin_list_reports(p_status report_status DEFAULT 'open', p_after_created_at timestamptz DEFAULT NULL, p_after_id uuid DEFAULT NULL, p_page_size integer DEFAULT 20)`** — moderator+.
  - **Actor:** derived internally from `auth.uid()`; caller must have at least `moderator` role (via `has_admin_role('moderator')`).
  - **Preconditions:** `auth.uid()` not null; profile exists; `has_admin_role('moderator')` returns true.
  - **Pagination:** composite keyset `(created_at, id) > (p_after_created_at, p_after_id)`. Both cursor fields must be NULL for the first page or both non-NULL thereafter. Reject `p_page_size` outside 1–50.
  - **Filtering:** one required status partition per call, defaulting to `open`. Admins query resolved or dismissed reports explicitly; this keeps pagination and index use deterministic.
  - **Ordering:** stable `(created_at ASC, id ASC)`.
  - **Index used:** `idx_reports_status_created` on `reports (status, created_at ASC, id ASC)`.
  - **Returned fields:** `id`, `request_id`, `reporter_id`, `target_id`, `reason`, `description`, `status`, `resolution`, `resolved_by`, `resolved_at`, `created_at`, `updated_at`.
  - **Information-disclosure rules:** non-admin callers receive `ADMIN_REQUIRED` (no partial data). The function never leaks whether a specific report exists to unauthorized callers.
  - **Audit:** no audit_log entry per-listing (read-only); access logged at DEBUG level only.
  - **Idempotency:** read-only; safe to retry.
  - **Errors:** `UNAUTHENTICATED`, `ADMIN_REQUIRED`, `VALIDATION_ERROR` (invalid cursor/page_size).

- **`admin_get_report(report_id uuid)`** — moderator+.
  - **Actor:** derived internally from `auth.uid()`; `has_admin_role('moderator')` required.
  - **Preconditions:** `auth.uid()` not null; caller is moderator+.
  - **Returned fields:** `id`, `request_id`, `reporter_id`, `target_id`, `reason`, `description`, `status`, `resolution`, `resolved_by`, `resolved_at`, `created_at`, `updated_at`, plus `reporter_display_name` and `target_display_name` (via JOIN to `profiles`, shown as "Deleted user" if anonymized).
  - **Information-disclosure rules:** non-admin → `ADMIN_REQUIRED`. Non-existent report_id to an authorized admin → `REPORT_NOT_FOUND` (no distinction from "already deleted").
  - **Idempotency:** read-only; safe to retry.
  - **Errors:** `UNAUTHENTICATED`, `ADMIN_REQUIRED`, `REPORT_NOT_FOUND`.

### 3.13 Admin resolution operations (SECURITY DEFINER)
- **`admin_resolve_report(report_id uuid, outcome report_status, resolution text)`:** admin/moderator only. Transitions an `open` report to `resolved` or `dismissed`. Sets `resolved_by = caller`, `resolved_at = now()`, and appends `report_resolved`. A retry succeeds only when outcome and normalized resolution match the stored result; any different attempt against a non-open report returns `REPORT_NOT_OPEN`.
- **`admin_suspend_user(target_id uuid, reason text)`:** admin only. Sets `profiles.is_suspended = true`; appends `audit_log` action `user_suspended`.
- **`admin_unsuspend_user(target_id uuid)`:** admin only. Sets `profiles.is_suspended = false`; appends `audit_log` action `user_unsuspended`.
- **`admin_cancel_delivery(request_id uuid, reason text)`:** admin/moderator only. Cancels any non-terminal delivery; appends `audit_log` action `admin_cancel`.
- **`admin_delete_or_anonymize_user(target_profile_id uuid)` (trusted Edge Function):** admin+ only. It verifies the caller using a caller-scoped database client, preflights active deliveries, resolves the Auth user server-side, and calls Supabase Auth Admin deletion. The `BEFORE DELETE` trigger in `03` §8 repeats the active-delivery check, clears PII, and preserves the profile UUID. The server secret is never used with browser-controlled database queries.
- **`authorize_admin_user_deletion(target_profile_id uuid)` (RPC used by that Edge Function):** derives the admin actor from `auth.uid()`, requires `has_admin_role('admin')`, locks the target profile, rejects active deliveries, records `account_deletion_requested`, and returns `{ auth_user_id, already_deleted }`. It never deletes or anonymizes by itself. If the retained profile is fully anonymized and has no Auth ID, it returns `already_deleted=true`; otherwise a missing/inconsistent target is an error.
- **Errors for admin operations:** `UNAUTHENTICATED`, `ADMIN_REQUIRED`, `VALIDATION_ERROR`, `TARGET_NOT_FOUND`, `REPORT_NOT_OPEN`, `INVALID_TRANSITION`, `ACTIVE_DELIVERY_EXISTS`, `AUTH_DELETE_FAILED`.

### 3.14 Mandatory SECURITY DEFINER implementation rules

Every SECURITY DEFINER function in this schema MUST follow these rules:

1. **Fixed safe `search_path`:** set to empty string at function creation time (`SET search_path = ''`).
2. **Schema-qualified application objects:** tables, application types, and user-defined functions are schema-qualified. PostgreSQL built-ins from implicit `pg_catalog` may remain unqualified.
3. **Correct invocation identity:** client-callable functions validate `auth.uid()`; trigger-only functions use `OLD`/`NEW`; service-only workers use a server-generated worker token and are never client-executable.
4. **Explicit authorization:** every client/server operation checks authorization beyond frontend route guards. Trigger-only functions enforce invariants and have no API grant.
5. **`REVOKE EXECUTE FROM PUBLIC`:** after creation, revoke execute from `PUBLIC`.
6. **Explicit `GRANT EXECUTE`:** grant only to intended roles; trigger functions have no API grant and outbox worker functions are `service_role`-only.
7. **Least-privileged function owner:** the function owner should be a dedicated role with only the minimum privileges needed.
8. **No trust in caller-provided IDs:** never allow caller to specify `requester_id`, `sender_id`, `rater_id`, `reporter_id`; always derive from `auth.uid()`.
9. **Predictable structured errors:** always return `{ ok: false, code: 'STABLE_CODE', message: '...' }` on failure; do not leak SQLSTATE or internal details.
10. **Declared audit behavior:** mutations and sensitive reads state whether they write `audit_log`; deletion events must not copy deleted PII into audit metadata.
11. **SECURITY DEFINER uses database function owner's privileges, not the Supabase service-role API key.**

> **Clarification:** A `SECURITY DEFINER` function executes with the privileges of its **owner** (a PostgreSQL role), not with the caller's session role and not with the Supabase `service_role` API key.

## 4. Pagination, idempotency, concurrency

- **Pagination:** `open` browse uses keyset pagination on `(created_at DESC, id DESC)` via the partial index (`03` §3.2). Page size default 20.
- **Message recovery:** uses composite cursor `(created_at ASC, id ASC)` via index `idx_messages_request_time` (`03` §3.4). Backfill query: `SELECT … WHERE request_id=$1 AND (created_at, id) > (last_created_at, last_id) ORDER BY created_at ASC, id ASC`.
- **Status recovery:** refetches authoritative `delivery_requests` row and/or `delivery_events` ordered by `(created_at ASC, id ASC)`; request UUIDs are not treated as event cursors.

### 4.1 Idempotency semantics per RPC

| RPC | Idempotent? | Retry behavior | Conflict behavior | Idempotency key accepted? | Successful retry returns |
| --- | --- | --- | --- | --- | --- |
| `create_profile` | Response-idempotent | Insert-or-return-existing for the same `auth.uid()` | No conflict | No (`auth.uid()` is key) | Existing profile |
| `update_profile` | Yes | Safe to retry; re-applies same values | No conflict (last write wins) | No | Updated profile |
| `get_own_private_profile` | Yes | Safe to retry | No conflict | No | Current profile |
| `create_request` | No | Each call creates a new request; client must debounce | N/A | No (deferred) | New request each time |
| `accept_delivery` | Response-idempotent for same deliverer | Same deliverer retry succeeds after row lock | Different deliverer → `ALREADY_ACCEPTED` | No | `accepted` |
| `advance_delivery` | Response-idempotent for same target | If current state equals `to_status`, authorized deliverer gets success | Different/later target → `INVALID_TRANSITION` | No | Requested target state |
| `cancel_delivery` | Response-idempotent for same cancellation | Same actor retry against its existing cancellation succeeds | Different actor/reason or prohibited state → conflict | No | `cancelled` |
| `send_message` | No | Each call creates a new message; client must debounce | N/A | No (deferred) | New message each time |
| `submit_rating` | Response-idempotent for identical payload | Natural-key retry returns existing row only when payload matches | Different payload → `RATING_ALREADY_EXISTS` | No (natural key) | Existing rating |
| `submit_report` | No | Each call creates a new report; rate-limited | N/A | No (deferred) | New report each time |
| `get_delivery_contact` | No (audit-producing read) | Safe to repeat, but each successful disclosure is audited | No conflict | No | Current contact info |
| `admin_resolve_report` | Response-idempotent for identical resolution | Same outcome/resolution retry succeeds | Different result on non-open report → `REPORT_NOT_OPEN` | No (`report_id` is key) | Stored matching result |
| `admin_list_reports` | N/A (read-only) | Safe to retry; data may change between calls | No conflict | No | Current page |
| `admin_get_report` | N/A (read-only) | Safe to retry | No conflict | No | Current report state |
| `admin_suspend_user` | Yes | Idempotent; re-suspending is a no-op | No conflict | No | Current state |
| `admin_unsuspend_user` | Yes | Idempotent; re-unsuspending is a no-op | No conflict | No | Current state |
| `admin_cancel_delivery` | Response-idempotent for same cancellation | Same admin retry against its existing cancellation succeeds | Other terminal state → `INVALID_TRANSITION` | No | `cancelled` |
| `authorize_admin_user_deletion` | No (audit-producing preflight) | Safe to repeat, but each authorized call records a deletion-request audit event | Active delivery/inconsistent target → error | No | Auth ID or `already_deleted` |
| `admin_delete_or_anonymize_user` | Response-idempotent | Missing Auth user plus fully anonymized retained profile returns success | Active delivery or partial/mismatched target → error | No (`target_profile_id` is key) | Deletion/anonymization result |

> **Idempotency note:** retries are successful only when the natural key and normalized payload match the original operation. A unique constraint alone does not make the response idempotent. Operations that always create a new row (`create_request`, `send_message`, `submit_report`) remain non-idempotent; client debounce reduces accidental duplicates but is not an idempotency guarantee.

## 5. Input validation (defense in depth)

| Field | Client (zod) | DB (constraint) | RPC check |
| --- | --- | --- | --- |
| title | 3–120 | CHECK | — |
| reward | ≥0 | `numeric(10,2)` CHECK | — |
| message content | 1–2000 | CHECK | rate-limit |
| rating score | 1–5 | CHECK | role/uniqueness |
| report reason | 3–200 | CHECK | participant check |
| report description | ≤1000 | CHECK | — |

Client validation is UX; **DB constraints + RPC checks are authoritative**.

## 6. Cross-references

- Schema & RLS: `03-data-model.md`.
- Profile RPC details: `03-data-model.md` §3.1.
- Report/admin schema: `03-data-model.md` §3.6, §3.7.
- Rate limiting: `03-data-model.md` §3.9.
- Notification outbox: `03-data-model.md` §3.10.
- State machine detail: ADR-0004.
- Threats these prevent: `04-security-and-threat-model.md` (T3, T4).
- Tests: `07-testing-strategy.md` §4–§5 (concurrency, RLS, RPC).
- Realtime cursor/recovery: `06-realtime-design.md` §4.
