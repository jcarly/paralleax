# ADR-032: Complete Import Reports and Warning Confirmation

Status: Accepted

Date: 2026-10-13

## Context

ChoiceScript and QSP adapters already produce structured compatibility reports,
but imports with warnings were persisted immediately, blocking failures lost most
of their report at the HTTP boundary, and QSP warning details were capped. Authors
need to inspect every approximation before deciding whether the canonical Story
should be created.

A confirmation workflow could retain source files or preview Stories on the
server, but that would introduce temporary persistence, cleanup, ownership, and
staleness concerns into an experimental adapter workflow.

## Decision

Import reports retain every issue without an application-level issue-count cap.
The existing import endpoints return a discriminated result:

- a clean conversion is persisted atomically and returns `status: imported`;
- a conversion with warnings returns `status: confirmation_required` and the
  complete report without persisting a Story;
- a conversion with blocking errors returns `STORY_IMPORT_FAILED` with the
  complete structured report in explicit error details and persists nothing.

The author can download any displayed report as JSON. Confirming warnings sends
the same source to the same endpoint with `confirmWarnings: true`. The server
reruns parsing, analysis, mapping, and validation, then persists that newly
computed Story atomically. It stores no preview Story, source upload, report, or
confirmation token.

The API error envelope may carry explicit structured `details` supplied by known
application errors. Unexpected exceptions and generic HTTP failures still expose
no internal details.

## Consequences

- Canonical Story persistence never precedes author acceptance of reported
  approximations.
- Confirmation cannot apply a stale server-side preview because the source is
  analysed again.
- Imports with warnings perform analysis twice and administrator binary sources
  are uploaded twice.
- Very large reports may consume substantial response, browser-memory, and DOM
  capacity because issue count is intentionally not capped. Existing source and
  infrastructure request limits still apply.
- No database migration or temporary cleanup process is required.
