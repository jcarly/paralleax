# Business Model

This document captures product philosophy, not a business plan.

The exact economic model is intentionally open. The important direction is that
the project should protect a useful open source core while allowing a hosted
platform to provide collaborative and publishing value.

## Philosophy

- The story model and core engine should remain portable.
- Authors should be able to keep control of their structured story data.
- The platform can add value through publishing, collaboration, hosting,
  discovery, review workflows, and convenience.
- Monetization ideas should not shape the MVP narrative model.

## Open Source Core

The open source core should include the editor and engine foundations needed to
create, inspect, test, and reuse interactive stories.

This keeps the project useful even outside the hosted platform.

**Current status (2026-11-18):** no licence has been chosen and the repository
has no `LICENSE` file. Until one is added, the code is not open source in the
legal sense and no reuse or contribution rights are granted. Choosing a licence
is a prerequisite for public promotion and outside contributions. Typical
options range from strong copyleft that also covers hosted use (for example
AGPL-3.0) to permissive licences (for example Apache-2.0 or MIT); the choice
depends on how much the hosted platform should be protected from closed
re-hosting. This is a product and legal decision, not a technical one.

## Data Control

"Authors should be able to keep control of their structured story data" is not
yet true in practice: there is no export. The documented Story format and native
export are the next priority in the [Roadmap](roadmap.md#next).

## Hosted Platform Direction

The hosted platform may later provide:

- publishing playable stories;
- sharing stories with readers;
- collaborative editing;
- contribution and review workflows;
- story discovery;
- hosting and backups;
- team or organization features.

## Out Of Scope For Now

The project should not document or optimize around speculative scale or
monetization ideas yet.

Deferred topics include:

- marketplace mechanics;
- patronage or donation systems;
- creator revenue splits;
- foundation governance;
- large-scale growth assumptions.
