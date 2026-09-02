# ADR-025: Trigger Condition Groups and Seeded Probability

Status: Accepted

Date: 2026-08-31

## Context

Alternative condition routes were represented as several Triggers with identical
inputs and output, then grouped only by the web graph. A probability on those
visual variants would be ambiguous: it could produce several rolls for what an
author sees as one Trigger, while placing inputs inside variants would duplicate
reachability rules. Reader reload and Simulation debugging also require random
outcomes to be reproducible.

## Decision

A Trigger owns its input interactions, implicit owning output Interaction,
appearance probability, and one or more condition groups. Conditions inside one
group are AND; groups are OR. Inputs remain alternative reachability sources and
are not repeated inside groups.

`appearanceProbability` is an integer from 0 through 100 and defaults to 100.
After the input rule and at least one group match, the shared engine derives one
roll from the saved run seed, narrative step, and Trigger id. Separate Triggers
remain separate gates, even when they target the same Interaction.

Condition groups are stored as constrained JSONB on the relational Trigger row;
inputs remain relational. The forward migration wraps every legacy condition
array in a stable group and merges legacy Triggers only when output and normalized
input sets are identical. Existing group ids use the legacy Trigger ids, and
Trigger comment anchors are redirected to the retained Trigger.

Reader progress JSON advances to version 3 and carries the run seed. Old progress
without a seed is assigned one when normalized. Reload, manual-save loading,
backward replay, and live Simulation replay preserve it; restart creates a new
seed. Simulation may explain a failed roll and explicitly force an unavailable
path without changing normal reader semantics.

## Consequences

- One authored Trigger has one probability and one roll per narrative step.
- OR authoring no longer creates parallel Triggers or a graph-only grouping rule.
- The shared package remains the only owner of eligibility and deterministic
  probability semantics.
- Saves reproduce probability outcomes without storing every individual roll.
- Timer behavior is defined separately by ADR-026; automatic choice execution
  remains future behavior.
- Legacy TypeScript story fixtures and imported data can still expose one
  `conditions` array temporarily; normalization converts it to the canonical
  single group before persistence or mutation.
