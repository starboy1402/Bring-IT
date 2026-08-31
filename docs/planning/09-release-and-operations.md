# 09 — Release & Operations

**Authoritative for:** environments, CI/CD, release gates, secret handling, monitoring, operations runbook references.
**Status:** Proposed.

## 1. Environments

| Env | Host | Purpose | Provisioned by |
| --- | --- | --- | --- |
| Local | Supabase CLI + Vite dev | feature work & tests | developer |
| CI | ephemeral | run `07` suites on PR | GitHub Actions |
| Staging | Vercel + Supabase project | pre-prod validation | **open question — `10`** |
| Production | Vercel + Supabase project | live | **open question — `10`** |

No production/staging project is assumed to exist. Provisioning owner is an open question.

## 2. CI/CD (GitHub Actions)

On every PR:
1. `tsc --noEmit` (type gate).
2. Secret-scan: fail if any server/secret credential appears in the client bundle. Allowlist only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, which are public client configuration (`04` T8).
3. Vitest: unit + component + integration + **RLS** + **concurrency** + **realtime** (`07` §2).
4. Playwright: **two-user E2E** golden path (`07` §5, `08` T-Q2).
5. Block merge on any failure.

Deploy: Vercel on merge to `main` (staging) and tagged release (prod). Migrations applied via Supabase CLI against the target project; **migrations are reviewed and applied explicitly**, never auto-run blindly.

## 3. Secret & config handling

- Client only ever holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (public by design).
- The server credential exists only in the deployment secret store for the two named Edge Functions: notification processing and Auth Admin account deletion. It is never imported by the SPA and never used inside SECURITY DEFINER functions. Database functions use their owner privileges. Enforce this with secret scanning, deployment-variable allowlists, and code review.
- RLS is the security boundary; the anon key grants nothing the policies don't allow.

## 4. Monitoring & operations (MVP minimal)

- **Metrics (proposed):** successful deliveries/week, active requests, cancellation rate, dispute rate (post-dispute-flow), RLS-denied-request alerts (if available). No SLA committed (`01` §5).
- **Error visibility:** capture RPC `code` values (`05` §2) client-side; aggregate `INVALID_TRANSITION`/`ALREADY_ACCEPTED` spikes as anomaly signals.
- **Outbox:** monitor pending backlog age, stale processing leases, retry counts, and `failed_terminally`; alert when the oldest due row exceeds five minutes or any terminal failure appears.
- **Account deletion:** monitor Auth Admin failures and trigger failures separately. Keep access-token expiry short; after Auth deletion, protected database operations must fail because no profile remains linked to the deleted Auth ID.
- **Incident:** for MVP, incidents handled by admin/owner via Supabase dashboard + `audit_log` review. No 24/7 SLA.
- **Backup:** rely on Supabase managed backups for the prod project (confirm retention with provider — **open question**).
- **Rollback:** Vercel instant rollback for SPA; DB migrations are forward-only with reviewed down-migrations for risky changes.

## 5. Release readiness gate

A release may proceed only when: all `08` MVP tasks are done; all `07` suites pass; RLS, two-worker outbox, and Auth-deletion rollback tests pass; the two-user E2E passes; secret scanning passes; and relevant `10` approvals are resolved.

## 6. Cross-references

- Tasks/gates: `08-implementation-roadmap.md`.
- Tests: `07-testing-strategy.md`.
- Security/secrets: `04-security-and-threat-model.md` (T8), `03` §6.
- Open provisions: `10-open-questions.md`.
