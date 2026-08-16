# ADR-019: Editor-only Graph and Reader Comments

Status: Accepted

Date: 2026-08-16

## Context

ADR-018 introduced a read-only graph workspace for people who could comment but
could not edit. That coupled review permission to an authoring surface and made
the difference between a reader and an editor unclear. It also left comments
unavailable in the surface where readers actually experience an interaction.

The four comment policies introduced by ADR-017 overlap: `readers` already means
authenticated accounts that can read the story, while `authenticated` cannot
grant comments without read access. Disabling comments also prevents editors
from using the review layer on newly created stories.

## Decision

Story comment policy has two values:

- `editors`: authenticated users with effective edit permission may comment;
- `readers`: every authenticated user with effective read permission may
  comment, including editors.

New stories default to `editors`. The forward migration maps `disabled` to
`editors` and `authenticated` to `readers`, then constrains persistence to the
two current values.

The graph editor and author Simulation Mode require effective edit permission.
A non-editor opening an editor URL is redirected to the player. Simulation query
parameters, including a requested starting interaction, are ignored unless the
loaded story grants edit permission.

The editor retains the complete anchored review experience for editors. A
signed-in reader with effective comment permission uses the player instead. The
player exposes discussions attached to the current interaction, including its
text anchors, and creates new threads on that interaction. It does not expose
canvas, trigger, context-entity, or future-interaction discussions. This keeps
reader comments contextual and avoids leaking graph structure or later scenes.

Comments remain separate collaboration resources. They do not become authored
story content, reader progress, trigger input, or runtime state. The API remains
the authorization boundary for listing and mutating discussions.

## Consequences

- Reader invitations never grant graph or Simulation Mode access.
- Editors can comment by default without changing a new story's settings.
- Selecting `readers` adds reader commenting; it does not create another kind of
  story grant.
- Anonymous public readers cannot read or write discussions.
- A reader sees only discussions for the interaction currently being read,
  reducing spoilers and keeping graph-only review context private.
- ADR-017's four comment-policy values and ADR-018's read-only graph workspace
  are superseded by this decision.
