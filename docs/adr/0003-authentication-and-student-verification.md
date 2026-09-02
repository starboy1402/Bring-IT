# ADR-0003: Authentication & Student Verification

**Status:** Accepted (2026-09-03) — Q1, Q2, Q8, Q9 approved by the project owner; see the Approval Record in `../planning/10-open-questions.md`
**Date:** 2026-08-31
**Decision owner:** Project owner
**Deciders:** Project owner + CUET faculty sponsor (for domain confirmation)
Legacy proposal replaced: the proposal described in `.kilo/plans/bringit-planning.md` that marked this decision Accepted without approval.

## Context
BringIt is CUET-student-only. The brief explicitly warns: **entering a student ID does not prove identity.** The earlier plans treated `student_id` as both identity proof and public data — unsafe. We must define how CUET identity is actually verified and what profile data is public vs private.

## Decision Drivers
- Must restrict platform to real CUET students
- Must not mistake self-asserted `student_id` for proof
- Must protect PII (`student_id`, `phone`, `email`, route/location)
- Must be implementable in MVP without manual document review if possible
- Phone visibility boundary must be explicit (Q8)
- Exact-location visibility for open requests must be explicit (Q9)

## Considered Options
1. **Institutional email domain + confirmation (recommended):** signup restricted to `@cuet.ac.bd` (or official CUET domain); email confirmation proves possession of a CUET mailbox. `student_id` captured but stored private and **not** treated as proof.
2. **Manual admin verification of student ID:** accurate but does not scale for MVP; blocks launch.
3. **Self-asserted student ID only:** rejected — does not verify anything (brief's explicit warning).
4. **SSO via CUET identity provider (e.g., OAuth/SAML):** strongest, but depends on CUET providing it (unknown — assumption A1).

## Decision (proposed)
Use **option 1** for MVP: Supabase Auth with email confirmation, signup limited to the CUET institutional domain. Set `profiles.is_verified = true` only through this verified path. `student_id` is collected for record-keeping but is **private** (`03` §5) and is **not** identity proof. If CUET offers SSO (option 4), adopt it later (supersedes this ADR).

## Rationale
Proves possession of a CUET email (strong proxy for student status) without manual review; keeps `student_id` out of the trust chain; aligns with "verified student authentication" MVP feature (`01` MS-1).

## Consequences
**Positive:** low-friction, scalable, safe PII handling.
**Negative:** a shared/compromised CUET mailbox could fake a student; weaker than SSO.

## Cost implications
- **Operational cost:** low; uses Supabase Auth (included in platform).
- **Support cost:** some users may mistype domain or lose mailbox access; requires support flow.
- **Future SSO migration cost:** moderate; requires integrating CUET IdP and migrating existing accounts.

## Security implications
- Email domain is trust anchor; if domain is compromised or guessed incorrectly, unauthorized users can verify.
- `student_id` is private and not proof, reducing PII exposure (`04` T5).
- Verification result logged to `audit_log` for forensics.

## Reversibility
High: verification path is isolated in signup + `is_verified` setter; SSO can replace it later.

## Approval conditions
- Q1: exact CUET institutional domain confirmed by faculty sponsor. — **Approved 2026-09-03** by the project owner (`@cuet.ac.bd` as implemented); *operational note:* before production launch, have the faculty sponsor confirm the live domain in writing.
- Q8: phone visibility timing approved (`accepted` + `in_progress` only). — **Approved 2026-09-03** as recommended.
- Q9: exact-location visibility for open requests approved (full text visible to verified, non-suspended users). — **Approved 2026-09-03** as recommended.
- Q2 (admin model): the `admin_roles` table design is chosen pending approval of initial admin identities and provisioning owner — see `10` Q2. — **Approved 2026-09-03** as recommended (owner seeds initial admins via migration).

> All four conditions satisfied on 2026-09-03 — see the Approval Record in `../planning/10-open-questions.md`.

## Implementation Implications
- `T-A1`, `T-A2`, `T-A3` in `08` (profile created via T-A3 before verification sets is_verified in T-A2).
- `profiles.is_verified` gates MS-3–MS-10 and user-initiated MS-13 actions (`05`, `04`).
- Visibility tiers in `03` §5; verification result logged to `audit_log`.

## Related
- `../planning/01-product-requirements.md` (MS-1, MS-2)
- `../planning/03-data-model.md` §3.1, §5
- `../planning/04-security-and-threat-model.md` §6.9
- `../planning/10-open-questions.md` Q1, Q2, Q8, Q9
- `../adr/0001-backend-platform.md` (Supabase Auth)
