-- T-D5: Report & admin operations (docs/planning/05 §3.10–§3.13, 03 §3.6–§3.8, §8)
-- submit_report, get_delivery_contact, admin report reads/resolution,
-- admin suspend/unsuspend, admin_cancel_delivery, and account deletion
-- (authorize_admin_user_deletion RPC + auth.users BEFORE DELETE trigger).

-- ============ submit_report (05 §3.10, 03 §3.6.1) ============
-- Server-controlled reporter_id; target must be a participant; rate-limited;
-- transactional notification_outbox enqueue with dedup key report_created:<id>.
CREATE OR REPLACE FUNCTION public.submit_report(
  p_request_id uuid,
  p_target_id uuid,
  p_reason text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_request public.delivery_requests%ROWTYPE;
  v_report_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN public.rpc_error('PROFILE_NOT_FOUND', 'Create a profile first.');
  END IF;
  IF v_profile.is_verified = false THEN
    RETURN public.rpc_error('NOT_VERIFIED', 'Verify your student identity first.');
  END IF;
  IF v_profile.is_suspended = true THEN
    RETURN public.rpc_error('SUSPENDED', 'Your account is suspended.');
  END IF;

  IF p_reason IS NULL OR char_length(p_reason) < 3 OR char_length(p_reason) > 200 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'reason must be 3-200 characters.');
  END IF;
  IF p_description IS NOT NULL AND char_length(p_description) > 1000 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'description must be at most 1000 characters.');
  END IF;
  IF p_target_id IS NULL OR p_target_id = v_profile.id THEN
    RETURN public.rpc_error('REPORT_NOT_ALLOWED', 'You cannot report yourself.');
  END IF;

  SELECT * INTO v_request FROM public.delivery_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN public.rpc_error('DELIVERY_NOT_FOUND', 'Request not found.');
  END IF;

  -- Reporter must be able to view the request: open row, or a participant.
  IF NOT (v_request.status = 'open'
          OR v_request.requester_id = v_profile.id
          OR v_request.deliverer_id = v_profile.id) THEN
    RETURN public.rpc_error('REPORT_NOT_ALLOWED', 'You cannot report on this delivery.');
  END IF;

  -- Target must be a participant of the request.
  IF p_target_id <> v_request.requester_id
     AND (v_request.deliverer_id IS NULL OR p_target_id <> v_request.deliverer_id) THEN
    RETURN public.rpc_error('REPORT_NOT_ALLOWED', 'Target is not a participant of this delivery.');
  END IF;

  IF NOT public.check_rate_limit('submit_report') THEN
    RETURN public.rpc_error('RATE_LIMITED', 'Too many reports. Try again later.');
  END IF;

  BEGIN
    INSERT INTO public.reports (request_id, reporter_id, target_id, reason, description, status)
    VALUES (p_request_id, v_profile.id, p_target_id, p_reason, p_description, 'open')
    RETURNING id INTO v_report_id;

    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, meta)
    VALUES (v_profile.id, 'report_created', 'report', v_report_id,
            jsonb_build_object('request_id', p_request_id, 'target_id', p_target_id));

    -- Transactional enqueue (03 §3.10): same transaction as the business event.
    INSERT INTO public.notification_outbox (event_type, payload, deduplication_key)
    VALUES (
      'report_created',
      jsonb_build_object(
        'report_id', v_report_id,
        'request_id', p_request_id,
        'reporter_id', v_profile.id,
        'target_id', p_target_id
      ),
      'report_created:' || v_report_id
    );
  EXCEPTION WHEN check_violation THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'Report fields failed validation.');
  END;

  RETURN jsonb_build_object('ok', true, 'report_id', v_report_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_report(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_report(uuid, uuid, text, text) TO authenticated;

-- ============ get_delivery_contact (05 §3.11) ============
-- Participant-only, status-gated disclosure of the counterpart's phone.
-- Audits contact_accessed WITHOUT copying the phone value into audit metadata.
CREATE OR REPLACE FUNCTION public.get_delivery_contact(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_is_verified boolean;
  v_is_suspended boolean;
  v_request public.delivery_requests%ROWTYPE;
  v_counterpart public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;

  SELECT id, is_verified, is_suspended
    INTO v_profile_id, v_is_verified, v_is_suspended
  FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN public.rpc_error('PROFILE_NOT_FOUND', 'Create a profile first.');
  END IF;
  IF v_is_verified = false THEN
    RETURN public.rpc_error('NOT_VERIFIED', 'Verify your student identity first.');
  END IF;
  IF v_is_suspended = true THEN
    RETURN public.rpc_error('SUSPENDED', 'Your account is suspended.');
  END IF;

  SELECT * INTO v_request FROM public.delivery_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN public.rpc_error('DELIVERY_NOT_FOUND', 'Request not found.');
  END IF;

  IF v_profile_id <> v_request.requester_id AND v_profile_id <> v_request.deliverer_id THEN
    RETURN public.rpc_error('NOT_PARTICIPANT', 'Only participants can view contact details.');
  END IF;

  IF v_request.status NOT IN ('accepted', 'in_progress') THEN
    RETURN public.rpc_error('CONTACT_NOT_AVAILABLE', 'Contact is only shared during an active delivery.');
  END IF;

  IF v_profile_id = v_request.requester_id THEN
    SELECT * INTO v_counterpart FROM public.profiles WHERE id = v_request.deliverer_id;
  ELSE
    SELECT * INTO v_counterpart FROM public.profiles WHERE id = v_request.requester_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (v_profile_id, 'contact_accessed', 'delivery_request', p_request_id,
          jsonb_build_object('counterpart_id', v_counterpart.id)); -- never copy phone

  RETURN jsonb_build_object(
    'ok', true,
    'contact', jsonb_build_object('display_name', v_counterpart.display_name, 'phone', v_counterpart.phone)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_delivery_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_delivery_contact(uuid) TO authenticated;

-- ============ admin_list_reports (05 §3.12) — moderator+ ============
-- Keyset pagination on (created_at ASC, id ASC); one status partition per call.
CREATE OR REPLACE FUNCTION public.admin_list_reports(
  p_status public.report_status DEFAULT 'open',
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows_json jsonb;
  v_has_more boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;
  IF NOT public.has_admin_role('moderator') THEN
    RETURN public.rpc_error('ADMIN_REQUIRED', 'Moderator role required.');
  END IF;
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 50 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'page_size must be between 1 and 50.');
  END IF;
  IF (p_after_created_at IS NULL) <> (p_after_id IS NULL) THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'Both cursor fields must be NULL or both set.');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at ASC, p.id ASC), '[]'::jsonb)
  INTO v_rows_json
  FROM (
    SELECT r.*
    FROM public.reports r
    WHERE r.status = p_status
      AND (p_after_created_at IS NULL
           OR (r.created_at, r.id) > (p_after_created_at, p_after_id))
    ORDER BY r.created_at ASC, r.id ASC
    LIMIT p_page_size
  ) p;

  SELECT EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.status = p_status
      AND (p_after_created_at IS NULL
           OR (r.created_at, r.id) > (p_after_created_at, p_after_id))
    ORDER BY r.created_at ASC, r.id ASC
    OFFSET p_page_size LIMIT 1
  ) INTO v_has_more;

  RETURN jsonb_build_object('ok', true, 'reports', v_rows_json, 'has_more', v_has_more);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_reports(public.report_status, timestamptz, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_reports(public.report_status, timestamptz, uuid, integer) TO authenticated;

-- ============ admin_get_report (05 §3.12) — moderator+ ============
CREATE OR REPLACE FUNCTION public.admin_get_report(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.reports%ROWTYPE;
  v_reporter_name text;
  v_target_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;
  IF NOT public.has_admin_role('moderator') THEN
    RETURN public.rpc_error('ADMIN_REQUIRED', 'Moderator role required.');
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN public.rpc_error('REPORT_NOT_FOUND', 'Report not found.');
  END IF;

  SELECT COALESCE(display_name, 'Deleted user') INTO v_reporter_name
  FROM public.profiles WHERE id = v_report.reporter_id;
  IF NOT FOUND THEN
    v_reporter_name := 'Deleted user';
  END IF;

  SELECT COALESCE(display_name, 'Deleted user') INTO v_target_name
  FROM public.profiles WHERE id = v_report.target_id;
  IF NOT FOUND THEN
    v_target_name := 'Deleted user';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'report', to_jsonb(v_report) || jsonb_build_object(
      'reporter_display_name', v_reporter_name,
      'target_display_name', v_target_name
    )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_get_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_report(uuid) TO authenticated;

-- ============ admin_resolve_report (05 §3.13) — moderator+ ============
-- open → resolved|dismissed. Retry-idempotent for an identical outcome/resolution.
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id uuid,
  p_outcome public.report_status,
  p_resolution text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_report public.reports%ROWTYPE;
  v_norm text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;
  IF NOT public.has_admin_role('moderator') THEN
    RETURN public.rpc_error('ADMIN_REQUIRED', 'Moderator role required.');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();

  IF p_outcome IS NULL OR p_outcome = 'open' THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'outcome must be resolved or dismissed.');
  END IF;
  IF p_resolution IS NULL OR char_length(p_resolution) < 1 OR char_length(p_resolution) > 500 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'resolution must be 1-500 characters.');
  END IF;
  v_norm := lower(btrim(p_resolution));

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.rpc_error('REPORT_NOT_FOUND', 'Report not found.');
  END IF;

  -- Retry-idempotent: identical stored outcome + normalized resolution succeed.
  IF v_report.status <> 'open' THEN
    IF v_report.status = p_outcome
       AND lower(btrim(v_report.resolution)) = v_norm THEN
      RETURN jsonb_build_object('ok', true, 'report_id', p_report_id, 'status', v_report.status);
    END IF;
    RETURN public.rpc_error('REPORT_NOT_OPEN', 'Report is already resolved.');
  END IF;

  UPDATE public.reports
  SET status = p_outcome,
      resolution = p_resolution,
      resolved_by = v_profile_id,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_report_id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_profile_id, 'report_resolved', 'report', p_report_id);

  RETURN jsonb_build_object('ok', true, 'report_id', p_report_id, 'status', p_outcome);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid, public.report_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, public.report_status, text) TO authenticated;

-- ============ admin_suspend_user (05 §3.13) — admin+ ============
CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_target_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_target_exists boolean;
  v_was_suspended boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;
  IF NOT public.has_admin_role('admin') THEN
    RETURN public.rpc_error('ADMIN_REQUIRED', 'Admin role required.');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();

  IF p_reason IS NULL OR char_length(p_reason) < 3 OR char_length(p_reason) > 200 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'reason must be 3-200 characters.');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_id),
         COALESCE((SELECT is_suspended FROM public.profiles WHERE id = p_target_id), false)
    INTO v_target_exists, v_was_suspended;
  IF NOT v_target_exists THEN
    RETURN public.rpc_error('TARGET_NOT_FOUND', 'Target user not found.');
  END IF;

  -- Idempotent: re-suspending is a no-op.
  IF v_was_suspended THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.profiles
  SET is_suspended = true, updated_at = now()
  WHERE id = p_target_id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (v_profile_id, 'user_suspended', 'profile', p_target_id,
          jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text) TO authenticated;

-- ============ admin_unsuspend_user (05 §3.13) — admin+ ============
CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_target_exists boolean;
  v_was_suspended boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;
  IF NOT public.has_admin_role('admin') THEN
    RETURN public.rpc_error('ADMIN_REQUIRED', 'Admin role required.');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_id),
         COALESCE((SELECT is_suspended FROM public.profiles WHERE id = p_target_id), false)
    INTO v_target_exists, v_was_suspended;
  IF NOT v_target_exists THEN
    RETURN public.rpc_error('TARGET_NOT_FOUND', 'Target user not found.');
  END IF;

  -- Idempotent: re-unsuspending is a no-op.
  IF NOT v_was_suspended THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.profiles
  SET is_suspended = false, updated_at = now()
  WHERE id = p_target_id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_profile_id, 'user_unsuspended', 'profile', p_target_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid) TO authenticated;

-- ============ admin_cancel_delivery (05 §3.13, 03 §4) — moderator+ ============
-- The ONLY way to cancel once in_progress; any non-terminal state is cancellable.
CREATE OR REPLACE FUNCTION public.admin_cancel_delivery(p_request_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_request public.delivery_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;
  IF NOT public.has_admin_role('moderator') THEN
    RETURN public.rpc_error('ADMIN_REQUIRED', 'Moderator role required.');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();

  IF p_reason IS NULL OR char_length(p_reason) < 3 OR char_length(p_reason) > 500 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'reason must be 3-500 characters.');
  END IF;

  SELECT * INTO v_request FROM public.delivery_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.rpc_error('DELIVERY_NOT_FOUND', 'Request not found.');
  END IF;

  -- Idempotent retry against an existing admin cancellation.
  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
  END IF;
  IF v_request.status = 'delivered' THEN
    RETURN public.rpc_error('INVALID_TRANSITION', 'A delivered request cannot be cancelled.');
  END IF;

  UPDATE public.delivery_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.delivery_events (request_id, actor_id, from_status, to_status, note)
  VALUES (p_request_id, v_profile_id, v_request.status, 'cancelled', p_reason);

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (v_profile_id, 'admin_cancel', 'delivery_request', p_request_id,
          jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_delivery(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cancel_delivery(uuid, text) TO authenticated;

-- ============ authorize_admin_user_deletion (03 §8) — admin+ ============
-- Preflight only: locks the target profile, rejects active deliveries, records
-- the deletion request, and returns the Auth ID to the trusted Edge Function.
CREATE OR REPLACE FUNCTION public.authorize_admin_user_deletion(p_target_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_target public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;
  IF NOT public.has_admin_role('admin') THEN
    RETURN public.rpc_error('ADMIN_REQUIRED', 'Admin role required.');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();

  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.rpc_error('TARGET_NOT_FOUND', 'Target user not found.');
  END IF;

  -- Fully anonymized profile with no Auth link → idempotent success.
  IF v_target.auth_user_id IS NULL AND v_target.is_suspended
     AND v_target.display_name = 'Deleted user'
     AND v_target.student_id IS NULL AND v_target.phone IS NULL
     AND v_target.department IS NULL AND v_target.hall IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_deleted', true);
  END IF;
  -- Auth link missing but profile not anonymized → inconsistent target.
  IF v_target.auth_user_id IS NULL THEN
    RETURN public.rpc_error('TARGET_NOT_FOUND', 'Target has no linked auth account.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.delivery_requests r
    WHERE (r.requester_id = v_target.id OR r.deliverer_id = v_target.id)
      AND r.status IN ('accepted', 'in_progress')
  ) THEN
    RETURN public.rpc_error('ACTIVE_DELIVERY_EXISTS', 'User has active deliveries.');
  END IF;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_profile_id, 'account_deletion_requested', 'profile', v_target.id);

  RETURN jsonb_build_object('ok', true, 'auth_user_id', v_target.auth_user_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.authorize_admin_user_deletion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_admin_user_deletion(uuid) TO authenticated;

-- ============ auth.users BEFORE DELETE trigger (03 §8) ============
-- Repeats the active-delivery check under a profile row lock, clears PII,
-- preserves the profile UUID, and writes a PII-free audit event.
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

DROP TRIGGER IF EXISTS trg_auth_user_before_delete ON auth.users;
CREATE TRIGGER trg_auth_user_before_delete
BEFORE DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_before_delete();

-- ============ create_profile guard (03 §8 security invariant) ============
-- A deleted Auth account must not be able to (re)create a profile with an old
-- JWT: after the trigger NULLs auth_user_id, the pre-deletion token still maps
-- to the deleted uid, so lookups by auth_user_id would miss. Requiring the
-- auth.users row to still exist closes that window (07 §5 deletion tests).
CREATE OR REPLACE FUNCTION public.create_profile(
  p_display_name text,
  p_student_id text,
  p_department text,
  p_hall text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_existing uuid;
  v_new_id uuid;
  v_email text;
  v_email_confirmed timestamptz;
  v_is_verified boolean := false;
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;

  -- T-D5 addition: reject tokens whose Auth account no longer exists.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_auth_uid) THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;

  IF p_display_name IS NULL OR char_length(p_display_name) < 2 OR char_length(p_display_name) > 60 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'display_name must be 2-60 characters.');
  END IF;
  IF p_student_id IS NOT NULL AND p_student_id !~ '^[A-Za-z0-9]{4,20}$' THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'student_id must be 4-20 alphanumeric characters.');
  END IF;
  IF p_phone IS NOT NULL AND char_length(p_phone) > 20 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'phone must be at most 20 characters.');
  END IF;

  SELECT id INTO v_existing FROM public.profiles WHERE auth_user_id = v_auth_uid;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'profile_id', v_existing, 'already_existed', true);
  END IF;

  -- Trusted verification path (T-A2 / ADR-0003, approved Q1 default).
  SELECT email, email_confirmed_at INTO v_email, v_email_confirmed
  FROM auth.users WHERE id = v_auth_uid;
  v_is_verified := v_email_confirmed IS NOT NULL
    AND public.is_approved_student_email(v_email);

  BEGIN
    INSERT INTO public.profiles (auth_user_id, display_name, student_id, department, hall, phone, is_verified)
    VALUES (v_auth_uid, p_display_name, p_student_id, p_department, p_hall, p_phone, v_is_verified)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_existing FROM public.profiles WHERE auth_user_id = v_auth_uid;
    RETURN jsonb_build_object('ok', true, 'profile_id', v_existing, 'already_existed', true);
  END;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_new_id, 'profile_created', 'profile', v_new_id);

  RETURN jsonb_build_object('ok', true, 'profile_id', v_new_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_profile(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_profile(text, text, text, text, text) TO authenticated;