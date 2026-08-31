import { z } from 'zod'

/**
 * Client environment configuration.
 *
 * Only the public Supabase URL and anon key are allowed here — they are
 * public by design (see docs/planning/09 §3). The service-role key must
 * NEVER appear in a VITE_* variable; CI secret-scanning enforces this.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
})

export type Env = z.infer<typeof envSchema>

export function getEnv(): Env {
  const parsed = envSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  })

  if (!parsed.success) {
    throw new Error(
      'Missing or invalid environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. See .env.example.',
    )
  }

  return parsed.data
}