# ADR-026: Persisted Trigger Choice Timers

Status: Accepted

Date: 2026-09-01

## Context

An author needs to limit how long a Trigger can expose its output interaction.
Unlike the deterministic Story calendar, this is real elapsed reader time. A
timer that restarts on reload would be easy to bypass and a timer stored only in
React would make reader, Simulation, saves, and future runtimes disagree.

The same output interaction may also have several eligible Triggers, and
Simulation can navigate backward while the normal reader cannot. These cases
need explicit availability and restoration rules.

## Decision

A Trigger owns `timerSeconds`, a nullable non-negative integer. `null` means no
timer. Zero is valid and expires immediately, so the Trigger never exposes its
option in normal reading.

Input, condition-group, and probability gates are evaluated before the timer.
When those gates succeed, the timer compares its duration with the wall-clock
time elapsed in the current narrative choice step. An interaction is available
while at least one Trigger succeeds. If one successful Trigger is untimed, the
interaction has no countdown. Otherwise the reader displays the longest
remaining successful Trigger window.

Reader progress version 4 stores `stepStartedAt`: one timestamp for the choice
step before the first interaction, followed by one timestamp after every journey
interaction. This aligns timers with the ordered journey without duplicating a
deadline for every Trigger. Reloading, closing the page, loading a save, and
backgrounding the tab do not pause time. Restart creates a new initial step.
Simulation backward navigation truncates the journey and restores the timestamp
of the restored step, so an already expired option stays expired.

The normal reader removes expired options. Simulation keeps them visible and
disabled, reports timer expiration, and may use its existing force-unavailable
control to inspect the path. Both modes display a draining bar above an active
timed option. The bar animates in CSS; React schedules only expiration updates
and focus/visibility synchronization rather than rerendering continuously.

Timer state and evaluation remain in shared domain code. The web supplies the
explicit elapsed-time context, while the API validates and persists step
timestamps without treating client-supplied materialized Story state as trusted.

## Consequences

- Reader evaluation with timers is reproducible from authored Story, ordered
  journey, probability seed, persisted step timestamps, and the explicit current
  wall-clock instant.
- Existing version 1–3 saves remain readable. Their missing step timestamps are
  initialized when loaded and persisted on the next autosave update.
- Anonymous reading still has no persisted progress, so closing an anonymous
  session cannot restore its timer state.
- Timers only limit availability. They do not automatically select an option.
- Delayed and probabilistic automatic choices remain separate future behavior.
