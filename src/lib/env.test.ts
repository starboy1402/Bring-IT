import { afterEach, describe, expect, it, vi } from 'vitest'
import { getEnv } from './env'

describe('getEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns parsed env when both variables are valid', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    const env = getEnv()
    expect(env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:54321')
    expect(env.VITE_SUPABASE_ANON_KEY).toBe('test-anon-key')
  })

  it('throws when VITE_SUPABASE_URL is missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    expect(() => getEnv()).toThrow(/VITE_SUPABASE_URL/)
  })

  it('throws when VITE_SUPABASE_ANON_KEY is missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    expect(() => getEnv()).toThrow(/VITE_SUPABASE_ANON_KEY/)
  })

  it('throws when VITE_SUPABASE_URL is not a valid URL', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'not-a-url')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    expect(() => getEnv()).toThrow()
  })
})
