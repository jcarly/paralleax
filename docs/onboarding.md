# Authoring Guide Architecture

Status: Implemented alpha slice

Last reviewed: 2026-11-20

## User behavior

The optional first-story guide is a non-modal card layered over the interface;
it never changes page layout. On wide screens, it moves beside its current
target. On narrow screens, it docks to the bottom. The current target receives
a clear outline, while the rest of the interface stays visible and interactive.
The guide starts when a new Story is successfully created, follows that Story
between the library, editor, and Simulation, and does not change narrative data.
Authors can pause it, skip the current step, restart it, or reopen it from the
authenticated `Guide` control. Completing the flow does not prevent later use of
the editor.

In the editor, the guide highlights the scene's `Add content` action (falling
back to the scene inspector once the scene editor is open), the starting
Interaction's child `+` control, and the Simulation entry point. When opened
from the library without an active Story, it highlights the new-Story action. If
the mobile dock would cover the target, the card moves to the top edge. If a
specific target is not present, the guide falls back to a broader editor target
when available; the card remains usable even when no highlight is available.
The card fades in when it appears and fades out when it closes.

The guide has three outcome-based steps:

1. Write a scene and wait for its save to succeed. A new Story opens with its
   starting Interaction selected, so the guide starts at its scene. (An earlier
   `Explore the graph` step completed itself on that automatic selection; it was
   removed on 2026-11-20 and stored progress that still names it is read
   without it.)
2. Create a choice with more than one distinct destination from a source.
3. Launch Simulation with the highlighted `Test from start` action. The guide
   completes once Simulation for that Story has opened, then closes; a launch
   whose navigation is blocked (for example by a pending save) or cancelled
   keeps the step. Nothing is layered over Simulation.
   Advancing a Simulation journey also completes this step.

Testing from the editor starts at the beginning of the Story. A separate
`Test from current interaction` action appears when the selected Interaction is
not the starting one. A finished guide shows no completion card: three
Interactions are not a finished Story. Opening the `Guide` control again
restarts it from its first step.

New Interaction titles and bodies are stored empty. Localized placeholders show
`Start` or `New interaction` in English, `Départ` or `Nouvelle interaction` in
French, and `Inizio` or `Nuova interazione` in Italian. Empty scene bodies show
`Describe what happens here.`, `Décrivez ce qui se passe ici.`, or
`Descrivi cosa succede qui.` in the corresponding language. Existing authored
titles and bodies are not translated or rewritten.

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
- `OnboardingGuide.tsx` renders the non-modal guide and help control, localizes
  step copy, and keeps the guide available on the library/editor/Simulation
  routes for the active Story.
- `OnboardingGuideOverlay.tsx` keeps the card outside page layout, tracks the
  current target, and leaves other controls interactive. `guidePlacement.ts`
  places the card beside targets or at the mobile bottom edge.
- `branchingChoice.ts` detects a branch by finding distinct destinations linked
  from the same source Interaction.
- `StoryEditor.tsx` recognizes loaded/saved Story state and successful scene
  saves. Graph changes count after the persisted Story revision changes, so an
  optimistic unsaved edit does not complete a step.
- `OnboardingGuide.tsx` completes the last step when the highlighted
  Simulation entry point was chosen and Simulation for that Story opened. `StoryPlayer.tsx` also recognizes a
  Simulation journey that advanced beyond its starting Interaction.

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
