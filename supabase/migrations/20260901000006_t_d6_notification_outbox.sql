-- T-D6: Notification outbox worker functions (docs/planning/03 §3.10)
-- Claim/ack/fail trio consumed by the scheduled process-notification-outbox
-- Edge Function. At-least-once delivery with deduplication_key idempotency,
-- FOR UPDATE SKIP LOCKED claiming, stale-lease recovery, retry/backoff.
-- Grants: service_role ONLY — never client-executable.

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