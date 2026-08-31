# 03 — Data Model

**Authoritative for:** database schema, PostgreSQL types, constraints, indexes, foreign keys, **and the RLS policy SQL**. RLS rationale/laws live in `04`; this file defines *what is enforced*.
**Status:** Proposed (schema not yet created in any project).

> All timestamps are `timestamptz`. All money is `NUMERIC(10,2)`. All IDs are `uuid`. Status values are lowercase stable codes consumed by the API (`05`) and frontend.

## 1. Design principles

1. **Single source of truth for status** = `delivery_requests.status`. There is **no** second mutable `status` column on a `deliveries` table (the earlier `.kilo/plans` duplicated it — rejected).
2. **History is append-only** via `delivery_events`; current state is derived/asserted by the row, history is never updated or deleted by users.
3. **Ratings are bilateral and unique** per (request, rater, role) to prevent double/substitute rating.
4. **Security by constraint + RLS**, not by client behavior.
5. **Profile identity is stable and separate from authentication**: `profiles.id` is the permanent application identity; `auth_user_id` is a nullable reference to `auth.users`. Deleting the auth account does not delete the profile.

## 2. Enums

```sql
CREATE TYPE delivery_status AS ENUM
  ('open','accepted','in_progress','delivered','cancelled');

CREATE TYPE urgency_level AS ENUM ('low','medium','high');

CREATE TYPE rating_role AS ENUM ('as_requester','as_deliverer');

CREATE TYPE participant_role AS ENUM ('requester','deliverer');

CREATE TYPE report_status AS ENUM ('open','resolved','dismissed');

CREATE TYPE admin_role_type AS ENUM ('owner','admin','moderator');
```

## 3. Tables

### 3.1 `profiles`
Owns identity. `id` is the permanent application identity, **not** the auth.users id.

```sql
CREATE TABLE profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  student_id      text,
  department      text,
  hall            text,
  phone           text,
  is_verified     boolean NOT NULL DEFAULT false,   -- set by verification flow (ADR-0003)
  is_suspended    boolean NOT NULL DEFAULT false,   -- admin only
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_student_id_format
    CHECK (student_id IS NULL OR student_id ~ '^[A-Za-z0-9]{4,20}$')
);
```
- `student_id`, `phone` are **private** (see §5). `is_verified`/`is_suspended` are **admin-only**.
- `display_name`, `department`, `hall` are **public**.
- `auth_user_id` is NULL for anonymized (deleted-auth) profiles; the profile row persists so historical relationships remain distinct.

#### 3.1.1 Profile RPC contracts (SECURITY DEFINER)

All profile mutations go through SECURITY DEFINER RPCs. Direct client `INSERT`/`UPDATE`/`DELETE` on `profiles` is blocked by RLS (§6).

**`create_profile(display_name text, student_id text, department text, hall text, phone text)`**
- **Actor:** newly authenticated user creating their own profile.
- **Preconditions:** `auth.uid()` is not null. If a row already exists for that Auth user, return it instead of inserting another row.
- **Allowed fields:** `display_name`, `student_id`, `department`, `hall`, `phone`.
- **Forbidden fields (server-set):** `id`, `auth_user_id`, `is_verified`, `is_suspended`, `created_at`, `updated_at`.
- **Effects:** atomically insert-or-return-existing with server-generated `id`, `auth_user_id = auth.uid()`, and server-controlled defaults.
- **Errors:** `UNAUTHENTICATED`, `VALIDATION_ERROR`.

**`update_profile(display_name text, department text, hall text, phone text)`**
- **Actor:** profile owner (`auth.uid() = auth_user_id`).
- **Allowed fields:** `display_name`, `department`, `hall`, `phone`.
- **Forbidden fields (cannot be changed by user):** `is_verified`, `is_suspended`, `student_id` (immutable after creation to prevent identity swapping), `id`, `auth_user_id`, `created_at`, `updated_at`.
- **Effects:** UPDATE only supplied approved columns.
- **Errors:** `UNAUTHENTICATED`, `PROFILE_NOT_FOUND`, `VALIDATION_ERROR`.

**`get_own_private_profile()`**
- **Actor:** profile owner.
- **Returns:** full private profile row including `student_id`, `phone`, `is_verified`, `is_suspended`, and admin role (via `admin_roles` lookup, exposed only to the user themselves if they are an admin).
- **Errors:** `UNAUTHENTICATED`, `PROFILE_NOT_FOUND`.

> **Security note:** These RPCs run as `SECURITY DEFINER`. The function owner is a least-privileged role; `search_path` is fixed to empty; references are schema-qualified; `auth.uid()` is asserted non-null; explicit authorization is checked inside the function; `REVOKE EXECUTE FROM PUBLIC`; `GRANT EXECUTE` only to `authenticated`. See §6 for mandatory SECURITY DEFINER rules.

### 3.2 `delivery_requests` — authoritative status owner
```sql
CREATE TABLE delivery_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  deliverer_id      uuid REFERENCES profiles(id) ON DELETE RESTRICT,
  title             text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description       text CHECK (char_length(description) <= 1000),
  pickup_location   text NOT NULL CHECK (char_length(pickup_location) BETWEEN 3 AND 200),
  dropoff_location  text NOT NULL CHECK (char_length(dropoff_location) BETWEEN 3 AND 200),
  urgency           urgency_level NOT NULL DEFAULT 'medium',
  reward_suggestion numeric(10,2) CHECK (reward_suggestion IS NULL OR reward_suggestion >= 0),
  status            delivery_status NOT NULL DEFAULT 'open',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT no_self_delivery CHECK (deliverer_id IS NULL OR deliverer_id <> requester_id)
);

-- Browse index: newest open requests first, tie-broken by id
CREATE INDEX idx_requests_status_created ON delivery_requests (status, created_at DESC, id DESC)
  WHERE status = 'open';
CREATE INDEX idx_requests_requester ON delivery_requests (requester_id);
CREATE INDEX idx_requests_deliverer ON delivery_requests (deliverer_id);
```
- `deliverer_id` is set **only** by the `accept_delivery` RPC (ADR-0004). Client `UPDATE` of `deliverer_id`/`status` is forbidden by RLS (§6).
- Partial index keeps the hot "open + newest" browse query indexed without bloating other states.

#### 3.2.1 `create_request` RPC (SECURITY DEFINER)

Direct client `INSERT` into `delivery_requests` is **revoked**; all request creation goes through `create_request`.

**`create_request(title text, description text, pickup_location text, dropoff_location text, urgency urgency_level, reward_suggestion numeric)`**
- **Actor:** authenticated, `is_verified = true`, `is_suspended = false`.
- **Preconditions:** `auth.uid()` exists and is non-null; caller profile exists and is verified and not suspended.
- **Server-controlled values:** `requester_id` is always the caller's profile id (derived from `auth.uid()`); `deliverer_id` always starts `NULL`; `status` always starts `open`; `id` server-generated.
- **Validation:** all input fields satisfy table CHECK constraints.
- **Rate limiting:** enforced server-side via `rate_limit_events` (§3.9).
- **Effects:** INSERT row; append `delivery_events(open, actor=requester_id)`.
- **Returns:** `{ ok:true, request_id, status:'open' }` or stable error code.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `VALIDATION_ERROR`, `RATE_LIMITED`.

> **Security note:** This RPC runs as `SECURITY DEFINER`. Mandatory implementation rules are in §6.

### 3.3 `delivery_events` — append-only status history
```sql
CREATE TABLE delivery_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id  uuid NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  from_status delivery_status,
  to_status   delivery_status NOT NULL,
  note        text CHECK (char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Recovery index: chronological by request, tie-broken by id
CREATE INDEX idx_events_request_time ON delivery_events (request_id, created_at ASC, id ASC);
```
- Written by the same RPCs that mutate `delivery_requests`. Never client-writable (§6).
- Status recovery refetches authoritative `delivery_requests` row and/or `delivery_events` ordered by `(created_at ASC, id ASC)`; request UUIDs are not treated as event cursors.

### 3.4 `messages` — persisted chat (source of truth for realtime)
```sql
CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Composite cursor for pagination/recovery: (created_at ASC, id ASC)
CREATE INDEX idx_messages_request_time ON messages (request_id, created_at ASC, id ASC);
```
- Ordering key = `(created_at ASC, id ASC)` for deterministic dedup/ordering (`06` §4).
- `id` is UUID; it must **not** be used alone as a chronological cursor. Use composite cursor `(created_at, id) > (last_created_at, last_id)`.
- Client `INSERT` is blocked by RLS; all writes go through `send_message` RPC (§6).

#### 3.4.1 `send_message` RPC (SECURITY DEFINER)

**`send_message(request_id uuid, content text)`**
- **Actor:** authenticated, `is_verified = true`, `is_suspended = false`, and `auth.uid()` is a participant of `request_id`.
- **Sender derivation:** `sender_id` is always the caller's profile id; client-supplied `sender_id` is ignored/rejected.
- **Validation:** `content` length 1–2000.
- **Rate limiting:** enforced server-side via `rate_limit_events` (§3.9).
- **Effects:** INSERT row.
- **Returns:** `{ ok:true, message_id, created_at }` or stable error code.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `NOT_PARTICIPANT`, `VALIDATION_ERROR`, `RATE_LIMITED`.

> **Security note:** This RPC runs as `SECURITY DEFINER`. Mandatory implementation rules are in §6.

### 3.5 `ratings` — minimal bilateral rating (MVP, ADR-0007)
```sql
CREATE TABLE ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  rater_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  ratee_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  role         rating_role NOT NULL,           -- rater's perspective
  score        smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment      text CHECK (char_length(comment) <= 500),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ratings_once_per_perspective
    UNIQUE (request_id, rater_id, role),
  CONSTRAINT ratings_distinct_parties
    CHECK (rater_id <> ratee_id)
);
CREATE INDEX idx_ratings_ratee ON ratings (ratee_id);
```
- One row per (request, rater, role). Requester rates deliverer via `as_requester`; deliverer rates requester via `as_deliverer`. Uniqueness prevents re-rating/abuse.
- Client `INSERT` is blocked by RLS; all writes go through `submit_rating` RPC (§6).

#### 3.5.1 `submit_rating` RPC (SECURITY DEFINER)

**`submit_rating(request_id uuid, ratee_id uuid, role rating_role, score smallint, comment text)`**
- **Actor:** authenticated, `is_verified = true`, `is_suspended = false`.
- **Preconditions:** delivery `status = 'delivered'`; `auth.uid()` is a participant of `request_id`; `ratee_id` is exactly the other participant; `role` matches the rater's actual role; `(request_id, rater_id, role)` unique; `score` 1–5.
- **Effects:** INSERT row with `rater_id` = caller's profile id.
- **Returns:** `{ ok:true, rating_id }`. A natural-key retry returns the existing rating only when ratee, score, and normalized comment match; a different payload returns `RATING_ALREADY_EXISTS`.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `DELIVERY_NOT_DELIVERED`, `NOT_PARTICIPANT`, `RATING_NOT_ALLOWED`, `RATING_ALREADY_EXISTS`, `VALIDATION_ERROR`.
- **No editing/deleting:** ratings are immutable after insert.

> **Security note:** This RPC runs as `SECURITY DEFINER`. Mandatory implementation rules are in §6.

### 3.6 `reports` — minimal MVP report table
```sql
CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  reporter_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  target_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reason        text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 200),
  description   text CHECK (char_length(description) <= 1000),
  status        report_status NOT NULL DEFAULT 'open',
  resolution    text,
  resolved_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reports_distinct_parties
    CHECK (reporter_id <> target_id),
  CONSTRAINT reports_resolution_requires_resolution
    CHECK (
      (status = 'open' AND resolution IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (status IN ('resolved','dismissed') AND resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    )
);
CREATE INDEX idx_reports_request ON reports (request_id);
CREATE INDEX idx_reports_target ON reports (target_id);
CREATE INDEX idx_reports_status_created ON reports (status, created_at ASC, id ASC);
```
- **MVP minimal:** users submit reports; admins view/resolve via SECURITY DEFINER functions. No auto-hide or complex workflows in MVP.
- Client `INSERT` is blocked by RLS; all writes go through `submit_report` RPC (§6).

#### 3.6.1 `submit_report` RPC (SECURITY DEFINER)

**`submit_report(request_id uuid, target_id uuid, reason text, description text)`**
- **Actor:** authenticated, `is_verified = true`, `is_suspended = false`.
- **Preconditions:**
  - `request_id` exists and caller can view it (open request, or caller is a participant).
  - `target_id` is a participant of `request_id` (the other participant, or either participant if reporter is a participant).
  - `reporter_id` is the caller's profile id.
  - `reason` 3–200 chars; `description` ≤1000 if supplied.
  - caller is not the target (self-reporting rejected).
- **Server-controlled:** `reporter_id` derived from caller; `status` starts `'open'`; `resolution`/`resolved_by`/`resolved_at` are NULL.
  - **Effects:** INSERT row; append `audit_log` action `report_created`; enqueue notification via `notification_outbox` with `deduplication_key = 'report_created:' || new_report_id`.
- **Returns:** `{ ok:true, report_id }` or stable error code.
- **Errors:** `UNAUTHENTICATED`, `NOT_VERIFIED`, `SUSPENDED`, `VALIDATION_ERROR`, `REPORT_NOT_ALLOWED`, `RATE_LIMITED`.

> **Security note:** This RPC runs as `SECURITY DEFINER`. Mandatory implementation rules are in §6.

### 3.7 `admin_roles` — admin authorization (prevents self-promotion)
```sql
CREATE TABLE admin_roles (
  user_id      uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  role         admin_role_type NOT NULL,
  granted_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at   timestamptz NOT NULL DEFAULT now()
);
```
- **Design choice:** separate table (not a flag on `profiles`). This prevents self-promotion: profile-update RPCs do not touch `admin_roles`, and no client can modify `admin_roles`.
- **Roles:** `owner` (full access, can grant/revoke admin roles), `admin` (moderation actions), `moderator` (report review). Hierarchy: owner > admin > moderator. Higher roles satisfy lower-role requirements.
- **Initial provisioning:** seed 1–2 `owner` accounts via migration/SQL run by project owner (not via client RPC). No mechanism exists for a non-owner to promote themselves.
- **Reversibility:** high (dropping the table reverts to no admins).

### 3.8 `audit_log` — security/moderation events
```sql
CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text,
  target_id   uuid,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```
- Written by RPCs / admin actions (verification, suspension, cancellation reasons). See `04`.

### 3.9 `rate_limit_events` — server-enforced rate limiting

```sql
CREATE TABLE rate_limit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  operation   text NOT NULL,                 -- server-defined operation names only
  occurred_at timestamptz NOT NULL DEFAULT now(), -- timestamp of this accepted operation
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limit_actor_op_window
  ON rate_limit_events (actor_id, operation, occurred_at);
```

- **Server-defined policy table** (not exposed to clients):
  ```sql
  -- Server-owned rate-limit policy definitions. Not client-modifiable.
  -- RLS applied in §6 below: no client can read or write this table.
  CREATE TABLE rate_limit_policies (
    operation    text PRIMARY KEY,
    max_count    integer NOT NULL CHECK (max_count > 0),
    window_secs  bigint NOT NULL CHECK (window_secs > 0),
    description  text
  );
  -- Seeded by migration (never writable by clients):
  -- INSERT INTO rate_limit_policies VALUES ('create_request', 10, 300, '10 per 5 min');
  -- INSERT INTO rate_limit_policies VALUES ('send_message', 20, 60, '20 per minute');
  -- INSERT INTO rate_limit_policies VALUES ('submit_report', 5, 300, '5 per 5 min');
  ```

- **Internal enforcement function** — `check_rate_limit` is **NOT granted to `authenticated`**. It is called only from inside SECURITY DEFINER RPCs (`create_request`, `send_message`, `submit_report`) with a hardcoded `operation` parameter.

```sql
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_operation text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_profile_id uuid;
  policy record;
  v_window_start timestamptz;
  v_now timestamptz;
  current_count integer;
BEGIN
  -- Derive caller internally; never trust client-supplied actor
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  SELECT id INTO caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  -- Look up server-defined policy using parameter p_operation (avoids column shadowing)
  SELECT * INTO policy FROM public.rate_limit_policies WHERE operation = p_operation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_OPERATION';
  END IF;

  -- Compute exact window boundary for any interval (minute, hour, day)
  v_now := clock_timestamp();
  v_window_start := v_now - make_interval(secs => policy.window_secs);
  -- Use advisory lock to make check + insert atomic (concurrency-safe)
  -- Lock on (actor_id + hashtext(operation)) to serialize per actor per operation
  PERFORM pg_advisory_xact_lock(hashtext(concat(caller_profile_id::text, p_operation)));

  -- Cleanup: delete events for this actor + operation that fall outside the current window.
  -- Old events belong to expired windows (not the current one), so deletion does not
  -- affect the count below; the index on (actor_id, operation, occurred_at) makes this efficient.
  DELETE FROM public.rate_limit_events
  WHERE actor_id = caller_profile_id
    AND operation = p_operation
    AND occurred_at < v_window_start;

  -- Count events in window using p_operation parameter explicitly
  SELECT COUNT(*) INTO current_count
  FROM public.rate_limit_events
  WHERE actor_id = caller_profile_id
    AND operation = p_operation
    AND occurred_at >= v_window_start;

  IF current_count >= policy.max_count THEN
    RETURN false;  -- caller RPC returns RATE_LIMITED
  END IF;

  -- Record event atomically within the advisory lock
  INSERT INTO public.rate_limit_events (actor_id, operation, occurred_at)
  VALUES (caller_profile_id, p_operation, v_now);
  RETURN true;
END;
$$;
-- NOTE: no GRANT EXECUTE TO authenticated — this is INTERNAL ONLY
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text) FROM anon, authenticated;
```

- **Key safety properties:**
  - Clients never call `check_rate_limit` directly (no grant). Only internal SECURITY DEFINER RPCs call it.
  - `operation`, `max_count`, and `window_secs` are **not** caller-supplied — they come from the server-owned `rate_limit_policies` table.
  - `pg_advisory_xact_lock` makes the count + insert + cleanup atomic — concurrent calls serialize.
  - Window calculation uses one captured `v_now` and `make_interval(secs => N)`; the event timestamp is stored in `occurred_at`, so no column/local-variable shadowing exists.
  - **Cleanup:** inside the advisory lock, events for `(actor_id, operation)` older than the current window are deleted before counting — this is implemented in-function, not as a deferred job.

### 3.10 `notification_outbox` — admin notification mechanism

```sql
CREATE TABLE notification_outbox (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type        text NOT NULL,
  payload           jsonb NOT NULL,
  deduplication_key text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'pending',
  attempts          integer NOT NULL DEFAULT 0,
  max_attempts      integer NOT NULL DEFAULT 5,
  next_attempt_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at        timestamptz,
  claimed_by        uuid,
  sent_at           timestamptz,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_status_check
    CHECK (status IN ('pending','processing','sent','failed_terminally')),
  CONSTRAINT notification_attempts_check
    CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts),
  CONSTRAINT notification_claim_check
    CHECK (
      (status = 'processing' AND claimed_at IS NOT NULL AND claimed_by IS NOT NULL)
      OR (status <> 'processing' AND claimed_at IS NULL AND claimed_by IS NULL)
    ),
  CONSTRAINT notification_sent_check
    CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT notification_terminal_check
    CHECK (status <> 'failed_terminally' OR attempts = max_attempts)
);

CREATE INDEX idx_notification_outbox_claim
  ON notification_outbox (next_attempt_at ASC, attempts ASC, id ASC)
  WHERE status = 'pending';
CREATE INDEX idx_notification_outbox_stale_claim
  ON notification_outbox (claimed_at ASC, id ASC)
  WHERE status = 'processing';
CREATE INDEX idx_notification_outbox_status
  ON notification_outbox (status, created_at);
```

- **Producer transaction:** an RPC inserts the outbox row in the same transaction as its business event. Every producer supplies a stable key such as `report_created:<report_id>`.
- **Concrete MVP processor:** a scheduled Supabase Edge Function named `process-notification-outbox` runs every 30 seconds. It uses the server-only `service_role` credential to claim rows, sends them through the configured notification adapter, and then acknowledges or fails each row. The browser never receives that credential or execute permission.
- **Delivery guarantee:** at-least-once. Live workers cannot claim the same row, and the delivery provider receives `deduplication_key` as its idempotency key. This handles a crash after external delivery but before database acknowledgement.

```sql
CREATE OR REPLACE FUNCTION public.claim_notification_outbox(
  p_worker_id uuid,
  p_batch_size integer DEFAULT 10
)
RETURNS SETOF public.notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH due AS (
    SELECT o.id
    FROM public.notification_outbox AS o
    WHERE o.attempts < o.max_attempts
      AND (
        (o.status = 'pending' AND o.next_attempt_at <= clock_timestamp())
        OR (o.status = 'processing' AND o.claimed_at < clock_timestamp() - interval '5 minutes')
      )
    ORDER BY o.next_attempt_at ASC, o.attempts ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_batch_size, 1), 50)
  )
  UPDATE public.notification_outbox AS o
  SET status = 'processing',
      claimed_at = clock_timestamp(),
      claimed_by = p_worker_id,
      updated_at = clock_timestamp()
  FROM due
  WHERE o.id = due.id
  RETURNING o.*;
$$;

CREATE OR REPLACE FUNCTION public.ack_notification_outbox(
  p_id bigint,
  p_worker_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.notification_outbox
  SET status = 'sent', sent_at = clock_timestamp(), claimed_at = NULL,
      claimed_by = NULL, last_error = NULL, updated_at = clock_timestamp()
  WHERE id = p_id AND status = 'processing' AND claimed_by = p_worker_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_notification_outbox(
  p_id bigint,
  p_worker_id uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.notification_outbox
  SET attempts = attempts + 1,
      status = CASE
        WHEN attempts + 1 >= max_attempts THEN 'failed_terminally'
        ELSE 'pending'
      END,
      next_attempt_at = clock_timestamp()
        + make_interval(secs => power(2, LEAST(attempts + 1, 6))::double precision * 5),
      claimed_at = NULL,
      claimed_by = NULL,
      last_error = left(p_error, 2000),
      updated_at = clock_timestamp()
  WHERE id = p_id AND status = 'processing' AND claimed_by = p_worker_id;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notification_outbox(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ack_notification_outbox(bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_notification_outbox(bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_notification_outbox(bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_notification_outbox(bigint, uuid, text) TO service_role;
```

- **Retry:** `fail_notification_outbox` atomically increments attempts and schedules exponential backoff.
- **Terminal failure:** the row becomes `failed_terminally` when the incremented count reaches `max_attempts`.
- **Crash recovery:** a processing lease older than five minutes can be reclaimed. The worker token prevents a stale worker from acknowledging a newly reclaimed row.
- **Atomic claiming:** the CTE uses `FOR UPDATE SKIP LOCKED` and updates exactly the selected rows; PostgreSQL has no `UPDATE ... LIMIT` syntax.
- **Monitoring:** alert on `failed_terminally`, leases older than five minutes, or sustained backlog growth.

## 4. State machine (summary; authoritative in ADR-0004 & `05`)

```
open ──accept──▶ accepted ──pickup──▶ in_progress ──deliver──▶ delivered
   │                  │
   └────cancel(requester, before accepted)──┘
                      └────cancel(deliverer, before in_progress)──┘
```
- `cancelled` is terminal. `delivered` is terminal.
  - After `in_progress`, cancellation requires the **admin flow** (`admin_cancel_delivery` RPC, `05` §3.13, `04` §6.3, MS-13) — this is **MVP**, not deferred.

## 5. Profile & data visibility tiers

| Field | Public (verified, non-suspended) | Participant-only | Private (self) | Admin-only |
| --- | --- | --- | --- | --- |
| display_name, department, hall | ✅ | ✅ | ✅ | ✅ |
| phone | — | ✅ (only while a delivery is `accepted` or `in_progress`) | ✅ | ✅ |
| student_id | — | — | ✅ | ✅ (verify only) |
| email | — | — | ✅ | ✅ |
| is_verified, is_suspended | — | — | — (self sees own) | ✅ |

- **Open requests:** visible only to verified, non-suspended users. `pickup_location` and `dropoff_location` are exposed for browsing. Once `accepted`, the whole request row becomes **participant-only** (RLS §6).
- `phone` is revealed to the counterpart **only** during `accepted` or `in_progress` statuses, enforced by the `get_delivery_contact` RPC, not by the client. Phone access ends when status transitions to `delivered` or `cancelled`.
- **Hall visibility** is an explicit approval decision: `hall` is public by default, but this can be restricted via open-question approval (`10` Q7).
- **Exact-location visibility:** open-request browsing exposes pickup/dropoff labels to verified, non-suspended users. After acceptance, exact locations are participant-only.

## 6. RLS policy SQL (authoritative)

Enable RLS on every table. Helper functions follow the mandatory SECURITY DEFINER rules (see below).

```sql
-- Is auth.uid() a participant of request $1?
-- Complies with mandatory SECURITY DEFINER rules: fixed search_path,
-- schema-qualified references, auth.uid() non-null check.
CREATE OR REPLACE FUNCTION public.is_participant(req uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.delivery_requests r
    WHERE r.id = req
      AND (r.requester_id = (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid())
           OR r.deliverer_id = (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid()))
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.is_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_participant(uuid) TO authenticated;
```

```sql
-- Does the caller have at least the specified admin/moderator role?
-- Role hierarchy: owner > admin > moderator. Higher roles satisfy lower-role checks.
-- The caller is derived from auth.uid() internally; callers must not supply actor IDs.
CREATE OR REPLACE FUNCTION public.has_admin_role(required_role public.admin_role_type DEFAULT 'moderator')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_profile_id uuid;
  caller_role public.admin_role_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT id INTO caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF caller_profile_id IS NULL THEN
    RETURN false;
  END IF;
  -- Check direct role first, then resolve hierarchy
  SELECT role INTO caller_role FROM public.admin_roles WHERE user_id = caller_profile_id;
  IF caller_role IS NULL THEN
    RETURN false;
  END IF;
  -- Hierarchy: owner > admin > moderator
  -- A higher role satisfies all lower-role requirements
  IF caller_role = 'owner' THEN
    RETURN true;  -- owner satisfies any requirement
  ELSIF caller_role = 'admin' THEN
    RETURN required_role IN ('admin', 'moderator');
  ELSIF caller_role = 'moderator' THEN
    RETURN required_role = 'moderator';
  END IF;
  RETURN false;
END;
$$;
  REVOKE EXECUTE ON FUNCTION public.has_admin_role(public.admin_role_type) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.has_admin_role(public.admin_role_type) TO authenticated;
```

```sql
-- Get caller's own admin role (safe wrapper for UI).
CREATE OR REPLACE FUNCTION public.get_own_admin_role()
RETURNS public.admin_role_type
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_profile_id uuid;
  result public.admin_role_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT p.id INTO caller_profile_id FROM public.profiles p WHERE p.auth_user_id = auth.uid();
  IF caller_profile_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT ar.role INTO result FROM public.admin_roles ar WHERE ar.user_id = caller_profile_id;
  RETURN result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_own_admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_own_admin_role() TO authenticated;

```

### profiles
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Base table is NOT directly readable or writable by clients.
-- Public reads use `public_profiles`; private self-read uses get_own_private_profile().
-- Profile mutations go through SECURITY DEFINER RPCs (create_profile, update_profile).
CREATE POLICY profiles_no_client_select ON profiles
  FOR SELECT USING (false);

CREATE POLICY profiles_no_client_insert ON profiles
  FOR INSERT WITH CHECK (false);

CREATE POLICY profiles_no_client_update ON profiles
  FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY profiles_no_client_delete ON profiles
  FOR DELETE USING (false);
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
```

### public_profiles (safe read view)
```sql
CREATE VIEW public_profiles WITH (security_invoker = false) AS
  SELECT id, display_name, department, hall, created_at
  FROM profiles
  WHERE is_verified = true AND is_suspended = false;

ALTER VIEW public_profiles OWNER TO postgres;
GRANT SELECT ON public_profiles TO authenticated;
```

### delivery_requests
```sql
ALTER TABLE delivery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY dr_select_open_or_participant ON delivery_requests
  FOR SELECT USING (
    -- Only verified, non-suspended users can browse open requests
    (status = 'open' AND (
      SELECT is_verified FROM public.profiles WHERE auth_user_id = auth.uid()
    ) = true
    AND (
      SELECT is_suspended FROM public.profiles WHERE auth_user_id = auth.uid()
    ) = false)
    -- Requesters and deliverables see their own requests regardless of status
    OR requester_id = (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid())
    OR deliverer_id = (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid())
  );

-- No client INSERT: all creation goes through create_request RPC (SECURITY DEFINER)
CREATE POLICY dr_no_client_insert ON delivery_requests
  FOR INSERT WITH CHECK (false);

CREATE POLICY dr_no_client_update ON delivery_requests
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY dr_no_client_delete ON delivery_requests
  FOR DELETE USING (false);
```

### delivery_events
```sql
ALTER TABLE delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY de_select_participant ON delivery_events
  FOR SELECT USING (is_participant(request_id));

CREATE POLICY de_no_client_write ON delivery_events
  FOR INSERT WITH CHECK (false);
CREATE POLICY de_no_client_update ON delivery_events
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY de_no_client_delete ON delivery_events
  FOR DELETE USING (false);
```

### messages
```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY msg_select_participant ON messages
  FOR SELECT USING (is_participant(request_id));

CREATE POLICY msg_no_client_insert ON messages
  FOR INSERT WITH CHECK (false);
CREATE POLICY msg_no_client_update ON messages
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY msg_no_client_delete ON messages
  FOR DELETE USING (false);
```

### ratings
```sql
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ratings_select_participant_or_ratee ON ratings
  FOR SELECT USING (
    is_participant(request_id)
    OR ratee_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = auth.uid())
  );

CREATE POLICY ratings_no_client_insert ON ratings
  FOR INSERT WITH CHECK (false);
CREATE POLICY ratings_no_client_update ON ratings
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY ratings_no_client_delete ON ratings
  FOR DELETE USING (false);
```

### reports
```sql
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Only admins/moderators can read reports (via has_admin_role in RPC, not direct SELECT)
CREATE POLICY reports_no_client_select ON reports
  FOR SELECT USING (false);

CREATE POLICY reports_no_client_insert ON reports
  FOR INSERT WITH CHECK (false);
CREATE POLICY reports_no_client_update ON reports
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY reports_no_client_delete ON reports
  FOR DELETE USING (false);
```

### admin_roles
```sql
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

-- No direct client access; all checks via has_admin_role() SECURITY DEFINER function
CREATE POLICY admin_roles_no_client_select ON admin_roles
  FOR SELECT USING (false);
CREATE POLICY admin_roles_no_client_insert ON admin_roles
  FOR INSERT WITH CHECK (false);
CREATE POLICY admin_roles_no_client_update ON admin_roles
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY admin_roles_no_client_delete ON admin_roles
  FOR DELETE USING (false);
```

### audit_log
```sql
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_no_client ON audit_log
  FOR ALL USING (false) WITH CHECK (false);
```

### rate_limit_events
```sql
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;
-- No client access; only RPCs via SECURITY DEFINER can read/write
CREATE POLICY rate_limit_no_client ON rate_limit_events
  FOR ALL USING (false) WITH CHECK (false);
```

### notification_outbox
```sql
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
-- No client access; processed by server-side mechanism
CREATE POLICY notification_no_client ON notification_outbox
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.notification_outbox FROM PUBLIC, anon, authenticated;
```

### rate_limit_policies
```sql
ALTER TABLE rate_limit_policies ENABLE ROW LEVEL SECURITY;
-- No client access — policies are read only by the internal check_rate_limit function.
-- Clients cannot view, insert, update, or delete rate-limit policy definitions.
CREATE POLICY rate_limit_policies_no_client ON rate_limit_policies
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.rate_limit_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.rate_limit_events_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.notification_outbox_id_seq FROM PUBLIC, anon, authenticated;
```

### Mandatory SECURITY DEFINER implementation rules

Every SECURITY DEFINER function in this schema MUST follow these rules:

1. **Fixed safe `search_path`:** set to empty string at function creation time (`SET search_path = ''`).
2. **Schema-qualified application objects:** tables, application types, and user-defined functions are schema-qualified (for example, `public.profiles`). PostgreSQL built-ins from implicit `pg_catalog` may remain unqualified.
3. **Identity source matches invocation:** client-callable functions return `UNAUTHENTICATED` when `auth.uid()` is null. Trigger-only functions derive identity from `OLD`/`NEW`; service-only worker functions use a server-generated worker token and are not client-executable.
4. **Explicit authorization inside client/server operations:** do not rely solely on route guards. Trigger-only invariant functions are not authorization endpoints and must be revoked from API roles.
5. **`REVOKE EXECUTE FROM PUBLIC`:** after creation, revoke execute from `PUBLIC`.
6. **Explicit `GRANT EXECUTE`:** grant only to the intended role(s), or no API role for trigger-only functions. Outbox worker functions are granted only to `service_role`.
7. **Least-privileged function owner:** the function owner should be a dedicated role with only the minimum privileges needed.
8. **No trust in caller-provided IDs:** never allow caller to specify `requester_id`, `sender_id`, `rater_id`, `reporter_id`; always derive from `auth.uid()`.
9. **Predictable structured errors:** always return `{ ok: false, code: 'STABLE_CODE', message: '...' }` on failure; do not leak SQLSTATE or internal details.
10. **Audit logging for security-sensitive operations:** mutation RPCs and sensitive reads declare their audit behavior in `05`; account deletion writes request and completion events without copying deleted PII into metadata.
11. **SECURITY DEFINER uses database function owner's privileges, not the Supabase service-role API key.**

> **Clarification:** A `SECURITY DEFINER` function executes with the privileges of its **owner** (a PostgreSQL role), not with the caller's session role and not with the Supabase `service_role` API key.

## 7. Provisional post-MVP schema (matching) — NOT for MVP

```sql
CREATE TABLE traveler_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  traveler_id uuid NOT NULL REFERENCES profiles(id),
  origin text NOT NULL,
  destination text NOT NULL,
  available_from timestamptz NOT NULL,
  available_to timestamptz NOT NULL,
  notes text
);
ALTER TABLE traveler_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.traveler_availability FROM PUBLIC, anon, authenticated;
```

No client policy is defined because this table is outside MVP; deny-all remains in force until a post-MVP ADR defines its authorization model.

## 8. Retention & deletion

- **Authoritative deletion path:** account removal is a trusted server operation named `admin_delete_or_anonymize_user`. The scheduled/admin Edge Function verifies the caller as `admin` or `owner`, resolves the target profile to its Auth user, and calls Supabase Auth Admin `deleteUser`. It never exposes the server credential to the browser. The Auth deletion executes the database trigger below in the same database transaction.
- **Why profile-only anonymization is insufficient:** merely setting `profiles.auth_user_id = NULL` leaves the Auth account able to authenticate. The Auth user must be deleted to revoke refresh capability; existing access tokens remain valid until expiry, so sensitive RPCs also require a live profile lookup and suspension/verification checks.
- **Active-delivery restriction:** the server operation preflights active deliveries, and the trigger repeats the check under a profile row lock. A target involved in an `accepted` or `in_progress` delivery causes `ACTIVE_DELIVERY_EXISTS`; the Auth deletion rolls back.
- **Idempotency:** if the Auth user no longer exists and the retained profile is already anonymized, a retry returns success. Other missing targets return `TARGET_NOT_FOUND`.

```sql
-- Trigger-only function. It does not call an admin RPC and does not depend on auth.uid().
CREATE OR REPLACE FUNCTION public.handle_auth_user_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT p.id
  INTO v_profile_id
  FROM public.profiles AS p
  WHERE p.auth_user_id = OLD.id
  FOR UPDATE;

  IF v_profile_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.delivery_requests AS r
    WHERE (r.requester_id = v_profile_id OR r.deliverer_id = v_profile_id)
      AND r.status IN ('accepted', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_DELIVERY_EXISTS';
  END IF;

  UPDATE public.profiles
  SET auth_user_id = NULL,
      student_id = NULL,
      phone = NULL,
      display_name = 'Deleted user',
      department = NULL,
      hall = NULL,
      is_verified = false,
      is_suspended = true,
      updated_at = clock_timestamp()
  WHERE id = v_profile_id;

  -- Do not copy prior PII into the audit log.
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (NULL, 'profile_anonymized', 'profile', v_profile_id,
          jsonb_build_object('source', 'auth_user_before_delete'));

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_auth_user_before_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_auth_user_before_delete
BEFORE DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_before_delete();
```

- **Server-operation authorization:** the Edge Function validates the caller JWT and calls `authorize_admin_user_deletion(target_profile_id)` through a caller-scoped database client. That RPC requires admin+, locks the target profile, repeats the active-delivery check, records `account_deletion_requested`, and returns the target Auth ID only to the trusted function invocation. The Edge Function then uses a separate server-only client for Auth Admin deletion. The trigger is the final race-safe invariant check, not the authorization mechanism.
- **Audit:** the server operation records `account_deletion_requested` with the admin profile ID; the trigger records `profile_anonymized` without copying phone, name, email, or student ID into audit metadata.
- **Errors:** `UNAUTHENTICATED`, `ADMIN_REQUIRED`, `TARGET_NOT_FOUND`, `ACTIVE_DELIVERY_EXISTS`, `AUTH_DELETE_FAILED`.

- **Historical records preserved:** `delivery_requests.requester_id`/`deliverer_id`, `delivery_events.actor_id`, `messages.sender_id`, `ratings.rater_id`/`ratee_id`, `reports.reporter_id`/`target_id` all remain pointing at the **distinct** anonymized profile UUID. This preserves `rater_id <> ratee_id`, `reporter_id <> target_id`, and `deliverer_id <> requester_id` (enforced by table CHECK constraints).

- **`audit_log` integrity after anonymization:** existing audit rows retain their profile UUID because the profile is updated, not deleted. The trigger-generated `profile_anonymized` event uses `actor_id = NULL` because it is a system action and identifies the retained profile through `target_id`; it stores no prior PII.

- **`public_profiles` exclusion:** the view filters `WHERE is_verified = true AND is_suspended = false`, so anonymized profiles (`is_suspended=true`) are automatically excluded from public browse.

- **Retention window:** proposed 12 months post-completion, then anonymize non-audit records. Requires legal/student-body approval. See `10` Q3.

- **Required tests:** verify the retained profile UUID stays distinct; verify `rater_id <> ratee_id` after both parties are anonymized; verify active-delivery deletion rolls back; verify all PII fields are cleared; verify `public_profiles` excludes the profile; verify existing audit links remain and the new system event contains no PII; verify Auth deletion invokes `handle_auth_user_before_delete`; verify a deleted Auth account cannot recreate a profile with an old token.
- **Platform reference:** [Supabase user deletion and remaining-JWT behavior](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users).

## 9. Public rating aggregates (safe design)

- **MVP default (Option A):** do not expose public averages. Show ratings only to participants and to the ratee themselves (`03` §6 `ratings_select_participant_or_ratee`).
- **Future option (Option B):** if public averages are later approved, create a SECURITY DEFINER function `public.get_user_rating_summary(target_id uuid)` that returns `{ count, avg_score }` only if `count >= MINIMUM_COUNT` (proposed 3). Never expose individual private ratings through the aggregate.
- **Decision:** requires human approval (`10` Q10). Default to Option A for MVP safety.

## 10. Cross-references

- State machine transitions & actors: ADR-0004, `05`.
- Profile RPCs: `05-api-and-business-operations.md` §3.1–§3.3.
  - Report/admin schema & RPCs: `05-api-and-business-operations.md` §3.10–§3.13, `04` §6.
- RLS rationale, threats, negative tests: `04-security-and-threat-model.md` §4–§5.
- Realtime over these tables: `06-realtime-design.md`.
- RPC contracts that write these tables: `05-api-and-business-operations.md`.
- Retention/deletion policy: `10-open-questions.md` Q3.
