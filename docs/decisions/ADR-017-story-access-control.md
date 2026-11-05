# ADR-017: Global Administration and Story Access Control

Status: Accepted; visibility extended by ADR-033; denial responses clarified 2026-11-04

Comment-policy values and defaults are superseded by
[ADR-019](ADR-019-editor-graph-reader-comments.md).

Date: 2026-08-13

Amendment (2026-10-17): [ADR-033](ADR-033-unlisted-story-visibility.md)
adds `unlisted` as a fifth accepted visibility policy. Implementation completed
on 2026-10-24; see ADR-033 for its behavior and consequences. This note preserves
the original amendment date and status history.

## Context

Creator-only story ownership no longer covers public reading, account-scoped
sharing, collaborative editing, or installation administration. Authorization
must be enforced by the API on every object operation, including review
discussions.

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
The creator and administrators always retain reading, editing, and management
capabilities; a disabled comment policy disables comment authorship for everyone. A private story
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

Protected mutations and access-management reads distinguish a readable Story
from one hidden by policy: a signed-in user who can read but cannot perform the
requested operation receives `403 Forbidden`; a missing or unreadable Story
continues to receive `404 Not Found`. A protected mutation without a valid
session receives `401 Unauthorized`. This distinction improves permission
feedback without revealing hidden Story existence.

Comment reads and writes use the resolved capability. Anonymous readers never
receive comment authorship even when a story is public. Invitations do not send
mail or create bearer links in this increment.

## Consequences

- Story ids and direct URLs do not bypass access checks.
- Readable users can distinguish a permission refusal from a hidden or missing
  Story, while the API keeps hidden Story existence private.
- Public stories can be read without an account, while progress remains tied to
  authenticated users.
- The product home uses a dedicated anonymous summary projection and cannot leak
  private, authenticated-only, or invitation-only story metadata.
- Owners can preserve grants while temporarily returning a story to private.
- Opening editing to all signed-in users is an explicit high-trust choice.
- Comment endpoints use the stored effective capability; a comment UI alone
  cannot authorize reads or writes.
- Suggestion/review permissions, outbound invitations, account deletion, and
  anonymous saves remain future work.
