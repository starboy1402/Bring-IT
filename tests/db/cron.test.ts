import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'

describe('pg_cron provisioning', () => {
  it('has exactly one active process-notification-outbox job', () => {
    const output = execSync('node scripts/verify-cron.js', { encoding: 'utf-8' })
    expect(output).toContain('Cron job verified successfully (count: 1)')
  })
})
