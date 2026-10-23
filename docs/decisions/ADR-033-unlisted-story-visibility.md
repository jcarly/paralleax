# ADR-033: Unlisted Story Visibility

Status: Accepted

Date: 2026-10-17

## Context

ADR-017 defines private, authenticated, public, and invitation visibility.
Public Stories are discoverable in public library surfaces, while invitation
Stories require an explicit grant. Authors also need a way to share a Story by
link without listing it publicly.

## Decision

Add `unlisted` as a distinct Story visibility policy:

- A person with the Story URL can read it without signing in.
- Unlisted Stories are excluded from library and search results for users who
  do not own the Story or have a direct grant. Owners, administrators, and
  explicitly granted users retain their existing access and management views.
- Possession of the URL is not a strong confidentiality boundary; it can be
  shared and should not protect sensitive content.
- Editing and comment capabilities continue to follow the existing Story
  policies, ownership, administrator role, and explicit grants.
- `public` remains discoverable; `invitation` remains grant-restricted.

This is an accepted product contract, not an implemented access policy. Existing
Stories and defaults remain unchanged until implementation and migration behavior
are specified.

## Consequences

- The visibility model gains a fifth value without changing the narrative Story
  model.
- Anonymous read authorization and public-library filtering must treat
  discoverability separately.
- API, shared capability resolution, library projections, and authorization
  tests must be updated together before claiming implementation.
- The current private, authenticated, public, and invitation behavior remains
  authoritative until that work lands.
