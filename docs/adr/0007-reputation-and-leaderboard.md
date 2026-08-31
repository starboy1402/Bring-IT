# ADR-0007: Reputation & Leaderboard Scope

**Status:** Proposed
**Date:** 2026-08-31
**Decision owner:** Project owner
**Deciders:** Project owner
Legacy proposal replaced: the leaderboard/reputation-in-MVP assumption in `PLAN.md` / `DEVELOPER_TASK_PLAN.md` / `.kilo/plans/bringit-planning.md`.

## Context
Earlier plans included a leaderboard and points gamification in MVP. The brief says to defer leaderboard gamification and rating abuse/leaderboard manipulation concerns, while still shipping a **minimal bilateral rating system** in MVP.

## Decision Drivers
- Need basic trust signal after a delivery
- Avoid gamification manipulation surface in MVP
- Keep MVP small and safe
- Public averages must not expose individual private ratings

## Considered Options
1. **Minimal bilateral ratings in MVP + defer leaderboard/points (chosen):** rate once each direction after `delivered`; no points, no public ranking.
2. **Full leaderboard + points in MVP (rejected):** invites point/rating farming; needs anti-abuse we aren't building yet.
3. **No ratings at all (rejected):** removes the only post-delivery trust signal.

## Decision
- **MVP:** minimal bilateral ratings only — `ratings` table with `(request_id, rater_id, role)` uniqueness, scores 1–5, no editing, only after `delivered` (`03` §3.5, `05` §3.9). Individual ratings are visible only to participants and to the ratee. Public averages are **not** exposed in MVP (`03` §9). If public averages are later approved, they must use a SECURITY DEFINER function with minimum-count privacy.
- **Deferred:** leaderboard, points, badges, gamification (PM-3). Reintroduces manipulation risk → requires rate-limiting + anomaly review when built.

## Rationale
Ratings give a trust signal without the manipulation/abuse surface of public points; matches the recommended MVP in the brief. Keeping averages participant-only prevents privacy leaks and aggregation attacks.

## Consequences
**Positive:** trust signal with low abuse risk; smaller MVP; no public aggregate privacy risk.
**Negative:** no public ranking/motivation mechanic at launch.

## Cost implications
- **Dev cost:** minimal; `ratings` table + `submit_rating` RPC are already in critical path.
- **Future cost:** PM-3 leaderboard requires aggregate views, anomaly detection, and rate-limiting.
- **Opportunity cost:** users cannot compare reputation publicly; mitigated by per-user rating summary visible to self.

## Security implications
- Uniqueness + post-`delivered` gate + role match prevents most rating abuse (`04` §6.5).
- No public averages eliminates aggregate privacy risk (minimum-count exposure, small-set identification).
- If averages are later approved, SECURITY DEFINER function enforces minimum-count and authorization.

## Reversibility
High: adding a leaderboard view later is additive over existing `ratings`.

## Approval conditions
- Project owner confirms no public averages in MVP.
- If public averages are desired post-MVP, minimum-count threshold and function design approved.

## Implementation Implications
- `03-data-model.md` §3.5 (ratings), §5 (visibility), §9 (aggregate safety).
- `05-api-and-business-operations.md` §3.9 (`submit_rating`), §2 (`RATING_*` codes), §4.1 (idempotency).
- Tasks `T-R2` in `08`; tests in `07` §5.

## Related
- `../planning/01-product-requirements.md` (MS-10, deferred)
- `../planning/03-data-model.md` §3.5, §9
- `../planning/04-security-and-threat-model.md` §6.5
- `../planning/07-testing-strategy.md` §5
