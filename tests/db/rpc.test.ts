import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRequest,
  createTestUser,
  rpcCall,
  type TestUser,
} from './helpers'

// Each describe block uses its own fresh users so the server-side
// create_request rate limit (10 per 5 min) is never tripped by tests.

describe('profile RPCs (T-D4, MS-1/MS-2)', () => {
  let alice: TestUser
  let bob: TestUser
  let charlie: TestUser // gmail → unverified

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Alice Requester')
    bob = await createTestUser('cuet.ac.bd', 'Bob Deliverer')
    charlie = await createTestUser('gmail.com', 'Charlie Unverified')
  })

  it('verifies CUET-email users and leaves gmail users unverified', () => {
    expect(alice.verified).toBe(true)
    expect(bob.verified).toBe(true)
    expect(charlie.verified).toBe(false)
  })

  it('create_profile is idempotent for the same auth user', async () => {
    const retry = await rpcCall(alice.client, 'create_profile', {
      p_display_name: 'Alice Again',
      p_student_id: null,
      p_department: null,
      p_hall: null,
      p_phone: null,
    })
    expect(retry.ok).toBe(true)
    expect(retry.already_existed).toBe(true)
    expect(retry.profile_id).toBe(alice.profileId)
  })

  it('rejects invalid display_name', async () => {
    const res = await rpcCall(alice.client, 'create_profile', {
      p_display_name: 'A',
      p_student_id: null,
      p_department: null,
      p_hall: null,
      p_phone: null,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('get_own_private_profile returns private fields to the owner', async () => {
    const res = await rpcCall(alice.client, 'get_own_private_profile', {})
    expect(res.ok).toBe(true)
    const profile = res.profile as Record<string, unknown>
    expect(profile.student_id).toBeTruthy()
    expect(profile.phone).toBeTruthy()
    expect(profile.is_verified).toBe(true)
  })
})

describe('create_request (T-D4, MS-3)', () => {
  let alice: TestUser
  let charlie: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Cr Alice')
    charlie = await createTestUser('gmail.com', 'Cr Charlie')
  })

  it('creates an open request for a verified user', async () => {
    const res = await createRequest(alice)
    expect(res.ok).toBe(true)
    expect(res.status).toBe('open')
    expect(res.request_id).toBeTruthy()
  })

  it('blocks unverified users with NOT_VERIFIED', async () => {
    const res = await createRequest(charlie)
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NOT_VERIFIED')
  })

  it('rejects a too-short title with VALIDATION_ERROR', async () => {
    const res = await createRequest(alice, { title: 'ab' })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a negative reward with VALIDATION_ERROR', async () => {
    const res = await createRequest(alice, { reward_suggestion: -5 })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('VALIDATION_ERROR')
  })
})

describe('accept_delivery (T-D3, MS-5)', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Acc Alice')
    bob = await createTestUser('cuet.ac.bd', 'Acc Bob')
  })

  it('forbids self-accept', async () => {
    const req = await createRequest(alice)
    const res = await rpcCall(alice.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('SELF_ACCEPT_FORBIDDEN')
  })

  it('lets another verified user accept', async () => {
    const req = await createRequest(alice)
    const res = await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('accepted')
  })

  it('same-deliverer retry is idempotent', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    const retry = await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(retry.ok).toBe(true)
    expect(retry.status).toBe('accepted')
  })

  it('a different deliverer gets ALREADY_ACCEPTED', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    const third = await createTestUser('cuet.ac.bd', 'Acc Carol')
    const res = await rpcCall(third.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ALREADY_ACCEPTED')
  })

  it('concurrent accepts: exactly one succeeds', async () => {
    const req = await createRequest(alice)
    const d1 = await createTestUser('cuet.ac.bd', 'Racer One')
    const d2 = await createTestUser('cuet.ac.bd', 'Racer Two')
    const [r1, r2] = await Promise.all([
      rpcCall(d1.client, 'accept_delivery', { p_request_id: req.request_id }),
      rpcCall(d2.client, 'accept_delivery', { p_request_id: req.request_id }),
    ])
    const outcomes = [r1, r2].map((r) => (r.ok ? 'accepted' : r.code))
    expect(outcomes.sort()).toEqual(['ALREADY_ACCEPTED', 'accepted'])
  })
})

describe('advance_delivery (T-D3, MS-6/MS-9)', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Adv Alice')
    bob = await createTestUser('cuet.ac.bd', 'Adv Bob')
  })

  it('rejects the requester as actor', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    const res = await rpcCall(alice.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NOT_PARTICIPANT')
  })

  it('rejects an illegal jump accepted→delivered', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    const res = await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'delivered',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('INVALID_TRANSITION')
  })

  it('walks the full lifecycle accepted→in_progress→delivered', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })

    const p1 = await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    expect(p1.ok).toBe(true)

    const p2 = await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'delivered',
    })
    expect(p2.ok).toBe(true)
    expect(p2.status).toBe('delivered')
  })

  it('retry with the same target state is idempotent', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    const retry = await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    expect(retry.ok).toBe(true)
  })
})

describe('cancel_delivery (T-D3, MS-6)', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Can Alice')
    bob = await createTestUser('cuet.ac.bd', 'Can Bob')
  })

  it('requester can cancel an open request', async () => {
    const req = await createRequest(alice)
    const res = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'Found it locally',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('cancelled')
  })

  it('deliverer can cancel while accepted', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    const res = await rpcCall(bob.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'Cannot make it',
    })
    expect(res.ok).toBe(true)
  })

  it('blocks cancellation after in_progress', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    const res = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'Changed my mind',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('CANCEL_NOT_ALLOWED')
  })

  it('non-participant cannot cancel', async () => {
    const req = await createRequest(alice)
    const outsider = await createTestUser('cuet.ac.bd', 'Can Outsider')
    const res = await rpcCall(outsider.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'Sneaky',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NOT_PARTICIPANT')
  })
})

describe('send_message (T-D3, MS-8)', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Msg Alice')
    bob = await createTestUser('cuet.ac.bd', 'Msg Bob')
  })

  it('participants can exchange messages', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })

    const m1 = await rpcCall(alice.client, 'send_message', {
      p_request_id: req.request_id,
      p_content: 'Where are you?',
    })
    expect(m1.ok).toBe(true)

    const m2 = await rpcCall(bob.client, 'send_message', {
      p_request_id: req.request_id,
      p_content: 'On my way!',
    })
    expect(m2.ok).toBe(true)
  })

  it('non-participants are blocked', async () => {
    const req = await createRequest(alice)
    const outsider = await createTestUser('cuet.ac.bd', 'Msg Sneaky')
    const res = await rpcCall(outsider.client, 'send_message', {
      p_request_id: req.request_id,
      p_content: 'Injecting myself',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NOT_PARTICIPANT')
  })

  it('rejects empty content', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    const res = await rpcCall(alice.client, 'send_message', {
      p_request_id: req.request_id,
      p_content: '',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('VALIDATION_ERROR')
  })
})

describe('submit_rating (T-D3, MS-10)', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Rate Alice')
    bob = await createTestUser('cuet.ac.bd', 'Rate Bob')
  })

  it('rejects rating before delivered', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    const res = await rpcCall(alice.client, 'submit_rating', {
      p_request_id: req.request_id,
      p_ratee_id: bob.profileId,
      p_role: 'as_requester',
      p_score: 5,
      p_comment: null,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('DELIVERY_NOT_DELIVERED')
  })

  it('rejects wrong role / wrong ratee', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'delivered',
    })

    const wrongRole = await rpcCall(alice.client, 'submit_rating', {
      p_request_id: req.request_id,
      p_ratee_id: bob.profileId,
      p_role: 'as_deliverer',
      p_score: 5,
      p_comment: null,
    })
    expect(wrongRole.ok).toBe(false)
    expect(wrongRole.code).toBe('RATING_NOT_ALLOWED')

    const selfRate = await rpcCall(alice.client, 'submit_rating', {
      p_request_id: req.request_id,
      p_ratee_id: alice.profileId,
      p_role: 'as_requester',
      p_score: 5,
      p_comment: null,
    })
    expect(selfRate.ok).toBe(false)
    expect(selfRate.code).toBe('RATING_NOT_ALLOWED')
  })

  it('both parties rate once after delivered; duplicates rejected', async () => {
    const req = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'delivered',
    })

    const r1 = await rpcCall(alice.client, 'submit_rating', {
      p_request_id: req.request_id,
      p_ratee_id: bob.profileId,
      p_role: 'as_requester',
      p_score: 5,
      p_comment: 'Great!',
    })
    expect(r1.ok).toBe(true)

    const r2 = await rpcCall(bob.client, 'submit_rating', {
      p_request_id: req.request_id,
      p_ratee_id: alice.profileId,
      p_role: 'as_deliverer',
      p_score: 4,
      p_comment: null,
    })
    expect(r2.ok).toBe(true)

    const dup = await rpcCall(alice.client, 'submit_rating', {
      p_request_id: req.request_id,
      p_ratee_id: bob.profileId,
      p_role: 'as_requester',
      p_score: 3,
      p_comment: 'Different payload',
    })
    expect(dup.ok).toBe(false)
    expect(dup.code).toBe('RATING_ALREADY_EXISTS')

    const identicalRetry = await rpcCall(alice.client, 'submit_rating', {
      p_request_id: req.request_id,
      p_ratee_id: bob.profileId,
      p_role: 'as_requester',
      p_score: 5,
      p_comment: 'Great!',
    })
    expect(identicalRetry.ok).toBe(true)
    expect(identicalRetry.rating_id).toBe(r1.rating_id)
  })
})