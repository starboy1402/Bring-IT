# ADR-0002: Frontend Stack & Dependency Control

**Status:** Proposed
**Date:** 2026-08-31
**Decision owner:** Project owner
**Deciders:** Project owner
Legacy proposal replaced: the proposal described in `.kilo/plans/bringit-planning.md` that marked this decision Accepted without approval.

## Context
The MVP needs a fast, mobile-friendly web UI. Several libraries (React Query, Radix, Vaul, Sonner, Framer Motion) were proposed in `gemini-planning.md` as if approved. The brief requires each proposed dependency to be justified for MVP or rejected.

## Decision Drivers
- Modern React, fast DX, mobile-first
- Minimal dependency surface for an MVP
- Accessibility without heavy frameworks
- No premature abstraction

## Considered Options (core stack)
- **React 19 + Vite + React Router v7 + Tailwind v4 + TypeScript** (chosen): fast, standard, low config.
- Next.js: SSR/SSG power not needed for a client-rendered SPA with Supabase; adds complexity.
- React 18 + CRA: deprecated/slower.

## Decision
Adopt **React 19 + Vite + React Router v7 + Tailwind CSS v4 + TypeScript**.

### Dependency control (proposed libraries — NOT auto-approved)
| Library | MVP decision | Reason |
| --- | --- | --- |
| @tanstack/react-query | **Rejected (MVP)** | Supabase client + Realtime suffice; premature. |
| Radix UI | **Deferred** | Hand-rolled a11y components enough. |
| Vaul | **Rejected (MVP)** | Polish only. |
| Sonner | **Deferred** | Minimal native toast suffices. |
| Framer Motion | **Rejected (MVP)** | Animation out of MVP scope. |
| zod | **Accepted (light)** | Cheap client-edge validation; not a replacement for DB constraints. |
| lucide-react | **Accepted** | Negligible cost, clear icons. |
| Vitest / RTL / Playwright | **Accepted** | Required by `07`. |

Any future addition requires an ADR amendment demonstrating material MVP benefit.

## Rationale
Lean stack reduces risk, review cost, and bundle size; matches the small-safe-MVP principle (`01` §2).

## Consequences
**Positive:** small bundle, fast builds, fewer security surfaces, easier review.
**Negative:** more hand-rolled UI; some a11y burden falls on us (mitigated by manual a11y tests, `07`).

## Cost implications
- **Bundle size:** minimal dependencies keep initial load fast.
- **Maintenance:** fewer libraries = fewer upstream security patches and breaking changes.
- **DX cost:** hand-rolled components require more initial authoring but less abstraction debt.

## Security implications
- Smaller dependency surface reduces supply-chain risk.
- No animation/toast libraries eliminate their respective CVEs and initialization quirks.
- Client-edge zod validation is UX only; DB constraints + RPCs remain authoritative (`05` §5).

## Reversibility
High for rejected libs (not added). Moderate for core stack (standard React, easy to later wrap with React Query if needed).

## Approval conditions
- Team reviews dependency table and confirms no rejected library is secretly required for MVP.
- Bundle-size budget agreed (e.g., <200KB initial JS).

## Implementation Implications
- `02-system-architecture.md` §3–§4 reflects this.
- UI components built in-repo (`Button`, `Input`, `Card`, `Modal`, minimal `Toast`).

## Related
- `../planning/02-system-architecture.md` §4
- `../planning/01-product-requirements.md` §3 (animations deferred)
