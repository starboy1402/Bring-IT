-- T-D3: State-machine RPCs (docs/planning/05 §3.5–§3.9, ADR-0004)
-- Transitions use SELECT ... FOR UPDATE row locks. Client writes are blocked
-- by RLS; these SECURITY DEFINER RPCs are the only mutation path.

-- ============ accept_delivery (05 §3.5) ============
-- Atomic: exactly one deliverer; same-deliverer retry is idempotent.
CREATE OR REPLACE FUNCTION public.accept_delivery(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_is_suspended boolean;
  v_request public.delivery_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;

  SELECT id, is_suspended INTO v_profile_id, v_is_suspended
  FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN public.rpc_error('PROFILE_NOT_FOUND', 'Create a profile first.');
  END IF;
  IF v_is_suspended THEN
    RETURN public.rpc_error('SUSPENDED', 'Your account is suspended.');
  END IF;

  SELECT * INTO v_request FROM public.delivery_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.rpc_error('DELIVERY_NOT_FOUND', 'Request not found.');
  END IF;

  IF v_profile_id = v_request.requester_id THEN
    RETURN public.rpc_error('SELF_ACCEPT_FORBIDDEN', 'You cannot accept your own request.');
  END IF;

  IF v_request.deliverer_id IS NOT NULL OR v_request.status <> 'open' THEN
    IF v_request.deliverer_id = v_profile_id THEN
      -- Idempotent retry by the same deliverer.
      RETURN jsonb_build_object('ok', true, 'status', 'accepted');
    END IF;
    RETURN public.rpc_error('ALREADY_ACCEPTED', 'Another deliverer already accepted this request.');
  END IF;

  UPDATE public.delivery_requests
  SET deliverer_id = v_profile_id,
      status = 'accepted',
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.delivery_events (request_id, actor_id, from_status, to_status)
  VALUES (p_request_id, v_profile_id, 'open', 'accepted');

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_profile_id, 'accept', 'delivery_request', p_request_id);

  RETURN jsonb_build_object('ok', true, 'status', 'accepted');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accept_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_delivery(uuid) TO authenticated;

-- ============ advance_delivery (05 §3.6) ============
-- accepted → in_progress (deliverer only); in_progress → delivered (deliverer only).
CREATE OR REPLACE FUNCTION public.advance_delivery(p_request_id uuid, p_to_status public.delivery_status)
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

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN public.rpc_error('PROFILE_NOT_FOUND', 'Create a profile first.');
  END IF;

  SELECT * INTO v_request FROM public.delivery_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.rpc_error('DELIVERY_NOT_FOUND', 'Request not found.');
  END IF;

  IF v_profile_id <> v_request.deliverer_id THEN
    RETURN public.rpc_error('NOT_PARTICIPANT', 'Only the assigned deliverer can advance the delivery.');
  END IF;

  -- Idempotent retry: current state already equals the requested target.
  IF v_request.status = p_to_status THEN
    RETURN jsonb_build_object('ok', true, 'status', p_to_status);
  END IF;

  IF NOT (
    (v_request.status = 'accepted' AND p_to_status = 'in_progress')
    OR (v_request.status = 'in_progress' AND p_to_status = 'delivered')
  ) THEN
    RETURN public.rpc_error('INVALID_TRANSITION', 'Transition not allowed.');
  END IF;

  UPDATE public.delivery_requests
  SET status = p_to_status,
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.delivery_events (request_id, actor_id, from_status, to_status)
  VALUES (p_request_id, v_profile_id, v_request.status, p_to_status);

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_profile_id, 'advance', 'delivery_request', p_request_id);

  RETURN jsonb_build_object('ok', true, 'status', p_to_status);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.advance_delivery(uuid, public.delivery_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_delivery(uuid, public.delivery_status) TO authenticated;

-- ============ cancel_delivery (05 §3.7) ============
-- Requester may cancel in open/accepted; deliverer only in accepted.
-- After in_progress → CANCEL_NOT_ALLOWED (admin flow only).
CREATE OR REPLACE FUNCTION public.cancel_delivery(p_request_id uuid, p_reason text)
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

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN public.rpc_error('PROFILE_NOT_FOUND', 'Create a profile first.');
  END IF;

  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'Reason must be at most 500 characters.');
  END IF;

  SELECT * INTO v_request FROM public.delivery_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.rpc_error('DELIVERY_NOT_FOUND', 'Request not found.');
  END IF;

  -- Idempotent retry: same actor against its existing cancellation.
  IF v_request.status = 'cancelled' THEN
    IF v_profile_id = v_request.requester_id OR v_profile_id = v_request.deliverer_id THEN
      RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
    END IF;
    RETURN public.rpc_error('NOT_PARTICIPANT', 'Only participants can cancel.');
  END IF;

  IF v_profile_id = v_request.requester_id THEN
    IF v_request.status NOT IN ('open', 'accepted') THEN
      RETURN public.rpc_error('CANCEL_NOT_ALLOWED', 'Requester cannot cancel after pickup has started.');
    END IF;
  ELSIF v_profile_id = v_request.deliverer_id THEN
    IF v_request.status <> 'accepted' THEN
      RETURN public.rpc_error('CANCEL_NOT_ALLOWED', 'Deliverer can only cancel before pickup.');
    END IF;
  ELSE
    RETURN public.rpc_error('NOT_PARTICIPANT', 'Only participants can cancel.');
  END IF;

  UPDATE public.delivery_requests
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.delivery_events (request_id, actor_id, from_status, to_status, note)
  VALUES (p_request_id, v_profile_id, v_request.status, 'cancelled', p_reason);

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (v_profile_id, 'cancel', 'delivery_request', p_request_id,
          jsonb_build_object('from_status', v_request.status));

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_delivery(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_delivery(uuid, text) TO authenticated;

-- ============ send_message (05 §3.8) ============
-- Participant-only; sender derived from caller; rate-limited.
CREATE OR REPLACE FUNCTION public.send_message(p_request_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_message_id uuid;
  v_created_at timestamptz;
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

  IF NOT public.is_participant(p_request_id) THEN
    RETURN public.rpc_error('NOT_PARTICIPANT', 'Only participants can send messages.');
  END IF;

  IF p_content IS NULL OR char_length(p_content) < 1 OR char_length(p_content) > 2000 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'Message must be 1-2000 characters.');
  END IF;

  IF NOT public.check_rate_limit('send_message') THEN
    RETURN public.rpc_error('RATE_LIMITED', 'Sending too fast. Slow down.');
  END IF;

  INSERT INTO public.messages (request_id, sender_id, content)
  VALUES (p_request_id, v_profile.id, p_content)
  RETURNING id, created_at INTO v_message_id, v_created_at;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_profile.id, 'message_sent', 'message', v_message_id);

  RETURN jsonb_build_object('ok', true, 'message_id', v_message_id, 'created_at', v_created_at);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;

-- ============ submit_rating (05 §3.9) ============
-- Bilateral, unique per (request, rater, role); only after 'delivered'.
CREATE OR REPLACE FUNCTION public.submit_rating(
  p_request_id uuid,
  p_ratee_id uuid,
  p_role public.rating_role,
  p_score smallint,
  p_comment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_request public.delivery_requests%ROWTYPE;
  v_existing public.ratings%ROWTYPE;
  v_rating_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.rpc_error('UNAUTHENTICATED', 'Sign in required.');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN public.rpc_error('PROFILE_NOT_FOUND', 'Create a profile first.');
  END IF;

  IF p_score IS NULL OR p_score < 1 OR p_score > 5 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'Score must be 1-5.');
  END IF;
  IF p_comment IS NOT NULL AND char_length(p_comment) > 500 THEN
    RETURN public.rpc_error('VALIDATION_ERROR', 'Comment must be at most 500 characters.');
  END IF;

  SELECT * INTO v_request FROM public.delivery_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN public.rpc_error('DELIVERY_NOT_FOUND', 'Request not found.');
  END IF;

  IF v_request.status <> 'delivered' THEN
    RETURN public.rpc_error('DELIVERY_NOT_DELIVERED', 'Ratings open only after delivery.');
  END IF;

  IF v_profile_id = v_request.requester_id THEN
    IF p_role <> 'as_requester' OR p_ratee_id <> v_request.deliverer_id THEN
      RETURN public.rpc_error('RATING_NOT_ALLOWED', 'Requesters rate the deliverer.');
    END IF;
  ELSIF v_profile_id = v_request.deliverer_id THEN
    IF p_role <> 'as_deliverer' OR p_ratee_id <> v_request.requester_id THEN
      RETURN public.rpc_error('RATING_NOT_ALLOWED', 'Deliverers rate the requester.');
    END IF;
  ELSE
    RETURN public.rpc_error('NOT_PARTICIPANT', 'Only participants can rate.');
  END IF;

  -- Idempotent retry: identical payload returns the existing rating.
  SELECT * INTO v_existing FROM public.ratings
  WHERE request_id = p_request_id AND rater_id = v_profile_id AND role = p_role;
  IF FOUND THEN
    IF v_existing.ratee_id = p_ratee_id
       AND v_existing.score = p_score
       AND COALESCE(v_existing.comment, '') = COALESCE(p_comment, '') THEN
      RETURN jsonb_build_object('ok', true, 'rating_id', v_existing.id);
    END IF;
    RETURN public.rpc_error('RATING_ALREADY_EXISTS', 'You already rated this delivery.');
  END IF;

  BEGIN
    INSERT INTO public.ratings (request_id, rater_id, ratee_id, role, score, comment)
    VALUES (p_request_id, v_profile_id, p_ratee_id, p_role, p_score, p_comment)
    RETURNING id INTO v_rating_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN public.rpc_error('RATING_ALREADY_EXISTS', 'You already rated this delivery.');
  END;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
  VALUES (v_profile_id, 'rating_created', 'rating', v_rating_id);

  RETURN jsonb_build_object('ok', true, 'rating_id', v_rating_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_rating(uuid, uuid, public.rating_role, smallint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_rating(uuid, uuid, public.rating_role, smallint, text) TO authenticated;