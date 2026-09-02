import { beforeAll, describe, expect, it } from 'vitest'
import {
  createServiceClient,
  createTestUser,
  type TestUser,
} from './helpers'
import { listOpenRequests } from '../../src/lib/requests'

describe('Keyset pagination for open requests (T-C2, MS-4)', () => {
  let alice: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Pag Alice')
  })

  it('paginates open requests correctly using keyset cursor', async () => {
    const svc = createServiceClient()
    // Use a future date to ensure these records appear at the very top of created_at DESC sort
    // even if other tests are running concurrently
    const now = new Date('2100-01-01T12:00:00Z').toISOString()

    // Create 3 deterministic records with the exact SAME timestamp to test tie-break by ID
    // We must use the service client to force `created_at` since it's default now()
    const { data: inserts, error } = await svc.from('delivery_requests').insert([
      { requester_id: alice.profileId, title: 'Request 1', pickup_location: 'Location A', dropoff_location: 'Location B', urgency: 'high', status: 'open', created_at: now },
      { requester_id: alice.profileId, title: 'Request 2', pickup_location: 'Location A', dropoff_location: 'Location B', urgency: 'high', status: 'open', created_at: now },
      { requester_id: alice.profileId, title: 'Request 3', pickup_location: 'Location A', dropoff_location: 'Location B', urgency: 'low', status: 'open', created_at: now },
      { requester_id: alice.profileId, title: 'Request 4', pickup_location: 'Location A', dropoff_location: 'Location B', urgency: 'high', status: 'open', created_at: now },
    ]).select('*')
    expect(error).toBeNull()

    const highUrgency = inserts!.filter(r => r.urgency === 'high').sort((a, b) => (a.id > b.id ? -1 : 1))

    // Fetch first page
    const page1 = (await listOpenRequests('high', undefined, 20, alice.client)).filter(r => r.requester_id === alice.profileId)

    // Check descending ID tie-break (same created_at)
    expect(page1[0].id).toBe(highUrgency[0].id)
    expect(page1[1].id).toBe(highUrgency[1].id)
    expect(page1[2].id).toBe(highUrgency[2].id)

    // Fetch next page using the 2nd record as cursor
    const page2 = (await listOpenRequests('high', {
      createdAt: page1[1].created_at,
      id: page1[1].id
    }, 20, alice.client)).filter(r => r.requester_id === alice.profileId)

    // Should get the 3rd high urgency record
    expect(page2.length).toBe(1)
    expect(page2[0].id).toBe(highUrgency[2].id)

    // Check no duplicates and no skipped records
    const allIds = [...page1, ...page2].map(r => r.id)
    expect(new Set(allIds).size).toBe(3) // all unique

    const finalCursor = { createdAt: page2[0].created_at, id: page2[0].id }
    const page3 = (await listOpenRequests('high', finalCursor, 20, alice.client)).filter(r => r.requester_id === alice.profileId)
    expect(page3).toHaveLength(0) // hasMore = false test
  })
})
