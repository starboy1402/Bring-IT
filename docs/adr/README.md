# Architecture Decision Records — BringIt

This directory holds the ADRs for BringIt. The earlier plans (`PLAN.md`, `gemini-planning.md`, `.kilo/plans/bringit-planning.md`) marked equivalent decisions **Accepted** without any recorded approval; per the planning brief those were reset to Proposed. On **2026-09-03** the project owner approved all open questions (Q1–Q12, RR1–RR4 — see the Approval Record in `../planning/10-open-questions.md`), which satisfies the approval conditions of **ADR-0003** and **ADR-0008**; those are now **Accepted**. The remaining ADRs stay **Proposed** until their own non-question conditions are met (e.g. ADR-0002's bundle-size budget is currently unmet at ~548 KB initial JS).

## Status legend
- **Proposed** — under discussion, not yet approved (default for this package)
- **Accepted** — approved and being implemented
- **Rejected** — considered, not adopted
- **Deprecated** — no longer relevant
- **Superseded** — replaced by another ADR

## Index

| ADR | Title | Status | Date | Decision owner |
| --- | --- | --- | --- | --- |
| [0001](0001-backend-platform.md) | Backend platform (Supabase) | Proposed | 2026-08-31 | Project owner |
| [0002](0002-frontend-stack.md) | Frontend stack & dependency control | Proposed | 2026-08-31 | Project owner |
| [0003](0003-authentication-and-student-verification.md) | Authentication & student verification | **Accepted** (2026-09-03) | 2026-08-31 | Project owner |
| [0004](0004-delivery-state-machine.md) | Delivery state machine | Proposed | 2026-08-31 | Project owner |
| [0005](0005-realtime-and-chat.md) | Realtime & chat architecture | Proposed | 2026-08-31 | Project owner |
| [0006](0006-matching-scope.md) | Matching & recommendation scope | Proposed | 2026-08-31 | Project owner |
| [0007](0007-reputation-and-leaderboard.md) | Reputation & leaderboard scope | Proposed | 2026-08-31 | Project owner |
| [0008](0008-background-jobs-and-cron.md) | Background jobs & cron provisioning | **Accepted** (2026-09-02) | 2026-09-02 | Project owner |

## ADR governance requirements

Every ADR in this directory must document:
- **Decision owner / deciders:** who is accountable for this decision.
- **Approval conditions:** what must be true before this can move to Accepted.
- **Cost implications:** operational, financial, or opportunity cost.
- **Security implications:** how this choice affects the attack surface or trust boundary.
- **Reversibility:** how hard it is to change or revert after data exists.
- **Related ADRs:** links to ADRs that this one depends on, complements, or may supersede.
- **Authoritative planning documents:** links to the planning docs that own the requirement this ADR satisfies.

## How ADRs relate to the planning docs
- Product scope that these enable/defer: `../planning/01-product-requirements.md`.
- Schema/RPCs these imply: `../planning/03-data-model.md`, `../planning/05-api-and-business-operations.md`.
- Security/runtime context: `../planning/04-security-and-threat-model.md`, `../planning/06-realtime-design.md`.
- Open approvals that may change an ADR: `../planning/10-open-questions.md`.

## Creating a new ADR
Copy the structure of an existing file. Use `NNNN-kebab-title.md`. Set status **Proposed** unless explicitly approved. Link related ADRs and the planning doc that owns the requirement.
