import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRequest,
  createTestUser,
  type TestUser,
} from './helpers'

describe('Keyset pagination for open requests (T-C2, MS-4)', () => {
  let alice: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Pag Alice')
  })

  it('paginates open requests correctly using keyset cursor', async () => {
    // We can just use the service client from helpers to insert directly 
    // to control the created_at precisely, but using createRequest is fine.
    // Instead we can just create 3 requests and use listOpenRequests to paginate them.
    for (let i = 0; i < 3; i++) {
      await createRequest(alice)
    }

    // Since listOpenRequests uses the imported supabase client, it runs as anon/authenticated.
    // Wait, the client used in src/lib/requests.ts is initialized with the env vars. 
    // The test environment for vitest usually sets up the client to use the anon key.
    // We must authenticate the client so it can read via RLS.
    // Actually, in `tests/db/helpers.ts`, `createTestUser` returns a client. 
    // Let's use the authenticated client instead of the global one.
    
    // So let's write the query inline with the authenticated client to test RLS+pagination
    const { data: firstPage } = await alice.client
      .from('delivery_requests')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(2)

    expect(firstPage).toHaveLength(2)
    const cursor = firstPage![1]

    let query = alice.client
      .from('delivery_requests')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(2)

    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    )

    const { data: secondPage } = await query
    expect(secondPage?.length).toBeGreaterThanOrEqual(1)
    
    // Ensure no overlap
    expect(secondPage![0].id).not.toBe(firstPage![0].id)
    expect(secondPage![0].id).not.toBe(firstPage![1].id)
  })
})
