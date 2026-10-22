# ADR-038 - Deterministic Typed Stat Expressions

## Status

Accepted.

## Context

ADR-021 deliberately excluded formulas while typed variables, assignment effects,
and comparisons were being stabilized. Authors now need one stored value to be
computed from other current values without introducing calculated variables or
source-engine-specific runtime behavior.

## Decision

Stat effects and the comparison side of stat conditions may contain one authored
expression instead of a literal value or direct comparison assignment.

Expressions:

- reference assignments by stable assignment id and exact item id, using
  `@{assignmentId}` or `@{assignmentId|itemId}`;
- support typed literals, unary `+`/`-`, parentheses, arithmetic `+ - * /`,
  equality `== !=`, and ordered numeric comparison `< <= > >=`;
- permit string concatenation with `+` only when both operands are strings;
- use normal arithmetic precedence and deterministic left-to-right evaluation;
- are validated on write for syntax, same-Story references, exact-item targets,
  operand types, and a result type matching the affected or compared stat;
- evaluate against the replay state at that point in the ordered journey. Effects
  earlier in the same Interaction are visible to later effects;
- remain authored instructions. Their results are not separately persisted and
  introduce no dependency graph or reactive recalculation.

Expressions are limited to 4,000 characters and 64 nested evaluation levels.
Numeric operands and results must be finite. An invalid legacy expression or a
runtime arithmetic error such as division by zero does not mutate the target and
cannot make a condition match. Deleting an assignment or exact item removes
effects and conditions whose expressions reference it. All hourly changes apply
before the ordered effects, including effects interleaved across global and item
targets.

PostgreSQL stores an effect's literal JSON value or expression text, exclusively.
Trigger expressions remain inside the existing canonical condition-group JSON.

## Consequences

- Story, character, location, and exact-item values share one expression engine.
- Reader replay stays deterministic from authored Story plus ordered journey.
- Renaming display labels does not change expression identity.
- Calculated/read-only variables, functions, logical operators, automatic
  dependency tracking, and cycles remain out of scope.
