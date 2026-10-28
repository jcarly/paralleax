# Authoring Guide Architecture

Status: Implemented alpha slice

Last reviewed: 2026-10-28

## User behavior

The optional first-story guide is a non-modal card shown beneath the application
header. It starts when a new Story is successfully created, follows that Story
between the library, editor, and Simulation, and does not cover graph controls or
change narrative data. Authors can pause it, skip the current step, restart it,
or reopen it from the authenticated `Guide` control. Completing the flow does
not prevent later use of the editor.

The guide has four outcome-based steps:

1. Explore the graph by selecting an Interaction.
2. Write a scene and wait for its save to succeed.
3. Create a choice with more than one distinct destination from a source.
4. Run Simulation and make a choice that advances the journey.

Each step is completed by an observable action, not by a telemetry event. Steps
can also be skipped, and progress is stored in browser `localStorage` under a
versioned key scoped to the signed-in user id (or an anonymous browser key). It
does not sync between devices or leave the browser. If storage is unavailable,
the guide remains usable for the current session.

## Implementation map

- `apps/web/src/features/onboarding/onboardingProgress.ts` defines the ordered
  step ids, progress shape, validation, migration-safe versioned key, and pure
  completion/skip behavior.
- `OnboardingProvider.tsx` owns the guide lifecycle and storage. Story creation
  starts it; successful deletion of its Story clears the active Story pointer.
- `OnboardingGuide.tsx` renders the non-modal card and help control, localizes
  step copy, and keeps the guide available on the library/editor/Simulation
  routes for the active Story.
- `branchingChoice.ts` detects a branch by finding distinct destinations linked
  from the same source Interaction.
- `StoryEditor.tsx` recognizes loaded/saved Story state and successful scene
  saves. Graph changes count after the persisted Story revision changes, so an
  optimistic unsaved edit does not complete a step.
- `StoryPlayer.tsx` recognizes a successful Simulation journey after it has
  advanced beyond its starting Interaction.

The guide is separate from Formbricks and application analytics. No guide
progress or automatic Story milestone is sent to a third party. The existing
feedback survey opens only after the user clicks its button; see the
[Formbricks runbook](operations/formbricks-feedback.md).

## Adding or changing a step

1. Add a stable id and its intended order in `onboardingStepIds`.
2. Add English, French, and Italian title and description strings in the three
   locale catalogues.
3. Add an explicit completion signal at the point where the product can verify
   the outcome. For save-dependent work, report completion only after the save
   succeeds. For Story-derived state, inspect loaded data or a confirmed persisted
   revision, never a local optimistic projection.
4. Keep step help actionable, brief, and non-blocking. Update the localized
   component tests and the authoring acceptance path to cover the new step.
5. Review whether the step still fits the guided-session tasks and refresh this
   map when the architecture changes.

Do not emit journey milestones to Formbricks as part of adding a step unless a
product consent flow and the alpha privacy notice explicitly cover that
behavioral tracking. Consent and retention details are documented in the
[alpha runbook](operations/alpha-deployment.md).
