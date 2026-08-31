-- T-D4: Profile & request RPCs (docs/planning/05 §3.1–§3.4, 03 §3.1–§3.2)
-- All RPCs return { ok: true, data } or { ok: false, code, message } (05 §2).
-- SECURITY DEFINER rules per 03 §6 / 05 §3.14.

-- Shared stable-error helper (plain function, no elevated privileges).
CREATE OR REPLACE FUNCTION public.rpc_error(p_code text, p_message text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('ok', false, 'code', p_code, 'message', p_message)
$$;

-- ============ create_profile (05 §3.1) ============
-- Idempotent: insert-or-return-existing for the same auth.uid().
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

  -- Trusted verification path (T-A2 / ADR-0003, approved Q1 default):
  -- verified iff the auth email is confirmed AND its domain is an approved
  -- CUET domain. Derived server-side from auth.users; never client input.
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

-- ============ update_profile (05 §3.2) ============
-- Only display_name, department, hall, phone are user-editable.
-- is_verified / is_suspended / student_id are immutable here.
CREATE OR REPLACE FUNCTION public.update_profile(
  p_display_name text,
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
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;

  IF p_display_name IS NULL OR char_length(p_display_name) < 2 OR char_length(p_display_name) > 60 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'display_name must be 2-60 characters.');
  END IF;
  IF p_phone IS NOT NULL AND char_length(p_phone) > 20 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'phone must be at most 20 characters.');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN public.rpc_error('PROFILE_NOT_FOUND', 'Create a profile first.');
  END IF;

  UPDATE public.profiles
  SET display_name = p_display_name,
      department   = p_department,
      hall         = p_hall,
      phone        = p_phone,
      updated_at   = now()
  WHERE id = v_profile_id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_profile_id, 'profile_updated', 'profile', v_profile_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_profile(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_profile(text, text, text, text) TO authenticated;

-- ============ get_own_private_profile (05 §3.3) ============
CREATE OR REPLACE FUNCTION public.get_own_private_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_admin_role public.admin_role_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN public.rpc_error('PROFILE_NOT_FOUND', 'Create a profile first.');
  END IF;

  SELECT ar.role INTO v_admin_role FROM public.admin_roles ar WHERE ar.user_id = v_profile.id;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', to_jsonb(v_profile) - 'auth_user_id',
    'admin_role', v_admin_role
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_own_private_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_own_private_profile() TO authenticated;

-- ============ create_request (05 §3.4) ============
-- requester_id always derived from caller; status always 'open'; deliverer_id NULL.
CREATE OR REPLACE FUNCTION public.create_request(
  p_title text,
  p_description text,
  p_pickup_location text,
  p_dropoff_location text,
  p_urgency public.urgency_level,
  p_reward_suggestion numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_request_id uuid;
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

  IF NOT public.check_rate_limit('create_request') THEN
    RETURN public.rpc_error('RATE_LIMITED', 'Too many requests. Try again later.');
  END IF;

  BEGIN
    INSERT INTO public.delivery_requests (
      requester_id, title, description, pickup_location, dropoff_location,
      urgency, reward_suggestion, status
    ) VALUES (
      v_profile.id, p_title, p_description, p_pickup_location, p_dropoff_location,
      p_urgency, p_reward_suggestion, 'open'
    ) RETURNING id INTO v_request_id;

    INSERT INTO public.delivery_events (request_id, actor_id, from_status, to_status)
    VALUES (v_request_id, v_profile.id, NULL, 'open');

    INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
    VALUES (v_profile.id, 'request_created', 'delivery_request', v_request_id);
  EXCEPTION WHEN check_violation THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'Request fields failed validation.');
  END;

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'status', 'open');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_request(text, text, text, text, public.urgency_level, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_request(text, text, text, text, public.urgency_level, numeric) TO authenticated;

-- ============ Rate-limit policy seeds (03 §3.9) ============
INSERT INTO public.rate_limit_policies (operation, max_count, window_secs, description) VALUES
  ('create_request', 10, 300, '10 per 5 min'),
  ('send_message',   20,  60, '20 per minute'),
  ('submit_report',   5, 300, '5 per 5 min')
ON CONFLICT (operation) DO NOTHING;