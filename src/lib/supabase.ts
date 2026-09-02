import { createClient } from '@supabase/supabase-js'
import { getEnv } from './env'

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = getEnv()

/**
 * Shared Supabase client (anon role).
 *
 * All authorization is enforced server-side by RLS + SECURITY DEFINER RPCs
 * (docs/planning/03 §6, 04 §1). This client grants nothing the policies
 * do not allow.
 */
export const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
