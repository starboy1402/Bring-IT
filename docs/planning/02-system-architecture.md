# 02 — System Architecture

**Authoritative for:** component topology, deployment model, and **dependency control** (which proposed libraries are accepted vs rejected for MVP).
**Status:** Proposed.

## 1. Context & constraints

- Platform: CUET student-only, non-commercial, low expected concurrency at launch.
- Goal: ship a safe MVP with minimal DevOps. Backend-as-a-Service is appropriate (see ADR-0001).
- Hard constraints from this package: database-enforced state machine (ADR-0004), participant-only data (ADR-0003/0004), persisted-message realtime (ADR-0005).

## 2. Component topology

```
                ┌─────────────────────────────────────────┐
                │  Vercel (static SPA) — React 19 + Vite   │
                └───────────────┬─────────────────────────┘
                                │ HTTPS (PostgREST + Auth + Realtime WS)
                ┌───────────────▼─────────────────────────┐
                │  Supabase project (single tenant)        │
                │  ├─ Auth (GoTrue)                        │
                │  ├─ Postgres  (RLS + RPCs + triggers)    │
                │  ├─ Realtime (Postgres Changes)          │
                │  ├─ Edge Functions (two trusted jobs)    │
                │  └─ Storage (DEFERRED for MVP)           │
                └──────────────────────────────────────────┘
```

- **Client** never writes mutable delivery state directly. It calls **RPCs** (`accept_delivery`, `advance_delivery`, `cancel_delivery`) that run inside a Postgres transaction with a row lock. See ADR-0004, `05`.
- **Realtime** is subscribe-only on Postgres Changes; the client never sends chat via broadcast (ADR-0005).
- **Trusted Edge Functions:** `process-notification-outbox` is scheduled; `admin_delete_or_anonymize_user` is caller-invoked but authorizes with the caller JWT before using a separate server-only Auth Admin client. These are the only MVP components allowed to hold the server credential.
- **Storage** is *not* used in MVP. Profile avatars and proof-of-delivery photos are deferred (ADR-0001, `04`).

## 3. Frontend architecture (MVP)

- **Routing:** React Router v7, client-side. Route guards are UX only and **never** a security boundary (see `04` §4). Every protected read/write is re-checked by RLS.
- **Data layer:** Supabase JS directly, with explicit component loading/error state, targeted refetches, and the recovery rules in `06`. MVP does **not** assume a general query cache or adopt React Query; revisit if cache invalidation complexity grows.
- **State:** React Context for `auth` and `theme`; component-local state otherwise. No global store needed for MVP.
- **Styling:** Tailwind CSS v4. UI primitives hand-rolled (Button, Input, Card, Modal) to avoid Radix/Vaul/Sonner dependency for MVP (ADR-0002).
- **Forms/validation:** Lightweight schema validation (e.g. `zod`) at the client edge; authoritative validation lives in DB constraints + RPCs.

## 4. Dependency control (proposed libraries — NOT auto-approved)

Per the planning brief, these are **proposals**, not approvals. Decisions recorded in ADR-0002.

| Library | Proposal | MVP decision | Reason |
| --- | --- | --- | --- |
| React Query (@tanstack/react-query) | "wrap Supabase" | **Rejected for MVP** | MVP uses explicit refetch/recovery and has too few query surfaces to justify a cache layer yet. |
| Radix UI | "accessible primitives" | **Deferred** | Hand-rolled accessible components are enough; adopt later only if a11y burden grows. |
| Vaul | "mobile bottom sheets" | **Rejected for MVP** | Polish, not function. |
| Sonner | "toast notifications" | **Deferred** | A minimal native toast component suffices; adopt if notification UX matures. |
| Framer Motion | "micro-interactions" | **Rejected for MVP** | Animation is out of MVP scope; risks perf/complexity. |
| zod | validation | **Accepted (light)** | Cheap client-edge validation; does not replace DB constraints. |
| lucide-react | icons | **Accepted** | Negligible cost, improves UI clarity. |
| Vitest / RTL / Playwright | testing | **Accepted** | Required by `07`. |

Any future addition must file an ADR amendment with a material-MVP-benefit justification.

## 5. Environments

| Env | Purpose | Notes |
| --- | --- | --- |
| Local dev | feature work | Local Supabase (CLI) or a dedicated dev project. |
| CI | verify PRs | Runs `tsc --noEmit`, Vitest, RLS tests, Playwright. See `07`, `09`. |
| Staging | pre-prod | Required before production (open question: who provisions?). |
| Production | live | Vercel + Supabase prod project. |

## 6. Cross-references

- State machine & RPCs: ADR-0004, `05-api-and-business-operations.md`.
- RLS / security: `04-security-and-threat-model.md`.
- Realtime: `06-realtime-design.md`, ADR-0005.
- Testing: `07-testing-strategy.md`.
- Dependency decisions: ADR-0002.
