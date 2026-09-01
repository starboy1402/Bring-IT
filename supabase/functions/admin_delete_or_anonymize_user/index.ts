// Trusted server operation (T-D5, docs/planning/03 §8, 05 §3.13).
// Verifies the caller with a *caller-scoped* database client (so
// authorize_admin_user_deletion sees the caller's JWT), then deletes the
// resolved Auth user through a separate server-only Auth Admin client.
// The browser never receives the service credential.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader || !SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return Response.json({ ok: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  }

  let body: { target_profile_id?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  if (!body.target_profile_id) {
    return Response.json({ ok: false, code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  // Caller-scoped client: authorize_admin_user_deletion enforces admin role,
  // preflights active deliveries, and returns the Auth ID.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
  const { data: authz, error: authzError } = await callerClient.rpc(
    'authorize_admin_user_deletion',
    { p_target_profile_id: body.target_profile_id },
  )
  if (authzError) {
    return Response.json(
      { ok: false, code: 'AUTHORIZE_FAILED', message: authzError.message },
      { status: 403 },
    )
  }
  const result = authz as {
    ok: boolean
    code?: string
    already_deleted?: boolean
    auth_user_id?: string
  }
  if (!result.ok) {
    return Response.json({ ok: false, code: result.code ?? 'ADMIN_REQUIRED' }, { status: 403 })
  }
  if (result.already_deleted) {
    return Response.json({ ok: true, already_deleted: true })
  }

  // Server-only client: Auth Admin deletion (never with the caller's token).
  const serverClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: deleteError } = await serverClient.auth.admin.deleteUser(
    result.auth_user_id ?? '',
  )
  if (deleteError) {
    return Response.json(
      { ok: false, code: 'AUTH_DELETE_FAILED', message: deleteError.message },
      { status: 500 },
    )
  }

  return Response.json({ ok: true, target_profile_id: body.target_profile_id })
})