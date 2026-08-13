# ADR-017: Global Administration and Story Access Control

Status: Accepted

Date: 2026-08-13

## Context

Creator-only story ownership no longer covers public reading, account-scoped
sharing, collaborative editing, or installation administration. Authorization
must be enforced by the API on every object operation and remain useful when
comments and review workflows arrive later.

## Decision

Accounts have one operational role: `user` or `admin`. An administrator may
manage account roles and all stories. This global exception does not introduce
global author, editor, reader, or reviewer roles; those capabilities remain
story-specific.

Every story keeps three policies:

- visibility: `private`, `authenticated`, `public`, or `invitation`;
- editing: `owner`, `collaborators`, or `authenticated`;
- commenting: `disabled`, `readers`, `editors`, or `authenticated`.

Direct story grants target an existing user and are either `viewer` or `editor`.
The creator and administrators always have all capabilities. A private story
ignores grants, public visibility permits anonymous reading, and authenticated
editing implies authenticated reading. Only creators and administrators manage
settings, grants, and deletion.

New and migrated stories default to private, owner-only editing, and disabled
comments. The first non-migration account is promoted during migration; on a new
installation, first-account creation assigns the administrator role inside a
serialized transaction. Administrator changes share that serialization and
cannot demote the final administrator.

Repository queries enforce object-level access. The shared package contains the
pure capability resolver used by projections and tests, but client-side
capabilities only adapt the interface and are never the security boundary.

The comment policy is stored now even though comment entities and endpoints do
not yet exist. Invitations do not send mail or create bearer links in this
increment.

## Consequences

- Story ids and direct URLs do not bypass access checks.
- Public stories can be read without an account, while progress remains tied to
  authenticated users.
- Owners can preserve grants while temporarily returning a story to private.
- Opening editing to all signed-in users is an explicit high-trust choice.
- Future comments must use the stored effective capability; a comment UI alone
  cannot authorize writes.
- Suggestion/review permissions, outbound invitations, account deletion, and
  anonymous saves remain future work.
