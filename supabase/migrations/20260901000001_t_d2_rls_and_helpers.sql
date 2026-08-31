-- T-D2: Helper functions + RLS (docs/planning/03-data-model.md §6, 04 §5)
--
-- SECURITY DEFINER hardening rules (03 §6): fixed search_path, schema-qualified
-- references, auth.uid() non-null checks, REVOKE FROM PUBLIC, explicit grants.
--
-- Technical correction vs. the planning doc: RLS policy expressions run with
-- the *caller's* privileges, so inline subqueries on `profiles` inside policies
-- would be blocked by profiles' own deny-all SELECT policy. We therefore expose
-- SECURITY DEFINER STABLE helpers (current_profile_id, caller_is_active_verified)
-- and use them in policies — the same pattern the doc already uses for
-- is_participant(). Recorded as contradiction C25 in 10-open-questions.md.

-- ============ Identity helpers ============

-- Profile id of the caller (or NULL). SECURITY DEFINER so it can read
-- profiles despite its deny-all RLS.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

-- True when the caller has a profile that is verified and not suspended.
CREATE OR REPLACE FUNCTION public.caller_is_active_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_verified = true
      AND p.is_suspended = false
  )
$$;
REVOKE EXECUTE ON FUNCTION public.caller_is_active_verified() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caller_is_active_verified() TO authenticated;

-- Is auth.uid() a participant of request $1? (03 §6)
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

-- Does the caller have at least the specified admin role? (03 §6)
-- Hierarchy: owner > admin > moderator.
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
  SELECT role INTO caller_role FROM public.admin_roles WHERE user_id = caller_profile_id;
  IF caller_role IS NULL THEN
    RETURN false;
  END IF;
  IF caller_role = 'owner' THEN
    RETURN true;
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

-- Get caller's own admin role (safe wrapper for UI). (03 §6)
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

-- Internal rate-limit check — NOT granted to authenticated. (03 §3.9)
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  SELECT id INTO caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  SELECT * INTO policy FROM public.rate_limit_policies WHERE operation = p_operation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_OPERATION';
  END IF;

  v_now := clock_timestamp();
  v_window_start := v_now - make_interval(secs => policy.window_secs);
  PERFORM pg_advisory_xact_lock(hashtext(concat(caller_profile_id::text, p_operation)));

  DELETE FROM public.rate_limit_events
  WHERE actor_id = caller_profile_id
    AND operation = p_operation
    AND occurred_at < v_window_start;

  SELECT COUNT(*) INTO current_count
  FROM public.rate_limit_events
  WHERE actor_id = caller_profile_id
    AND operation = p_operation
    AND occurred_at >= v_window_start;

  IF current_count >= policy.max_count THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_events (actor_id, operation, occurred_at)
  VALUES (caller_profile_id, p_operation, v_now);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text) FROM anon, authenticated;

-- ============ public_profiles safe read view (03 §6) ============
CREATE VIEW public.public_profiles WITH (security_invoker = false) AS
  SELECT id, display_name, department, hall, created_at
  FROM public.profiles
  WHERE is_verified = true AND is_suspended = false;

ALTER VIEW public.public_profiles OWNER TO postgres;
GRANT SELECT ON public.public_profiles TO authenticated;

-- ============ RLS: profiles (03 §6) ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_no_client_select ON public.profiles
  FOR SELECT USING (false);
CREATE POLICY profiles_no_client_insert ON public.profiles
  FOR INSERT WITH CHECK (false);
CREATE POLICY profiles_no_client_update ON public.profiles
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY profiles_no_client_delete ON public.profiles
  FOR DELETE USING (false);
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- ============ RLS: delivery_requests (03 §6) ============
ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY dr_select_open_or_participant ON public.delivery_requests
  FOR SELECT USING (
    (status = 'open' AND public.caller_is_active_verified())
    OR requester_id = public.current_profile_id()
    OR deliverer_id = public.current_profile_id()
  );

CREATE POLICY dr_no_client_insert ON public.delivery_requests
  FOR INSERT WITH CHECK (false);
CREATE POLICY dr_no_client_update ON public.delivery_requests
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY dr_no_client_delete ON public.delivery_requests
  FOR DELETE USING (false);

-- ============ RLS: delivery_events (03 §6) ============
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY de_select_participant ON public.delivery_events
  FOR SELECT USING (public.is_participant(request_id));
CREATE POLICY de_no_client_write ON public.delivery_events
  FOR INSERT WITH CHECK (false);
CREATE POLICY de_no_client_update ON public.delivery_events
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY de_no_client_delete ON public.delivery_events
  FOR DELETE USING (false);

-- ============ RLS: messages (03 §6) ============
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY msg_select_participant ON public.messages
  FOR SELECT USING (public.is_participant(request_id));
CREATE POLICY msg_no_client_insert ON public.messages
  FOR INSERT WITH CHECK (false);
CREATE POLICY msg_no_client_update ON public.messages
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY msg_no_client_delete ON public.messages
  FOR DELETE USING (false);

-- ============ RLS: ratings (03 §6) ============
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ratings_select_participant_or_ratee ON public.ratings
  FOR SELECT USING (
    public.is_participant(request_id)
    OR ratee_id = public.current_profile_id()
  );
CREATE POLICY ratings_no_client_insert ON public.ratings
  FOR INSERT WITH CHECK (false);
CREATE POLICY ratings_no_client_update ON public.ratings
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY ratings_no_client_delete ON public.ratings
  FOR DELETE USING (false);

-- ============ RLS: reports (03 §6) ============
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_no_client_select ON public.reports
  FOR SELECT USING (false);
CREATE POLICY reports_no_client_insert ON public.reports
  FOR INSERT WITH CHECK (false);
CREATE POLICY reports_no_client_update ON public.reports
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY reports_no_client_delete ON public.reports
  FOR DELETE USING (false);
REVOKE ALL ON TABLE public.reports FROM PUBLIC, anon, authenticated;

-- ============ RLS: admin_roles (03 §6) ============
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_roles_no_client_select ON public.admin_roles
  FOR SELECT USING (false);
CREATE POLICY admin_roles_no_client_insert ON public.admin_roles
  FOR INSERT WITH CHECK (false);
CREATE POLICY admin_roles_no_client_update ON public.admin_roles
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY admin_roles_no_client_delete ON public.admin_roles
  FOR DELETE USING (false);
REVOKE ALL ON TABLE public.admin_roles FROM PUBLIC, anon, authenticated;

-- ============ RLS: audit_log (03 §6) ============
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_no_client ON public.audit_log
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon, authenticated;

-- ============ RLS: rate_limit_events (03 §6) ============
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY rate_limit_no_client ON public.rate_limit_events
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.rate_limit_events FROM PUBLIC, anon, authenticated;

-- ============ RLS: notification_outbox (03 §6) ============
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_no_client ON public.notification_outbox
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.notification_outbox FROM PUBLIC, anon, authenticated;

-- ============ RLS: rate_limit_policies (03 §6) ============
ALTER TABLE public.rate_limit_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY rate_limit_policies_no_client ON public.rate_limit_policies
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.rate_limit_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.rate_limit_events_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.notification_outbox_id_seq FROM PUBLIC, anon, authenticated;

-- ============ RLS: traveler_availability (post-MVP deny-all, 03 §7) ============
ALTER TABLE public.traveler_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY traveler_availability_no_client ON public.traveler_availability
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.traveler_availability FROM PUBLIC, anon, authenticated;