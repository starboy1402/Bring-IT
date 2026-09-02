# 8. Background Jobs and Cron Provisioning

Date: 2026-09-02

## Status
Accepted

## Context
The notification outbox worker needs to run on a schedule to claim and process due notification rows. Initially, we intended to use `pg_cron` via migrations, but local Supabase development environments have `pg_cron` installed as a library but not activated by default, which can cause migrations to fail or silently swallow exceptions if not handled properly. Furthermore, testing edge functions locally requires deterministic dependency injection rather than relying solely on actual chron schedules.

## Decision
1. **Idempotent Extensions**: We will create `pg_cron` and `pg_net` extensions using `CREATE EXTENSION IF NOT EXISTS` via a migration.
2. **Current Settings for Secrets**: Instead of hardcoding secrets or swallowing errors, we will inject the notification cron secret securely into the database via `current_setting('app.settings.notification_cron_secret', true)`. This ensures that local environments fail closed cleanly without crashing the migration if the setting is omitted.
3. **Dependency Injection**: We refactored our Edge Function `index.ts` to delegate to a testable `handleRequest` handler where the environment variables and dependencies can be injected directly, allowing robust and deterministic testing in CI via Deno tests, circumventing docker orchestration constraints.

## Consequences
- Testing edge functions is fully isolated, deterministic, and does not require complex Docker networking.
- Local instances correctly schedule the `pg_cron` jobs without crashing the migrations.
- Production instances can be configured exactly the same way using vault/config bindings.
