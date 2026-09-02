# BringIt — Planning Package

Implementation-ready planning for **BringIt**, a CUET-focused peer-to-peer delivery platform. This package is written **before any application code**. It is the contract for implementation, not the implementation itself.

> **Status:** This is a *planning* package with an **implemented, test-verified Milestone 1** (see `08-implementation-roadmap.md` and the traceability notes there). Decisions are marked **Proposed** unless there is explicit human approval. On **2026-09-03** the project owner approved all open questions (Q1–Q12, RR1–RR4) — see the Approval Record in `10-open-questions.md`; ADR-0003 and ADR-0008 are accordingly **Accepted**. Residual release risk is tracked by the verification gates in `07` §6 (lint, CI, Deno edge-function tests, E2E stability), not by undecided questions.

## How to read this package

The documents are a directed graph, not a stack. Each concern has **one authoritative source**; other documents reference it rather than redefining it. If you find a duplicated requirement, treat the authoritative document as correct and file it in `10-open-questions.md`.

| Concern | Authoritative document | Section |
| --- | --- | --- |
| MVP scope, must-have vs deferred, acceptance criteria for scope | `01-product-requirements.md` | §2–§3 |
| System components, deployment, dependency control | `02-system-architecture.md` | §2–§4 |
| Database schema, types, constraints, indexes, **RLS policy SQL** | `03-data-model.md` | §3, §6 |
| Threat model, abuse paths, RLS rationale, **RLS coverage matrix / negative tests** | `04-security-and-threat-model.md` | §3–§5 |
| API & business-operation contracts, RPC signatures, **stable error codes** | `05-api-and-business-operations.md` | §3–§5 |
| Realtime architecture, subscription auth, dedup/ordering/recovery | `06-realtime-design.md` | §2–§5 |
| Continuous testing strategy, coverage tiers, TDD rules | `07-testing-strategy.md` | §2–§6 |
| Roadmap, dependency ordering, critical path, milestones | `08-implementation-roadmap.md` | §3–§6 |
| Release, environments, operations, monitoring | `09-release-and-operations.md` | §2–§4 |
| Open questions, assumptions, contradictions log | `10-open-questions.md` | all |
| Architecture decision records (status, context, consequences) | `../adr/README.md` and individual ADRs | — |

## Decision authority

All significant decisions live as ADRs under `docs/adr/`. The planning docs **reference** ADRs; ADRs are the authority for *why* a choice was made. Current ADR index:

| ADR | Title | Status |
| --- | --- | --- |
| [0001](../adr/0001-backend-platform.md) | Backend platform (Supabase) | Proposed |
| [0002](../adr/0002-frontend-stack.md) | Frontend stack & dependency control | Proposed |
| [0003](../adr/0003-authentication-and-student-verification.md) | Authentication & student verification | Proposed |
| [0004](../adr/0004-delivery-state-machine.md) | Delivery state machine | Proposed |
| [0005](../adr/0005-realtime-and-chat.md) | Realtime & chat architecture | Proposed |
| [0006](../adr/0006-matching-scope.md) | Matching & recommendation scope | Proposed |
| [0007](../adr/0007-reputation-and-leaderboard.md) | Reputation & leaderboard scope | Proposed |

> The earlier plans (`PLAN.md`, `gemini-planning.md`, `.kilo/plans/bringit-planning.md`) marked these same decisions **Accepted**. That was premature: there is no recorded approval. All ADRs here are reset to **Proposed**. See `10-open-questions.md` §Assumptions.

## Source documents reviewed

- `PLAN.md` — original product plan (broad MVP incl. leaderboard/matching).
- `DEVELOPER_TASK_PLAN.md` — phase/task breakdown (still includes matching + leaderboard in MVP).
- `gemini-planning.md` — SDD with RLS and realtime design (several security gaps; see `04`).
- `.kilo/plans/bringit-planning.md` — extended planning doc (duplicate status state, premature "Accepted" ADRs).

This package **supersedes** the scope/security/realtime/state-machine sections of those files. Their content is treated as input, not authority.

## Recommended first milestone

See `08-implementation-roadmap.md` §6. In one sentence: **Milestone 1 = a verified, privacy-safe, database-enforced delivery core** (auth + profile + create/browse requests + atomic accept + DB state machine + status history + participant-only chat + completion + minimal bilateral rating + minimal report/admin resolution), shipped with RLS, concurrency, and two-user E2E tests — *without* matching, leaderboard, presence, or animations.

## Validation checklist (completed at end of authoring)

- [x] Internal links and document consistency validated (see `10` contradictions log)
- [x] Contradictory requirements searched and resolved (see `10`)
- [x] Every table has a complete RLS policy plan (`03` §6, cross-checked in `04` §5)
- [x] Every MVP feature maps to roadmap tasks + acceptance criteria + tests (`08` ↔ `07`)
- [x] No task incorrectly marked complete (roadmap tasks are all *planned*, none done)
- [x] MS-1 through MS-13 each mapped to schema, API, roadmap tasks, and tests
- [x] Static planning/contract checks pass; executable SQL and RLS behavior must still be proven by the migration/integration tests in `07`
