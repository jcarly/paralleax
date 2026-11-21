# ADR-017: Global Administration and Story Access Control

Status: Accepted; visibility extended by ADR-033; denial responses clarified 2026-11-04; edit policy bounded by visibility 2026-11-20

Comment-policy values and defaults are superseded by
[ADR-019](ADR-019-editor-graph-reader-comments.md).

Date: 2026-08-13

Amendment (2026-10-17): [ADR-033](ADR-033-unlisted-story-visibility.md)
adds `unlisted` as a fifth accepted visibility policy. Implementation completed
on 2026-10-24; see ADR-033 for its behavior and consequences. This note preserves
the original amendment date and status history.

Amendment (2026-11-20, PAR-7): editing must not be open to more people than
reading. A `private` Story only allows `owner` editing and an `invitation`
Story only allows `owner` or `collaborators` editing; `authenticated`,
`unlisted` and `public` allow every edit policy. The rule lives in
`packages/shared` (`getAllowedStoryEditPolicies`, `assertStoryAccessCoherent`)
and the API rejects other combinations with `400 STORY_ACCESS_INCOHERENT`.
Rationale: the previous combinations let an "Owner only" reading policy be
silently widened by "Signed-in users" editing, which the settings screen could
not express. Consequence: migration `202611200046_coherent_story_access`
narrowed existing incoherent Stories to the widest allowed edit policy
(`owner` for private, `collaborators` for invitation), as decided by the product
owner; this removes access some signed-in users had on such Stories. The
settings screen disables incompatible options and narrows editing when reading
is narrowed.

The same review found that `resolveStoryAccess` let an `editor` grant edit a
non-private Story whose edit policy is `owner`, so "Owner only" did not hold.
An editor grant now edits only under the `collaborators` or `authenticated`
edit policy, in the shared rule and its SQL projection. Product decision: no
migration; invited editors on such Stories lose editing until the owner opens
editing to Editors. Inviting or promoting an Editor from the settings screen
while editing is `owner` opens editing to `collaborators` when reading allows
it, and says so. The grant and policy change are performed atomically by the
collaborator endpoint (one PostgreSQL data-modifying CTE statement), so a failed
request does not leave a partially applied invitation or promotion.

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
