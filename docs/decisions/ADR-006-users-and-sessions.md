# ADR-006 - Users, Sessions, and Story Ownership

## Status

Accepted.

## Context

The Story / Interaction / Trigger / Reader core now has durable PostgreSQL
persistence, transactional story mutations, and browser regression coverage.
The first identity slice must enable ownership without introducing collaboration,
permission hierarchies, OAuth providers, or player profiles.

## Decision

- Store application users and sessions in PostgreSQL.
- Authenticate email/password credentials in NestJS behind an auth service.
- Hash passwords with Node.js `scrypt`, a unique salt, and timing-safe checks.
- Issue opaque random session tokens in HTTP-only, `SameSite=Lax` cookies; store
  only token hashes in PostgreSQL.
- Make story ownership mandatory at the persistence boundary and scope every
  story read or mutation to the authenticated owner.
- Preserve pre-user stories under a non-login migration user.
- Allow those quarantined stories to be claimed only by the account whose email
  matches the deployment's explicit `LEGACY_STORY_OWNER_EMAIL` setting. An unset
  setting keeps them quarantined.
- Purge expired sessions opportunistically during authentication activity and
  index their expiry timestamp.
- Keep NestJS as the identity and authorization boundary so a future managed
  auth provider can replace credential verification without moving domain rules
  into the browser.

## Consequences

- Registration, login, logout, and current-user endpoints enter the product.
- Anonymous story access is rejected for now.
- Public reading, sharing, invitations, permissions, suggestions, OAuth, email
  verification, password reset, and account deletion remain separate decisions.
- Production must use HTTPS so secure cookies can be enabled.
- Concurrent registration attempts for one email resolve to one account and one
  conflict response at the database boundary.
