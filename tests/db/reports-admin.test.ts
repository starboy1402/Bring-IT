import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRequest,
  createServiceClient,
  createTestUser,
  grantAdminRole,
  rpcCall,
  type TestUser,
} from './helpers'

const svc = createServiceClient()

// Each describe uses fresh users so the server-side submit_report rate limit
// (5 per 5 min) is never tripped by unrelated tests.

describe('submit_report (T-D5, MS-13)', () => {
  let alice: TestUser // requester
  let bob: TestUser // deliverer
  let mallory: TestUser // verified outsider
  let charlie: TestUser // unverified (gmail)

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Rep Alice')
    bob = await createTestUser('cuet.ac.bd', 'Rep Bob')
    mallory = await createTestUser('cuet.ac.bd', 'Rep Mallory')
    charlie = await createTestUser('gmail.com', 'Rep Charlie')
  })

  async function activeRequest() {
    const req = await createRequest(alice)
    if (!req.ok || !req.request_id) throw new Error('setup: create_request failed')
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    return req.request_id
  }

  it('lets a participant report the counterpart and enqueues the notification', async () => {
    const requestId = await activeRequest()
    const res = await rpcCall(alice.client, 'submit_report', {
      p_request_id: requestId,
      p_target_id: bob.profileId,
      p_reason: 'Never delivered and stopped replying',
      p_description: 'Bob accepted then ghosted.',
    })
    expect(res.ok).toBe(true)
    const reportId = res.report_id as string
    expect(reportId).toBeTruthy()

    // Audit + transactional outbox enqueue with dedup key report_created:<id>.
    const { data: audit } = await svc
      .from('audit_log')
      .select('action, target_id, meta')
      .eq('action', 'report_created')
      .eq('target_id', reportId)
    expect(audit).toHaveLength(1)

    const { data: outbox } = await svc
      .from('notification_outbox')
      .select('*')
      .eq('deduplication_key', `report_created:${reportId}`)
    expect(outbox).toHaveLength(1)
    expect(outbox![0].status).toBe('pending')
    const payload = outbox![0].payload as Record<string, unknown>
    expect(payload.report_id).toBe(reportId)
    expect(payload).not.toHaveProperty('phone')
    expect(payload).not.toHaveProperty('email')
  })

  it('lets a verified viewer report the requester of an open request', async () => {
    const req = await createRequest(alice)
    if (!req.ok || !req.request_id) throw new Error('setup failed')
    const res = await rpcCall(mallory.client, 'submit_report', {
      p_request_id: req.request_id,
      p_target_id: alice.profileId,
      p_reason: 'Reward too low compared to distance',
    })
    expect(res.ok).toBe(true)
  })

  it('rejects self-report', async () => {
    const req = await createRequest(alice)
    const res = await rpcCall(alice.client, 'submit_report', {
      p_request_id: req.request_id!,
      p_target_id: alice.profileId,
      p_reason: 'Reporting myself',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('REPORT_NOT_ALLOWED')
  })

  it('rejects a target that is not a participant', async () => {
    const req = await createRequest(alice)
    const res = await rpcCall(bob.client, 'submit_report', {
      p_request_id: req.request_id!,
      p_target_id: mallory.profileId,
      p_reason: 'Mallory is unrelated',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('REPORT_NOT_ALLOWED')
  })

  it('rejects an unverified reporter', async () => {
    const req = await createRequest(alice)
    const res = await rpcCall(charlie.client, 'submit_report', {
      p_request_id: req.request_id!,
      p_target_id: alice.profileId,
      p_reason: 'Unverified trouble',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NOT_VERIFIED')
  })

  it('rejects a suspended reporter', async () => {
    const suspended = await createTestUser('cuet.ac.bd', 'Rep Suspended')
    await svc
      .from('profiles')
      .update({ is_suspended: true })
      .eq('id', suspended.profileId)
    const req = await createRequest(alice)
    const res = await rpcCall(suspended.client, 'submit_report', {
      p_request_id: req.request_id!,
      p_target_id: alice.profileId,
      p_reason: 'Should be blocked',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('SUSPENDED')
  })

  it('rejects an out-of-range reason', async () => {
    const req = await createRequest(alice)
    const res = await rpcCall(mallory.client, 'submit_report', {
      p_request_id: req.request_id!,
      p_target_id: alice.profileId,
      p_reason: 'ab',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('enforces the server-side submit_report rate limit', async () => {
    // Drop the policy to 2/5min for a deterministic exhaustion test, then restore.
    await svc
      .from('rate_limit_policies')
      .update({ max_count: 2 })
      .eq('operation', 'submit_report')
    try {
      const reporter = await createTestUser('cuet.ac.bd', 'Rep Rate Limited')
      for (let i = 0; i < 2; i += 1) {
        const req = await createRequest(alice)
        const res = await rpcCall(reporter.client, 'submit_report', {
          p_request_id: req.request_id!,
          p_target_id: alice.profileId,
          p_reason: `Rate limited attempt ${i}`,
        })
        expect(res.ok).toBe(true)
      }
      const last = await createRequest(alice)
      const res = await rpcCall(reporter.client, 'submit_report', {
        p_request_id: last.request_id!,
        p_target_id: alice.profileId,
        p_reason: 'Should hit the limit',
      })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('RATE_LIMITED')
    } finally {
      await svc
        .from('rate_limit_policies')
        .update({ max_count: 5 })
        .eq('operation', 'submit_report')
    }
  })

  it('blocks direct client INSERT into reports (RLS)', async () => {
    const { error } = await alice.client.from('reports').insert({
      request_id: '00000000-0000-0000-0000-000000000000',
      reporter_id: alice.profileId,
      target_id: bob.profileId,
      reason: 'Direct insert attempt',
    })
    expect(error).toBeTruthy()
  })
})

describe('get_delivery_contact (T-D5, MS-13)', () => {
  let alice: TestUser
  let bob: TestUser
  let mallory: TestUser
  let requestId: string

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Contact Alice')
    bob = await createTestUser('cuet.ac.bd', 'Contact Bob')
    mallory = await createTestUser('cuet.ac.bd', 'Contact Mallory')
    const req = await createRequest(alice)
    if (!req.ok || !req.request_id) throw new Error('setup: create_request failed')
    requestId = req.request_id
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: requestId })
  })

  it('reveals the counterpart phone only during an active delivery', async () => {
    const aliceView = await rpcCall(alice.client, 'get_delivery_contact', {
      p_request_id: requestId,
    })
    expect(aliceView.ok).toBe(true)
    const contact = aliceView.contact as { display_name: string; phone: string }
    expect(contact.display_name).toBe('Contact Bob')
    expect(contact.phone).toBe('01700000000')

    const bobView = await rpcCall(bob.client, 'get_delivery_contact', {
      p_request_id: requestId,
    })
    expect(bobView.ok).toBe(true)
    expect((bobView.contact as { phone: string }).phone).toBe('01700000000')
  })

  it('audits contact disclosure without copying the phone', async () => {
    const { data: audit } = await svc
      .from('audit_log')
      .select('meta')
      .eq('action', 'contact_accessed')
      .order('id', { ascending: false })
      .limit(1)
    expect(audit).toHaveLength(1)
    const meta = audit![0].meta as Record<string, unknown>
    expect(meta.request_id ?? meta.counterpart_id).toBeTruthy()
    expect(meta).not.toHaveProperty('phone')
  })

  it('blocks a non-participant', async () => {
    const { error } = await mallory.client.rpc('get_delivery_contact', {
      p_request_id: requestId,
    })
    // RPC contract returns CONTACT_NOT_AVAILABLE-ish/not allowed — the raw RPC
    // exposes the function-level error code in the body, so call via helper.
    void error
    const res = await rpcCall(mallory.client, 'get_delivery_contact', {
      p_request_id: requestId,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NOT_PARTICIPANT')
  })

  it('returns CONTACT_NOT_AVAILABLE for open and delivered requests', async () => {
    const open = await createRequest(alice)
    const openRes = await rpcCall(alice.client, 'get_delivery_contact', {
      p_request_id: open.request_id!,
    })
    expect(openRes.ok).toBe(false)
    expect(openRes.code).toBe('CONTACT_NOT_AVAILABLE')

    const done = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: done.request_id! })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: done.request_id!,
      p_to_status: 'in_progress',
    })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: done.request_id!,
      p_to_status: 'delivered',
    })
    const doneRes = await rpcCall(alice.client, 'get_delivery_contact', {
      p_request_id: done.request_id!,
    })
    expect(doneRes.ok).toBe(false)
    expect(doneRes.code).toBe('CONTACT_NOT_AVAILABLE')
  })
})

describe('admin report reads (T-D5, moderator+)', () => {
  let alice: TestUser
  let moderator: TestUser
  let admin: TestUser
  let regular: TestUser
  let reportIds: string[]

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Read Alice')
    moderator = await createTestUser('cuet.ac.bd', 'Read Moderator')
    admin = await createTestUser('cuet.ac.bd', 'Read Admin')
    regular = await createTestUser('cuet.ac.bd', 'Read Regular')
    await grantAdminRole(moderator.profileId, 'moderator')
    await grantAdminRole(admin.profileId, 'admin')

    // Setup reports directly via the service client so this describe is
    // independent of the submit_report rate limit. All three share one
    // created_at so pagination must tie-break deterministically by id.
    const req = await createRequest(alice)
    if (!req.ok || !req.request_id) throw new Error('setup: create_request failed')
    const shared = new Date('2026-01-01T00:00:00Z').toISOString()
    reportIds = []
    for (let i = 0; i < 3; i += 1) {
      const { data, error } = await svc
        .from('reports')
        .insert({
          request_id: req.request_id,
          reporter_id: alice.profileId,
          target_id: moderator.profileId,
          reason: `Admin list reason ${i}`,
          status: 'open',
          created_at: shared,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(`setup: report insert failed: ${error?.message}`)
      reportIds.push(data.id)
    }
  })

  it('rejects non-admin listing with ADMIN_REQUIRED', async () => {
    const res = await rpcCall(regular.client, 'admin_list_reports', {})
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ADMIN_REQUIRED')
  })

  it('lets a moderator (lowest role) list open reports', async () => {
    const res = await rpcCall(moderator.client, 'admin_list_reports', {})
    expect(res.ok).toBe(true)
    const rows = res.reports as unknown as Array<{ id: string }>
    expect(rows.length).toBeGreaterThanOrEqual(3)
  })

  it('keyset paginates equal-timestamp rows without skips or duplicates', async () => {
    // Count every open report in the DB (other describes may have enqueued
    // open reports too) so the invariant holds regardless of test order.
    const { data: allOpen } = await svc
      .from('reports')
      .select('id')
      .eq('status', 'open')
    const total = allOpen?.length ?? 0

    const seen: string[] = []
    let cursor: { p_after_created_at: string | null; p_after_id: string | null } = {
      p_after_created_at: null,
      p_after_id: null,
    }
    let hasMore = true
    while (hasMore) {
      const res = await rpcCall(moderator.client, 'admin_list_reports', {
        p_status: 'open',
        p_after_created_at: cursor.p_after_created_at,
        p_after_id: cursor.p_after_id,
        p_page_size: 1,
      })
      expect(res.ok).toBe(true)
      const rows = res.reports as unknown as Array<{
        id: string
        created_at: string
      }>
      if (rows.length > 0) {
        expect(seen).not.toContain(rows[0].id)
        seen.push(rows[0].id)
        cursor = { p_after_created_at: rows[0].created_at, p_after_id: rows[0].id }
      }
      hasMore = res.has_more === true
      if (rows.length === 0) break
    }
    expect(seen).toHaveLength(total)
    expect(new Set(seen).size).toBe(total)
  })

  it('requires both cursor fields or neither', async () => {
    const res = await rpcCall(moderator.client, 'admin_list_reports', {
      p_status: 'open',
      p_after_created_at: new Date().toISOString(),
      p_after_id: null,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('rejects an out-of-range page_size', async () => {
    const res = await rpcCall(moderator.client, 'admin_list_reports', {
      p_page_size: 0,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('admin_get_report returns reporter/target display names', async () => {
    const res = await rpcCall(admin.client, 'admin_get_report', {
      p_report_id: reportIds[0],
    })
    expect(res.ok).toBe(true)
    const report = res.report as { reporter_display_name: string; target_display_name: string }
    expect(report.reporter_display_name).toBe('Read Alice')
    expect(report.target_display_name).toBe('Read Moderator')
  })

  it('rejects non-admin get and unknown ids', async () => {
    const denied = await rpcCall(regular.client, 'admin_get_report', {
      p_report_id: reportIds[0],
    })
    expect(denied.ok).toBe(false)
    expect(denied.code).toBe('ADMIN_REQUIRED')

    const missing = await rpcCall(admin.client, 'admin_get_report', {
      p_report_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(missing.ok).toBe(false)
    expect(missing.code).toBe('REPORT_NOT_FOUND')
  })
})

describe('admin resolution operations (T-D5, moderator+/admin+)', () => {
  let alice: TestUser
  let bob: TestUser
  let moderator: TestUser
  let admin: TestUser
  let regular: TestUser

  beforeAll(async () => {
    alice = await createTestUser('cuet.ac.bd', 'Res Alice')
    bob = await createTestUser('cuet.ac.bd', 'Res Bob')
    moderator = await createTestUser('cuet.ac.bd', 'Res Moderator')
    admin = await createTestUser('cuet.ac.bd', 'Res Admin')
    regular = await createTestUser('cuet.ac.bd', 'Res Regular')
    await grantAdminRole(moderator.profileId, 'moderator')
    await grantAdminRole(admin.profileId, 'admin')
  })

  async function makeReport() {
    const req = await createRequest(alice)
    if (!req.ok || !req.request_id) throw new Error('setup: create_request failed')
    const { data, error } = await svc
      .from('reports')
      .insert({
        request_id: req.request_id,
        reporter_id: alice.profileId,
        target_id: bob.profileId,
        reason: 'Resolution setup report',
        status: 'open',
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`setup: report insert failed: ${error?.message}`)
    return data.id
  }

  it('rejects non-admin resolution with ADMIN_REQUIRED', async () => {
    const reportId = await makeReport()
    const res = await rpcCall(regular.client, 'admin_resolve_report', {
      p_report_id: reportId,
      p_outcome: 'dismissed',
      p_resolution: 'No evidence',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ADMIN_REQUIRED')
  })

  it('moderator resolves an open report; identical retry is idempotent', async () => {
    const reportId = await makeReport()
    const res = await rpcCall(moderator.client, 'admin_resolve_report', {
      p_report_id: reportId,
      p_outcome: 'resolved',
      p_resolution: 'Warning issued',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('resolved')

    const retry = await rpcCall(moderator.client, 'admin_resolve_report', {
      p_report_id: reportId,
      p_outcome: 'resolved',
      p_resolution: 'warning issued', // normalized match (case/trim)
    })
    expect(retry.ok).toBe(true)
    expect(retry.status).toBe('resolved')
  })

  it('any different attempt against a non-open report returns REPORT_NOT_OPEN', async () => {
    const reportId = await makeReport()
    await rpcCall(admin.client, 'admin_resolve_report', {
      p_report_id: reportId,
      p_outcome: 'dismissed',
      p_resolution: 'Lack of evidence',
    })
    const res = await rpcCall(moderator.client, 'admin_resolve_report', {
      p_report_id: reportId,
      p_outcome: 'resolved',
      p_resolution: 'Changed my mind',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('REPORT_NOT_OPEN')
  })

  it('moderator cannot suspend (admin+ only)', async () => {
    const res = await rpcCall(moderator.client, 'admin_suspend_user', {
      p_target_id: bob.profileId,
      p_reason: 'Moderator should not reach here',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ADMIN_REQUIRED')
  })

  it('admin suspends and unsuspends a user, and it takes effect immediately', async () => {
    const res = await rpcCall(admin.client, 'admin_suspend_user', {
      p_target_id: bob.profileId,
      p_reason: 'Repeated misuse',
    })
    expect(res.ok).toBe(true)

    try {
      const own = await rpcCall(bob.client, 'get_own_private_profile', {})
      expect((own.profile as { is_suspended: boolean }).is_suspended).toBe(true)

      const blocked = await rpcCall(bob.client, 'create_request', {
        p_title: 'Suspended test',
        p_description: 'Should fail',
        p_pickup_location: 'A',
        p_dropoff_location: 'B',
        p_urgency: 'low',
        p_reward_suggestion: 10,
      })
      expect(blocked.ok).toBe(false)
      expect(blocked.code).toBe('SUSPENDED')

      // Re-suspending is a no-op (idempotent).
      const again = await rpcCall(admin.client, 'admin_suspend_user', {
        p_target_id: bob.profileId,
        p_reason: 'Still suspended',
      })
      expect(again.ok).toBe(true)
    } finally {
      const lifted = await rpcCall(admin.client, 'admin_unsuspend_user', {
        p_target_id: bob.profileId,
      })
      expect(lifted.ok).toBe(true)
    }

    const own2 = await rpcCall(bob.client, 'get_own_private_profile', {})
    expect((own2.profile as { is_suspended: boolean }).is_suspended).toBe(false)
  })

  it('admin cancels an in_progress delivery that participants cannot cancel', async () => {
    const req = await createRequest(alice)
    if (!req.ok || !req.request_id) throw new Error('setup: create_request failed')
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: req.request_id })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: req.request_id,
      p_to_status: 'in_progress',
    })

    // Participants themselves cannot cancel after pickup.
    const participantCancel = await rpcCall(bob.client, 'cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'I changed my mind',
    })
    expect(participantCancel.ok).toBe(false)
    expect(participantCancel.code).toBe('CANCEL_NOT_ALLOWED')

    const res = await rpcCall(moderator.client, 'admin_cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'Pickup agent unresponsive',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('cancelled')

    // Delivery event records the admin cancellation.
    const { data: events } = await svc
      .from('delivery_events')
      .select('to_status, note')
      .eq('request_id', req.request_id)
      .eq('to_status', 'cancelled')
    expect(events).toHaveLength(1)
    expect(events![0].note).toBe('Pickup agent unresponsive')

    // Retry is idempotent.
    const retry = await rpcCall(moderator.client, 'admin_cancel_delivery', {
      p_request_id: req.request_id,
      p_reason: 'Anything else',
    })
    expect(retry.ok).toBe(true)
  })

  it('cannot cancel a delivered request (INVALID_TRANSITION)', async () => {
    const done = await createRequest(alice)
    await rpcCall(bob.client, 'accept_delivery', { p_request_id: done.request_id! })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: done.request_id!,
      p_to_status: 'in_progress',
    })
    await rpcCall(bob.client, 'advance_delivery', {
      p_request_id: done.request_id!,
      p_to_status: 'delivered',
    })
    const denied = await rpcCall(admin.client, 'admin_cancel_delivery', {
      p_request_id: done.request_id!,
      p_reason: 'Too late',
    })
    expect(denied.ok).toBe(false)
    expect(denied.code).toBe('INVALID_TRANSITION')
  })

  it('rejects non-admin cancel with ADMIN_REQUIRED', async () => {
    const req = await createRequest(alice)
    const res = await rpcCall(regular.client, 'admin_cancel_delivery', {
      p_request_id: req.request_id!,
      p_reason: 'Not allowed',
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ADMIN_REQUIRED')
  })
})

describe('account deletion & anonymization (T-D5, 03 §8)', () => {
  let admin: TestUser
  let victim: TestUser
  let busy: TestUser

  beforeAll(async () => {
    admin = await createTestUser('cuet.ac.bd', 'Del Admin')
    victim = await createTestUser('cuet.ac.bd', 'Del Victim')
    busy = await createTestUser('cuet.ac.bd', 'Del Busy')
    await grantAdminRole(admin.profileId, 'admin')
  })

  it('rejects non-admin deletion authorization', async () => {
    const res = await rpcCall(victim.client, 'authorize_admin_user_deletion', {
      p_target_profile_id: victim.profileId,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ADMIN_REQUIRED')
  })

  it('returns ACTIVE_DELIVERY_EXISTS for a target with an active delivery', async () => {
    const requester = await createTestUser('cuet.ac.bd', 'Del Requester')
    const req = await createRequest(requester)
    if (!req.ok || !req.request_id) throw new Error('setup: create_request failed')
    await rpcCall(busy.client, 'accept_delivery', { p_request_id: req.request_id })

    const res = await rpcCall(admin.client, 'authorize_admin_user_deletion', {
      p_target_profile_id: busy.profileId,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ACTIVE_DELIVERY_EXISTS')
  })

  it('authorizes deletion for a clean target and records the request', async () => {
    const res = await rpcCall(admin.client, 'authorize_admin_user_deletion', {
      p_target_profile_id: victim.profileId,
    })
    expect(res.ok).toBe(true)
    expect(res.auth_user_id).toBe(victim.userId)

    const { data: audit } = await svc
      .from('audit_log')
      .select('action')
      .eq('action', 'account_deletion_requested')
      .eq('target_id', victim.profileId)
    expect(audit).toHaveLength(1)
  })

  it('BEFORE DELETE trigger anonymizes the profile and removes the auth user', async () => {
    const idBefore = victim.profileId
    const { error: delError } = await svc.auth.admin.deleteUser(victim.userId)
    expect(delError).toBeNull()

    // Auth user is gone (hard delete).
    const { data: authUser } = await svc.auth.admin.getUserById(victim.userId)
    expect(authUser?.user ?? null).toBeNull()

    // Profile row persists, anonymized, UUID preserved.
    const { data: profile } = await svc
      .from('profiles')
      .select('*')
      .eq('id', idBefore)
    expect(profile).toHaveLength(1)
    const row = profile![0] as Record<string, unknown>
    expect(row.id).toBe(idBefore)
    expect(row.auth_user_id).toBeNull()
    expect(row.display_name).toBe('Deleted user')
    expect(row.is_suspended).toBe(true)
    expect(row.student_id).toBeNull()
    expect(row.phone).toBeNull()
    expect(row.department).toBeNull()
    expect(row.hall).toBeNull()

    // Excluded from public browse.
    const { data: pub } = await svc
      .from('public_profiles')
      .select('id')
      .eq('id', idBefore)
    expect(pub).toHaveLength(0)

    // PII-free audit event.
    const { data: audit } = await svc
      .from('audit_log')
      .select('actor_id, meta')
      .eq('action', 'profile_anonymized')
      .eq('target_id', idBefore)
    expect(audit).toHaveLength(1)
    const meta = audit![0].meta as Record<string, unknown>
    expect(meta.source).toBe('auth_user_before_delete')
    expect(meta).not.toHaveProperty('phone')
    expect(meta).not.toHaveProperty('student_id')
    expect(meta).not.toHaveProperty('email')
  })

  it('an old token (deleted account) cannot recreate a profile', async () => {
    const res = await rpcCall(victim.client, 'create_profile', {
      p_display_name: 'Zombie Account',
      p_student_id: null,
      p_department: null,
      p_hall: null,
      p_phone: null,
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('UNAUTHENTICATED')
  })

  it('retry against a fully anonymized profile returns already_deleted', async () => {
    const res = await rpcCall(admin.client, 'authorize_admin_user_deletion', {
      p_target_profile_id: victim.profileId,
    })
    expect(res.ok).toBe(true)
    expect(res.already_deleted).toBe(true)
  })

  it('active-delivery auth deletion rolls back and the user survives', async () => {
    const { error } = await svc.auth.admin.deleteUser(busy.userId)
    expect(error).toBeTruthy()

    const { data: authUser } = await svc.auth.admin.getUserById(busy.userId)
    expect(authUser?.user ?? null).not.toBeNull()
  })

  it('Edge Function boundary: validation error on missing target_profile_id', async () => {
    const { data, error } = await admin.client.functions.invoke('admin_delete_or_anonymize_user', {
      body: { invalid: 'payload' }
    })
    // supabase-js returns error on non-2xx
    expect(error).toBeTruthy()
    // Depending on supabase-js version, the body might be parsed in error.context
    const errorBody = await error?.context?.json().catch(() => ({}))
    expect(errorBody?.code).toBe('VALIDATION_ERROR')
  })

  it('Edge Function boundary: rejects non-admin caller', async () => {
    // create a regular user for this test
    const localRegular = await createTestUser('cuet.ac.bd', 'Local Regular')
    const { data, error } = await localRegular.client.functions.invoke('admin_delete_or_anonymize_user', {
      body: { target_profile_id: victim.profileId }
    })
    expect(error).toBeTruthy()
    const errorBody = await error?.context?.json().catch(() => ({}))
    expect(errorBody?.code).toBe('ADMIN_REQUIRED')
  })
})