# ADR-0001: Backend Platform (Supabase)

**Status:** Proposed
**Date:** 2026-08-31
**Decision owner:** Project owner
**Deciders:** Project owner
Legacy proposal replaced: the proposal described in `.kilo/plans/bringit-planning.md` that marked this decision Accepted without approval.

## Context
BringIt needs authentication, a relational database, realtime updates, and optional file storage with minimal DevOps for a student project. The earlier plan chose Supabase and marked it Accepted without approval.

## Decision Drivers
- JWT auth, Postgres, realtime, storage in one managed platform
- Free/low tier acceptable for MVP scale (assumption A2)
- Team familiarity with Postgres
- Low operational burden

## Considered Options
- **Supabase** (chosen): Auth + Postgres + Realtime + Storage; Postgres-native; RLS.
- **Firebase**: mature realtime, but NoSQL (Firestore) — poor fit for relational integrity/RLS model we need.
- **Custom Node + Postgres**: full control, but high DevOps cost for a student MVP.
- **AWS Amplify**: enterprise-grade, overkill.

## Decision
Adopt **Supabase** as the backend platform. Use Auth, Postgres (RLS/RPCs/triggers), Realtime (Postgres Changes), and exactly two trusted Edge Functions for MVP: scheduled notification delivery and admin account deletion. **Storage is deferred for MVP**.

## Rationale
Single managed platform covering all MVP needs; Postgres enables the integrity constraints and RLS this package requires; Realtime integrates with RLS for safe subscriptions.

## Consequences
**Positive:** fast setup; strong consistency; RLS enforcement; free tier.
**Negative:** vendor lock-in; Realtime scale limits; some query customization limits.

## Cost implications
- **Operational cost:** Supabase free/low tier covers MVP launch; paid tier may be needed if volume grows.
- **Migration cost:** switching away from Supabase later requires reimplementing Auth/Realtime and migrating data.
- **Opportunity cost:** time spent learning Supabase-specific features vs. generic Postgres.

## Security implications
- The server credential is scoped to the two named Edge Functions and must never reach the client (`09` §3, `04` T8).
- RLS + SECURITY DEFINER RPCs are the security boundary; anon key is public by design.
- Realtime subscriptions are filtered by RLS; no private channel leakage (`06` §3).

## Reversibility
Moderate: data is standard Postgres; migration to self-hosted Postgres possible but requires reimplementing Auth/Realtime.

## Approval conditions
- Project owner confirms Supabase account/project provisioning.
- Team confirms familiarity with Postgres + Supabase CLI.
- Service-role key handling policy accepted (`09` §3).

## Implementation Implications
- `02`–`06` assume Supabase Auth, Database, Realtime, and the two named Edge Functions.
- Server credentials are deployment secrets and are never shipped to the client (`09` §3, `04` T8).

## Related
- `../planning/02-system-architecture.md`, `../planning/03-data-model.md`, `../planning/04-security-and-threat-model.md`
- `../adr/0003-authentication-and-student-verification.md` (Auth layer)
- Superseded-by-future: none.
