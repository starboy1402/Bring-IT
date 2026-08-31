-- T-D1: Initial schema (docs/planning/03-data-model.md §2–§3)
-- Enums, tables, constraints, indexes. RLS + helpers follow in T-D2.

-- ============ Enums (03 §2) ============
CREATE TYPE public.delivery_status AS ENUM
  ('open','accepted','in_progress','delivered','cancelled');

CREATE TYPE public.urgency_level AS ENUM ('low','medium','high');

CREATE TYPE public.rating_role AS ENUM ('as_requester','as_deliverer');

CREATE TYPE public.participant_role AS ENUM ('requester','deliverer');

CREATE TYPE public.report_status AS ENUM ('open','resolved','dismissed');

CREATE TYPE public.admin_role_type AS ENUM ('owner','admin','moderator');

-- ============ profiles (03 §3.1) ============
CREATE TABLE public.profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  student_id      text,
  department      text,
  hall            text,
  phone           text,
  is_verified     boolean NOT NULL DEFAULT false,
  is_suspended    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_student_id_format
    CHECK (student_id IS NULL OR student_id ~ '^[A-Za-z0-9]{4,20}$')
);

-- ============ delivery_requests (03 §3.2) ============
CREATE TABLE public.delivery_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  deliverer_id      uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title             text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description       text CHECK (char_length(description) <= 1000),
  pickup_location   text NOT NULL CHECK (char_length(pickup_location) BETWEEN 3 AND 200),
  dropoff_location  text NOT NULL CHECK (char_length(dropoff_location) BETWEEN 3 AND 200),
  urgency           public.urgency_level NOT NULL DEFAULT 'medium',
  reward_suggestion numeric(10,2) CHECK (reward_suggestion IS NULL OR reward_suggestion >= 0),
  status            public.delivery_status NOT NULL DEFAULT 'open',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT no_self_delivery CHECK (deliverer_id IS NULL OR deliverer_id <> requester_id)
);

-- Browse index: newest open requests first, tie-broken by id
CREATE INDEX idx_requests_status_created ON public.delivery_requests (status, created_at DESC, id DESC)
  WHERE status = 'open';
CREATE INDEX idx_requests_requester ON public.delivery_requests (requester_id);
CREATE INDEX idx_requests_deliverer ON public.delivery_requests (deliverer_id);

-- ============ delivery_events (03 §3.3) ============
CREATE TABLE public.delivery_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id  uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  from_status public.delivery_status,
  to_status   public.delivery_status NOT NULL,
  note        text CHECK (char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_request_time ON public.delivery_events (request_id, created_at ASC, id ASC);

-- ============ messages (03 §3.4) ============
CREATE TABLE public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_request_time ON public.messages (request_id, created_at ASC, id ASC);

-- ============ ratings (03 §3.5) ============
CREATE TABLE public.ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  rater_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ratee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role         public.rating_role NOT NULL,
  score        smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment      text CHECK (char_length(comment) <= 500),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ratings_once_per_perspective
    UNIQUE (request_id, rater_id, role),
  CONSTRAINT ratings_distinct_parties
    CHECK (rater_id <> ratee_id)
);
CREATE INDEX idx_ratings_ratee ON public.ratings (ratee_id);

-- ============ reports (03 §3.6) ============
CREATE TABLE public.reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  reporter_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason        text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 200),
  description   text CHECK (char_length(description) <= 1000),
  status        public.report_status NOT NULL DEFAULT 'open',
  resolution    text,
  resolved_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
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
CREATE INDEX idx_reports_request ON public.reports (request_id);
CREATE INDEX idx_reports_target ON public.reports (target_id);
CREATE INDEX idx_reports_status_created ON public.reports (status, created_at ASC, id ASC);

-- ============ admin_roles (03 §3.7) ============
CREATE TABLE public.admin_roles (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         public.admin_role_type NOT NULL,
  granted_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at   timestamptz NOT NULL DEFAULT now()
);

-- ============ audit_log (03 §3.8) ============
CREATE TABLE public.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text,
  target_id   uuid,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============ rate_limit_events + policies (03 §3.9) ============
CREATE TABLE public.rate_limit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  operation   text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limit_actor_op_window
  ON public.rate_limit_events (actor_id, operation, occurred_at);

CREATE TABLE public.rate_limit_policies (
  operation    text PRIMARY KEY,
  max_count    integer NOT NULL CHECK (max_count > 0),
  window_secs  bigint NOT NULL CHECK (window_secs > 0),
  description  text
);

-- ============ notification_outbox (03 §3.10) ============
CREATE TABLE public.notification_outbox (
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
  ON public.notification_outbox (next_attempt_at ASC, attempts ASC, id ASC)
  WHERE status = 'pending';
CREATE INDEX idx_notification_outbox_stale_claim
  ON public.notification_outbox (claimed_at ASC, id ASC)
  WHERE status = 'processing';
CREATE INDEX idx_notification_outbox_status
  ON public.notification_outbox (status, created_at);

-- ============ Post-MVP placeholder, deny-all (03 §7) ============
CREATE TABLE public.traveler_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  traveler_id uuid NOT NULL REFERENCES public.profiles(id),
  origin text NOT NULL,
  destination text NOT NULL,
  available_from timestamptz NOT NULL,
  available_to timestamptz NOT NULL,
  notes text
);