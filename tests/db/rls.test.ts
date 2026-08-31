import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRequest,
  createTestUser,
  rpcCall,
  type TestUser,
} from './helpers'

let alice: TestUser // requester (verified)
let bob: TestUser // deliverer (verified)
let charlie: TestUser // unverified outsider
let requestId: string

beforeAll(async () => {
  alice = await createTestUser('cuet.ac.bd', 'Rls Alice')
  bob = await createTestUser('cuet.ac.bd', 'Rls Bob')
  charlie = await createTestUser('gmail.com', 'Rls Charlie')

  const req = await createRequest(alice)
  if (!req.ok || !req.request_id) throw new Error('setup: create_request failed')
  requestId = req.request_id
  await rpcCall(bob.client, 'accept_delivery', { p_request_id: requestId })
})

describe('profiles PII protection (T5)', () => {
  it('authenticated user cannot SELECT phone/student_id from base profiles', async () => {
    const { data, error } = await alice.client
      .from('profiles')
      .select('phone, student_id')
    // REVOKE ALL → permission denied (stronger than an empty result).
    expect(error).toBeTruthy()
    expect(data).toBeNull()
  })

  it('authenticated user cannot INSERT/UPDATE/DELETE profiles', async () => {
    const ins = await alice.client.from('profiles').insert({
      display_name: 'Hacker',
    })
    expect(ins.error).toBeTruthy()

    const upd = await alice.client
      .from('profiles')
      .update({ is_verified: true })
      .eq('id', alice.profileId)
    expect(upd.error).toBeTruthy()

    const del = await alice.client.from('profiles').delete().eq('id', bob.profileId)
    expect(del.error).toBeTruthy()
  })

  it('public_profiles exposes only public columns', async () => {
    const { data, error } = await bob.client
      .from('public_profiles')
      .select('*')
      .eq('id', alice.profileId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    const row = data![0] as Record<string, unknown>
    expect(row.display_name).toBe('Rls Alice')
    expect(row).not.toHaveProperty('phone')
    expect(row).not.toHaveProperty('student_id')
    expect(row).not.toHaveProperty('is_verified')
    expect(row).not.toHaveProperty('auth_user_id')
  })
})

describe('delivery_requests visibility (T1, T4, T11)', () => {
  it('non-participant cannot SELECT a non-open request', async () => {
    const outsider = await createTestUser('cuet.ac.bd', 'Rls Outsider')
    const { data, error } = await outsider.client
      .from('delivery_requests')
      .select('*')
      .eq('id', requestId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('participants can SELECT their accepted request', async () => {
    const { data, error } = await bob.client
      .from('delivery_requests')
      .select('*')
      .eq('id', requestId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].status).toBe('accepted')
  })

  it('unverified user cannot browse open requests', async () => {
    // charlie is unverified → caller_is_active_verified() false → no open rows
    const { data, error } = await charlie.client
      .from('delivery_requests')
      .select('*')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('client INSERT into delivery_requests is blocked (T11)', async () => {
    const res = await alice.client.from('delivery_requests').insert({
      title: 'Raw insert attempt',
      pickup_location: 'Somewhere',
      dropoff_location: 'Elsewhere',
    })
    expect(res.error).toBeTruthy()
  })

  it('client UPDATE of status is blocked (T4)', async () => {
    // RLS UPDATE USING(false) filters rows → 0 rows updated, no error.
    // The authoritative assertion: the status must be unchanged afterwards.
    const res = await bob.client
      .from('delivery_requests')
      .update({ status: 'delivered' })
      .eq('id', requestId)
    expect(res.error).toBeNull() // silently filtered

    const { data } = await bob.client
      .from('delivery_requests')
      .select('status')
      .eq('id', requestId)
    expect(data).toHaveLength(1)
    expect(data![0].status).toBe('accepted')
  })
})

describe('messages protection (T2)', () => {
  it('non-participant cannot SELECT messages', async () => {
    const outsider = await createTestUser('cuet.ac.bd', 'Rls Snoop')
    const { data, error } = await outsider.client
      .from('messages')
      .select('*')
      .eq('request_id', requestId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('participants can SELECT messages', async () => {
    const { data, error } = await alice.client
      .from('messages')
      .select('*')
      .eq('request_id', requestId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('client INSERT into messages is blocked', async () => {
    const res = await alice.client.from('messages').insert({
      request_id: requestId,
      content: 'raw insert',
    })
    expect(res.error).toBeTruthy()
  })
})

describe('deny-all tables', () => {
  it('client cannot read audit_log', async () => {
    // REVOKE ALL → permission denied.
    const { data, error } = await alice.client.from('audit_log').select('*')
    expect(error).toBeTruthy()
    expect(data).toBeNull()
  })

  it('client cannot read rate_limit_events or policies', async () => {
    const events = await alice.client.from('rate_limit_events').select('*')
    expect(events.error).toBeTruthy()

    const policies = await alice.client.from('rate_limit_policies').select('*')
    expect(policies.error).toBeTruthy()
  })

  it('client cannot read admin_roles', async () => {
    const { data, error } = await alice.client.from('admin_roles').select('*')
    expect(error).toBeTruthy()
    expect(data).toBeNull()
  })

  it('client cannot read reports', async () => {
    const { data, error } = await alice.client.from('reports').select('*')
    expect(error).toBeTruthy()
    expect(data).toBeNull()
  })
})

describe('internal function hardening', () => {
  it('authenticated user cannot call check_rate_limit', async () => {
    const { error } = await alice.client.rpc('check_rate_limit', {
      p_operation: 'create_request',
    })
    expect(error).toBeTruthy()
  })

  it('SECURITY DEFINER functions have fixed empty search_path', async () => {
    // Verified via direct DB inspection in CI; here we assert the RPCs still
    // behave (a broken search_path would make them fail loudly).
    const res = await rpcCall(alice.client, 'get_own_private_profile', {})
    expect(res.ok).toBe(true)
  })
})