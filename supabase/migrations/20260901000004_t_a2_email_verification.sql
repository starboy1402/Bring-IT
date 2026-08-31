-- T-A2: Student verification trusted path (ADR-0003; approved Q1 default)
-- Rule: a profile is verified iff the linked auth user's email is confirmed
-- AND its domain is an approved CUET domain. Evaluated server-side only —
-- no client can set is_verified.

-- Approved institutional email domains (ADR-0003). Extend via migration only.
CREATE OR REPLACE FUNCTION public.is_approved_student_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_email IS NOT NULL
    AND lower(split_part(p_email, '@', 2)) IN ('cuet.ac.bd', 'student.cuet.ac.bd')
$$;

-- Trigger: when an auth user's email becomes confirmed and the domain is
-- approved, verify the linked profile (covers users who confirm after
-- profile creation).
CREATE OR REPLACE FUNCTION public.handle_email_confirmed_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at)
  THEN
    IF public.is_approved_student_email(NEW.email) THEN
      UPDATE public.profiles
      SET is_verified = true, updated_at = now()
      WHERE auth_user_id = NEW.id AND is_verified = false;

      INSERT INTO public.audit_log (actor_id, action, target_type, target_id)
      SELECT id, 'profile_verified', 'profile', id
      FROM public.profiles WHERE auth_user_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_email_confirmed_verification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_email_confirmed_verification
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_email_confirmed_verification();