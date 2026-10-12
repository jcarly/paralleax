# ADR-031: Verified-Email Registration Without a Shared Access Code

Status: Accepted

Date: 2026-10-12

## Context

The creator alpha initially combined an invitation access code with account
registration. Account safety now creates every new account unverified, sends a
one-use verification action to its email address, and refuses to issue a session
until that action is consumed.

The shared alpha code no longer establishes an identity or a distinct durable
permission. It adds a second secret-distribution workflow and another field to
the registration contract while email verification already supplies the desired
account activation gate.

## Decision

Registration has only two operational modes: `open` and `closed`. Production
must choose one explicitly. Open registration accepts email, display name, and
password, creates an unverified account, and relies on the existing email
verification action before sign-in. Closed registration rejects account
creation before password hashing or persistence.

Remove the access code from the registration DTO, server policy, browser client,
form, translations, and acceptance setup. Remove `access-code` from the allowed
`REGISTRATION_MODE` values. Reject a non-empty legacy
`REGISTRATION_ACCESS_CODE` at startup so an outdated deployment cannot silently
assume the removed gate is active.

Keep the existing registration rate limit, verification-token semantics,
transactional email boundary, password rules, session rules, and production
origin enforcement unchanged.

## Consequences

- Users no longer need an operator-distributed shared code to register.
- Anyone who can reach an open deployment may submit a registration and trigger
  verification email, subject to the existing rate limit; operators use
  `REGISTRATION_MODE=closed` to stop new accounts.
- A submitted address still cannot obtain a session without access to its
  verification email.
- Deployments using the former mode must set `REGISTRATION_MODE=open` or
  `closed` and remove `REGISTRATION_ACCESS_CODE` before starting the new release.
- No persistence migration is required because the access code was configuration
  and request data, never stored account state.
