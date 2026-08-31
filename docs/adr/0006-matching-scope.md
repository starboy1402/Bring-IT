# ADR-0006: Matching & Recommendation Scope

**Status:** Proposed
**Date:** 2026-08-31
**Decision owner:** Project owner
**Deciders:** Project owner
Legacy proposal replaced: the proposal described in `.kilo/plans/bringit-planning.md` that marked the weighted matching formula Accepted without approval.

## Context
Earlier plans put a weighted route/time/urgency/rating matching engine in the MVP (`PLAN.md`, `DEVELOPER_TASK_PLAN.md`, `gemini-planning.md`). The brief says to prefer a small, safe MVP and to defer route scoring unless it materially helps. At launch there is no reliable geodata, no traveler-route model, and no delivery time-window model.

## Decision Drivers
- Small, safe MVP
- No fabricated geodata or traveler routes
- Avoid nonessential dependencies/complexity
- Keep browse usable without ranking

## Considered Options
1. **Defer matching entirely (chosen for MVP):** browse `open` requests with simple filters (urgency) and sort (newest). No scoring, no ranking.
2. **Rule-based weighted scoring (deferred):** `w1·Route + w2·Time + w3·Urgency + w4·Rating`. Needs route/time-window data we don't have at MVP.
3. **ML model:** rejected — needs data, overkill.

## Decision
**Defer matching and recommendation to post-MVP (PM-2).** MVP browsing is filter + recency only. The traveler-availability / delivery-time-window schema is **provisional** (`03` §7) and must not be created in MVP.

## Rationale
Matching provides little value without route/availability data, and adds risk and scope. A plain open-request feed fully supports the core delivery loop (create → browse → accept → deliver).

## Consequences
**Positive:** smaller MVP, no fake geodata, faster safe launch.
**Negative:** deliverers must scan the open list manually (acceptable at low CUET volume).

## Cost implications
- **Dev cost:** zero for MVP; matching is not built.
- **Future cost:** PM-2 requires new schema, RPCs, and UI; estimated moderate effort.
- **Opportunity cost:** users may find manual browsing less efficient, but acceptable at low volume.

## Security implications
- No matching engine means no scoring logic to exploit or manipulate.
- Reduces attack surface (no new RPCs or data exposures for MVP).

## Reversibility
High: adding matching later is additive (new RPC + UI), doesn't change core schema except optional `traveler_availability` (`03` §7).

## Approval conditions
- Project owner confirms manual browsing is acceptable at launch volume.
- PM-2 budget/priority approved when volume justifies matching.

## Implementation Implications
- `01-product-requirements.md` §3 (deferred).
- `03-data-model.md` §7 (provisional only).
- Milestone PM-2 planned separately.

## Related
- `../planning/01-product-requirements.md` §3
- `../planning/03-data-model.md` §7
- `../planning/02-system-architecture.md` (no matching service in MVP)
