import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = process.env.SUPABASE_URL as string
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY as string
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    'Integration tests require SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY env vars (local supabase start).',
  )
}

/** Service-role client — bypasses RLS. Test-only; never ship to the client. */
export function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

let emailCounter = 0

export function uniqueEmail(domain: 'cuet.ac.bd' | 'gmail.com' = 'cuet.ac.bd'): string {
  emailCounter += 1
  return `test-user-${Date.now()}-${emailCounter}-${Math.floor(Math.random() * 1e6)}@${domain}`
}

export interface TestUser {
  client: SupabaseClient
  email: string
  userId: string
  profileId: string
  verified: boolean
}

/**
 * Signs up a user, creates their profile via the create_profile RPC, and
 * returns an authenticated client + profile id.
 */
export async function createTestUser(
  domain: 'cuet.ac.bd' | 'gmail.com' = 'cuet.ac.bd',
  displayName = 'Test User',
): Promise<TestUser> {
  const email = uniqueEmail(domain)
  const client = createAnonClient()

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email,
    password: 'password-123',
  })
  if (signUpError || !signUpData.user || !signUpData.session) {
    throw new Error(`signUp failed for ${email}: ${signUpError?.message}`)
  }

  const { data: profileResult, error: profileError } = await client.rpc('create_profile', {
    p_display_name: displayName,
    p_student_id: '2204' + String(emailCounter).padStart(4, '0'),
    p_department: 'CSE',
    p_hall: 'Hall A',
    p_phone: '01700000000',
  })
  if (profileError) {
    throw new Error(`create_profile failed: ${profileError.message}`)
  }
  const profile = profileResult as { ok: boolean; profile_id: string }
  if (!profile.ok) {
    throw new Error(`create_profile returned error: ${JSON.stringify(profile)}`)
  }

  // Read back verification state via the private profile RPC.
  const { data: own } = await client.rpc('get_own_private_profile')
  const ownProfile = own as { ok: boolean; profile?: { is_verified: boolean } }

  return {
    client,
    email,
    userId: signUpData.user.id,
    profileId: profile.profile_id,
    verified: ownProfile.profile?.is_verified ?? false,
  }
}

/** Convenience: create a verified request as a user. */
export async function createRequest(
  user: TestUser,
  overrides: Partial<{
    title: string
    description: string
    pickup_location: string
    dropoff_location: string
    urgency: 'low' | 'medium' | 'high'
    reward_suggestion: number
  }> = {},
): Promise<{ ok: boolean; request_id?: string; status?: string; code?: string }> {
  const { data, error } = await user.client.rpc('create_request', {
    p_title: overrides.title ?? 'Bring my lunch from canteen',
    p_description: overrides.description ?? 'Please pick up from main canteen',
    p_pickup_location: overrides.pickup_location ?? 'Main canteen',
    p_dropoff_location: overrides.dropoff_location ?? 'CSE Building',
    p_urgency: overrides.urgency ?? 'medium',
    p_reward_suggestion: overrides.reward_suggestion ?? 20,
  })
  if (error) throw new Error(`create_request rpc error: ${error.message}`)
  return data as { ok: boolean; request_id?: string; code?: string }
}

export async function rpcCall(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; code?: string } & Record<string, unknown>> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(`${fn} rpc error: ${error.message}`)
  return data as { ok: boolean; code?: string } & Record<string, unknown>
}

export type AdminRole = 'owner' | 'admin' | 'moderator'

/** Test-only: grants an admin role to an existing profile via the service
 *  client (bypasses RLS). No client path can self-promote (03 §3.7). */
export async function grantAdminRole(profileId: string, role: AdminRole): Promise<void> {
  const svc = createServiceClient()
  const { error } = await svc.from('admin_roles').insert({
    user_id: profileId,
    role,
  })
  if (error) throw new Error(`grantAdminRole failed: ${error.message}`)
}