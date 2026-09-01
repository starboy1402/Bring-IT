import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRequest,
  createTestUser,
  rpcCall,
  suspend,
  unverify,
  reactivate,
  type TestUser,
} from './helpers'

/**
 * Phase 1 regression tests (docs/planning/05 §3, 07 §5):
 * every user-facing SECURITY DEFINER RPC must require an authenticated caller
 * with an existing profile that is is_verified = true and is_suspended = false.
 *
 * Pre-fix: accept_delivery never checked is_verified; advance_delivery,
 * cancel_delivery and submit_rating never checked is_verified or is_suspended.
 * Idempotent retries also produced fake {status:'accepted'} success after the
 * request had already left the accepted state.
 *
 * Each describe block creates its own fresh users so the server-side
 * create_request rate limit (10 per 5 min) is never tripped by tests.
 */

// ---------------------------------------------------------------------------
// accept_delivery authorization (T-D3, MS-5)
// ---------------------------------------------------------------------------

describe('accept_delivery authorization', () => {
  let alice: TestUser // verified requester
  let bob: TestUser // verified deliverer
  let charlie: TestUser // gmail → unverified
  let dave: TestUser // verified, used for suspension scenarios

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Ad Alice')
    bob = await createTestUser('cuet.ac.bd', 'Ad Bob')
    charlie = await createTestUser('gmail.com', 'Ad Charlie')
    dave = await createTestUser('cuet.ac.bd', 'Ad Dave')
  })

  it('rejects an unverified user (NOT_VERIFIED)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    const res = await rpcCall(charlie.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NOT_VERIFIED')
  })

  it('rejects a suspended user (SUSPENDED)', async () => {
    await suspend(dave)
    try {
      const req = await createRequest(alice)
      expect(req.request_id).toBeDefined()
      const res = await rpcCall(dave.client, 'accept_delivery', {
        p_request_id: req.request_id,
      })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('SUSPENDED')
    } finally {
      await reactivate(dave)
    }
  })

  it('still lets a verified, non-suspended user accept', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    const res = await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('accepted')
  })
})

// ---------------------------------------------------------------------------
// accept_delivery idempotency
// ---------------------------------------------------------------------------

describe('accept_delivery idempotency', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Ai Alice')
    bob = await createTestUser('cuet.ac.bd', 'Ai Bob')
  })

  it('genuine same-deliverer retry while still accepted succeeds', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()

    const first = await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(first.ok).toBe(true)
    expect(first.status).toBe('accepted')

    const retry = await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(retry.ok).toBe(true)
    expect(retry.status).toBe('accepted')
  })

  it('same-deliverer stale retry after in_progress fails (INVALID_TRANSITION)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })

    const stale = await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(stale.ok).toBe(false)
    expect(stale.code).toBe('INVALID_TRANSITION')
    expect(stale).not.toHaveProperty('status', 'accepted')
  })

  it('same-deliverer stale retry after delivered fails (INVALID_TRANSITION)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'delivered',
    })

    const stale = await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(stale.ok).toBe(false)
    expect(stale.code).toBe('INVALID_TRANSITION')
  })

  it('same-deliverer stale retry after cancelled fails (INVALID_TRANSITION)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'changed my mind',
    })

    const stale = await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(stale.ok).toBe(false)
    expect(stale.code).toBe('INVALID_TRANSITION')
  })

  it('different deliverer receives ALREADY_ACCEPTED', async () => {
    const carol = await createTestUser('cuet.ac.bd', 'Ai Carol')
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })

    const res = await rpcCall(carol.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ALREADY_ACCEPTED')
  })
})

// ---------------------------------------------------------------------------
// advance_delivery authorization
// ---------------------------------------------------------------------------

describe('advance_delivery authorization', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Av Alice')
    bob = await createTestUser('cuet.ac.bd', 'Av Bob')
  })

  it('rejects an unverified user (NOT_VERIFIED)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    await unverify(bob)
    try {
      const res = await rpcCall(bob.client, 'advance_delivery', {
        p_request_id: req.request_id,
        p_to_status: 'in_progress',
      })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('NOT_VERIFIED')
    } finally {
      await reactivate(bob)
    }
  })

  it('rejects a suspended user (SUSPENDED)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    await suspend(bob)
    try {
      const res = await rpcCall(bob.client, 'advance_delivery', {
        p_request_id: req.request_id,
        p_to_status: 'in_progress',
      })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('SUSPENDED')
    } finally {
      await reactivate(bob)
    }
  })

  it('still lets a verified, non-suspended participant advance', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    const res = await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('in_progress')
  })
})

// ---------------------------------------------------------------------------
// cancel_delivery authorization + idempotency
// ---------------------------------------------------------------------------

describe('cancel_delivery authorization', () => {
  let alice: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Ca Alice')
  })

  it('rejects an unverified user (NOT_VERIFIED)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await unverify(alice)
    try {
      const res = await rpcCall(alice.client, 'cancel_delivery', {
        p_request_id: req.request_id,
        p_reason: 'need to cancel',
      })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('NOT_VERIFIED')
    } finally {
      await reactivate(alice)
    }
  })

  it('rejects a suspended user (SUSPENDED)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await suspend(alice)
    try {
      const res = await rpcCall(alice.client, 'cancel_delivery', {
        p_request_id: req.request_id,
        p_reason: 'need to cancel',
      })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('SUSPENDED')
    } finally {
      await reactivate(alice)
    }
  })

  it('still lets a verified, non-suspended requester cancel', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    const res = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'changed my mind',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('cancelled')
  })
})

describe('cancel_delivery idempotency', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Ci Alice')
    bob = await createTestUser('cuet.ac.bd', 'Ci Bob')
  })

  it('retry by original actor with same normalized reason succeeds', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    const first = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: '  change of plans  ',
    })
    expect(first.ok).toBe(true)
    const retry = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'change of plans',
    })
    expect(retry.ok).toBe(true)
    expect(retry.status).toBe('cancelled')
  })

  it('retry by original actor with different reason returns conflict', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    const first = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'original reason',
    })
    expect(first.ok).toBe(true)
    const retry = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'different reason',
    })
    expect(retry.ok).toBe(false)
    expect(retry.code).toBe('CANCEL_CONFLICT')
  })

  it('retry by non-participant returns NOT_PARTICIPANT', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    const first = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'original reason',
    })
    expect(first.ok).toBe(true)
    const res = await rpcCall(bob.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'original reason',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NOT_PARTICIPANT')
  })

  it('requester cancels accepted, then deliverer retry with same reason returns conflict', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', {
      p_request_id: req.request_id,
    })
    const first = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'requester reason',
    })
    expect(first.ok).toBe(true)
    const res = await rpcCall(bob.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'requester reason',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('CANCEL_CONFLICT')
  })

  it('retry by original actor with NULL reason succeeds', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    const first = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: null,
    })
    expect(first.ok).toBe(true)
    const retry = await rpcCall(alice.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: null,
    })
    expect(retry.ok).toBe(true)
    expect(retry.status).toBe('cancelled')
  })
})

// ---------------------------------------------------------------------------
// submit_rating authorization
// ---------------------------------------------------------------------------

describe('submit_rating authorization', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Sr Alice')
    bob = await createTestUser('cuet.ac.bd', 'Sr Bob')
  })

  it('rejects an unverified user (NOT_VERIFIED)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    await rpcCall(bob.client, 'advance_delivery', { p_request_id: req.request_id, p_to_status: 'in_progress' })
    await rpcCall(bob.client, 'advance_delivery', { p_request_id: req.request_id, p_to_status: 'delivered' })

    await unverify(bob)
    try {
      const res = await rpcCall(bob.client, 'submit_rating', {
        p_request_id: req.request_id,
        p_ratee_id: alice.profileId,
        p_role: 'as_deliverer',
        p_score: 5,
        p_comment: 'Great!',
      })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('NOT_VERIFIED')
    } finally {
      await reactivate(bob)
    }
  })

  it('rejects a suspended user (SUSPENDED)', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    await rpcCall(bob.client, 'advance_delivery', { p_request_id: req.request_id, p_to_status: 'in_progress' })
    await rpcCall(bob.client, 'advance_delivery', { p_request_id: req.request_id, p_to_status: 'delivered' })

    await suspend(bob)
    try {
      const res = await rpcCall(bob.client, 'submit_rating', {
        p_request_id: req.request_id,
        p_ratee_id: alice.profileId,
        p_role: 'as_deliverer',
        p_score: 5,
        p_comment: null,
      })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('SUSPENDED')
    } finally {
      await reactivate(bob)
    }
  })

  it('still lets a verified, non-suspended participant rate', async () => {
    const req = await createRequest(alice)
    expect(req.request_id).toBeDefined()
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    await rpcCall(bob.client, 'advance_delivery', { p_request_id: req.request_id, p_to_status: 'in_progress' })
    await rpcCall(bob.client, 'advance_delivery', { p_request_id: req.request_id, p_to_status: 'delivered' })

    const res = await rpcCall(bob.client, 'submit_rating', {
      p_request_id: req.request_id,
      p_ratee_id: alice.profileId,
      p_role: 'as_deliverer',
      p_score: 5,
      p_comment: 'Great!',
    })
    expect(res.ok).toBe(true)
    expect(res.rating_id).toBeDefined()
  })
})
