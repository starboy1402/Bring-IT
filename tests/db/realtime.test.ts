import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRequest,
  createTestUser,
  rpcCall,
  type TestUser,
} from './helpers'

describe('Realtime chat recovery & composite cursor (T-R1)', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Realtime Alice')
    bob = await createTestUser('cuet.ac.bd', 'Realtime Bob')
  })

  it('unauthorized message access is blocked', async () => {
    const req = await createRequest(alice)
    const charlie = await createTestUser('cuet.ac.bd', 'Realtime Charlie')
    
    // Charlie is not a participant, so insert and select should fail
    const { error: insertError } = await charlie.client.from('messages').insert({
      request_id: req.request_id,
      sender_id: charlie.profileId,
      content: 'Hello'
    })
    expect(insertError).toBeTruthy()

    const { data: selectData } = await charlie.client.from('messages').select('*').eq('request_id', req.request_id)
    expect(selectData).toHaveLength(0)
  })

  it('composite cursor ordering for listMessages works', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id! })

    await rpcCall(alice.client, 'send_message', { p_request_id: req.request_id!, p_content: 'M1' })
    await rpcCall(bob.client, 'send_message', { p_request_id: req.request_id!, p_content: 'M2' })
    await rpcCall(alice.client, 'send_message', { p_request_id: req.request_id!, p_content: 'M3' })

    const { data: messages } = await alice.client
      .from('messages')
      .select('*')
      .eq('request_id', req.request_id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    expect(messages).toHaveLength(3)
    const m2 = messages![1]

    // Cursor query: fetch messages after m2
    let query = alice.client
      .from('messages')
      .select('*')
      .eq('request_id', req.request_id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    query = query.or(
      `created_at.gt.${m2.created_at},and(created_at.eq.${m2.created_at},id.gt.${m2.id})`
    )

    const { data: afterM2 } = await query
    expect(afterM2).toHaveLength(1)
    expect(afterM2![0].content).toBe('M3')
  })
})
