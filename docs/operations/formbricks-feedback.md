# Formbricks Contextual Feedback

Status: Optional operator integration

Last reviewed: 2026-10-28

Paralleax exposes a compact `Give feedback` / `Donner un retour` button in the
application header when Formbricks is configured. The SDK is loaded only after
the user clicks the button. The integration is entirely in the web layer: it
does not change authored stories, reader progress, the API, or the database.

## Formbricks setup

1. Create or select a Formbricks Workspace.
2. Create a Website & App Survey. The Formbricks `Feedback Box` template is a
   suitable starting point.
3. Add a required single-choice question named `feedback_type` with these
   choices: bug or malfunction, difficulty understanding or using Paralleax,
   missing feature or suggestion, and other comment. Add a free-text question
   named `feedback_message` for details. Keep the text optional so a short
   categorized report remains possible.
4. If the selected Formbricks survey type and plan offer a File Upload question,
   add an optional screenshot field. The tester must choose to attach it; tell
   testers that screenshots can show story content. If File Upload is not
   available, leave screenshots out of the form.
5. Add a code action named exactly `paralleax_feedback_opened` and use it as the
   survey trigger.
6. Add these hidden fields to the survey:
   - `paralleax_route`
   - `paralleax_surface`
   - `paralleax_version`
   - `paralleax_viewport`
   - `paralleax_language`
7. Configure the recontact behavior so the same visitor can deliberately open
   the feedback box more than once. During testing, remove or shorten the
   Workspace cooldown that would otherwise suppress repeated displays.
8. Add English, French, and Italian survey translations for the Paralleax
   interface languages that are in use.

The action and hidden-field names are an integration contract. Changing them in
Formbricks without changing Paralleax prevents the survey trigger or its context
from working.

## Application configuration

Both variables are required. Leaving either one empty keeps the SDK and button
disabled:

```dotenv
VITE_FORMBRICKS_WORKSPACE_ID=<workspace-id>
VITE_FORMBRICKS_APP_URL=https://app.formbricks.com
```

For a self-hosted multi-domain Formbricks installation, use its `PUBLIC_URL` as
the app URL. For a single-domain installation, use its `WEBAPP_URL`.

These are public web-build settings, not secrets. Vite embeds them into the
browser bundle. A production Docker image must therefore receive them while it
is built:

```bash
docker build --target web \
  --build-arg VITE_FORMBRICKS_WORKSPACE_ID=<workspace-id> \
  --build-arg VITE_FORMBRICKS_APP_URL=https://app.formbricks.com \
  --tag paralleax-web:<commit> .
```

The production Nginx configuration also adds the configured app URL to
`script-src` and `connect-src`. Docker Compose passes the same value at build
and runtime. Other deployment systems must keep those values identical so the
browser Content Security Policy does not block the SDK or its requests.

## Feedback context and privacy

Only after a tester clicks the button does Paralleax load the SDK and send the
`paralleax_feedback_opened` action with these hidden fields:

- a normalized route such as `/stories/:storyId/edit`;
- the product surface, such as `editor` or `player`;
- the Paralleax web package version;
- viewport width and height;
- the current interface language.

Paralleax does not call Formbricks user identification APIs. It does not send an
account id, email address, story title, interaction text, or other authored
content. Formbricks itself records standard response metadata, including the
current full URL, browser, operating system, device, and country. The full URL
can contain a story id even though Paralleax's custom route field is normalized.
Review this metadata, the survey questions, access controls, retention, and
hosting location before inviting real testers. The current application cannot
remove a story id from Formbricks' automatically recorded full URL, so do not
represent the custom normalized route as removing that separate metadata.

## Simulation survey and product events

The current application does not send automatic journey milestones and does
not open a survey after Simulation. It has no consent control for behavioral
tracking. Keep these transmissions disabled until a consent flow and the
associated alpha privacy notice have been approved.

When that consent decision is in place, configure a separate Website & App
Survey and a code action named `paralleax_simulation_succeeded`. Its primary
question should be “Were you able to do what you wanted with Paralleax?” with
`Yes`, `Partially`, and `No` answers. Show an optional free-text difficulty
question for `Partially` and `No`. Use no hard-coded survey id in Paralleax;
the action is the trigger contract. The current SDK exposes survey shown,
response submitted, and survey closed events that can support one-time local
suppression after implementation.

The proposed milestone names are `first_story_created`,
`first_interaction_added`, `first_connection_created`,
`first_simulation_succeeded`, `onboarding_started`, `onboarding_completed`,
`onboarding_skipped`, `onboarding_abandoned`, and `blocking_flow_error`. They
must remain separate from technical error reports and survey answers. If
enabled later, send only these milestone names and minimal categorical fields;
never send story ids, story text, variable values, account identifiers, or
per-action histories.

## Verification

After publishing the survey and deploying a configured web build:

1. Build with both environment variables set and confirm the localized button
   appears from the library, editor, Simulation, and Reader routes.
2. Open each route without clicking the button; confirm the SDK is not loaded and
   no route-change action is sent.
3. Click the button and confirm the survey opens every time permitted by the recontact
   and cooldown settings.
4. Submit a categorized test response and verify all five hidden fields.
5. If File Upload is enabled, verify it is optional and review the uploaded
   screenshot in the Formbricks response.
6. Confirm no account identity or authored story content appears in the custom
   response fields. Review the separate full-URL metadata for story ids.
