# PostHog Contextual Feedback

Status: Optional operator integration

Last reviewed: 2026-11-20

Paralleax exposes a compact `Give feedback` / `Donner un retour` /
`Dai un feedback` button in the application header when PostHog is configured.
The PostHog SDK is loaded only after the user clicks the button, and it is used
only to display one survey and send its answers. The integration is entirely
in the web layer: it does not change authored stories, reader progress, the
API, or the database. [ADR-048](../decisions/ADR-048-posthog-survey-feedback.md)
records the decision and its rationale.

Until 2026-11-20 this button used Formbricks (code action
`paralleax_feedback_opened` and five hidden fields). That integration was
removed; the context fields keep the same names.

## PostHog survey

| Setting    | Value                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Project    | `336282`, EU Cloud                                                                                   |
| API host   | `https://eu.i.posthog.com`                                                                           |
| Survey     | `01a1f88c-830b-0000-a431-e0f5703c21fc` (`DEFAULT_FEEDBACK_SURVEY_ID`)                                |
| Management | <https://eu.posthog.com/project/336282/surveys/01a1f88c-830b-0000-a431-e0f5703c21fc>                 |
| Questions  | Feedback type (bug, usability difficulty, suggestion, other); optional description; optional profile |
| Languages  | French (base), English and Italian translations                                                      |

Required survey configuration, checked before publication:

1. **Type `widget` (button selector) is compatible.** Paralleax disables
   PostHog's automatic display, so PostHog attaches no click handler to the
   configured selector and renders no tab. The Paralleax button opens the
   survey itself with `displaySurvey()` as a popover, whatever selector is
   configured. Do not convert the survey to `popover` or `api`.
2. **No URL, selector, device, or wait-period condition.** Conditions are
   ignored when the button opens the survey, but a URL condition is still
   checked by the renderer and can hide it.
3. **Repeated responses allowed** and **partial responses enabled**, so the
   same visitor can report several times.
4. **Thank-you message enabled** (`Display thank you message`), translated in
   the three languages. It is the visible acknowledgement after submission.
   Enabling `Auto disappear` is recommended: while the thank-you screen is
   open, a new click reports the form as unavailable instead of reopening it.
5. **Translations.** French is the base language; `en` and `it` translations
   cover every question, choice, and the thank-you message. Paralleax passes
   its interface language (`fr`, `en`, `it`) as `override_display_language`:
   `fr` matches no translation and keeps the base text, `en` and `it` select
   their translation. Keep the short translation keys `en` and `it`.
6. **Project settings:** enable **Discard client IP data**, and keep session
   replay, autocapture, heatmaps, and web analytics off for this project's web
   client. The SDK disables them locally as well.

The survey is a draft. A draft is not returned by PostHog's public surveys
endpoint, so the button shows `The feedback form is unavailable` until the
survey is launched. Launching the survey is an operator decision made after the
privacy notice is ready; deployment never launches it.

## Application configuration

`posthog-js` is pinned to an exact version (`1.448.0`): the privacy filter and
the display checks depend on SDK behavior, so each upgrade is a reviewed change
that must keep `posthogFeedbackClient.sdk.test.ts` and the feedback end-to-end
tests green.

The token, API host and survey ID are required. Leaving any one empty keeps the
SDK and the button disabled:

```dotenv
VITE_POSTHOG_PROJECT_TOKEN=phc_<public project token>
VITE_POSTHOG_API_HOST=https://eu.i.posthog.com
# Set the survey belonging to this environment.
VITE_POSTHOG_FEEDBACK_SURVEY_ID=<survey-id>
```

- `VITE_POSTHOG_PROJECT_TOKEN` is the **public project token** (`phc_...`) from
  the project settings. Paralleax rejects any other value, including personal
  API keys (`phx_...`), which must never be placed in a `VITE_*` variable.
- `VITE_POSTHOG_API_HOST` must be a bare origin (no path, query, or
  credentials). A reverse proxy origin is possible later; it would also become
  the CSP entry.
- `VITE_POSTHOG_FEEDBACK_SURVEY_ID` selects the survey in this environment.

These are public runtime settings, not secrets. The web container generates a
same-origin JSON document on startup; the bundle contains no project-specific
values. For local Vite development, set them in the local environment instead; the
existing Paralleax survey remains the development-only default.

### Content Security Policy

The SDK and its survey renderer are bundled with Paralleax
(`posthog-js/no-external`); no PostHog script, remote configuration, or
feature-flag request is loaded. The production Nginx template therefore keeps
`script-src 'self'` and adds the validated runtime API origin to `connect-src`
when the feedback configuration is complete. Survey styles are injected into a
shadow root and rely on `style-src 'self' 'unsafe-inline'`.

The browser contacts only these API paths: `GET /api/surveys/` (survey
definition) and `POST /e/` (survey events).

### Railway

Set all three public values on the Railway web service, separately for each
environment. No PostHog values are needed by the image build. Remove former
`VITE_FORMBRICKS_*` variables. Never place private keys in browser configuration.

## What is sent

Only after a click does Paralleax load the SDK and request the survey. Answers
are sent as PostHog `survey sent` events, with `survey shown`, `survey
dismissed`, and `survey abandoned` as lifecycle events. A `before_send` filter
drops every other event and every property outside this list:

- survey fields: `$survey_id`, `$survey_name`, `$survey_response*`,
  `$survey_questions`, `$survey_submission_id`, `$survey_completed`,
  `$survey_language`, and related `$survey_*` metadata;
- Paralleax context (on `survey sent`):
  - `paralleax_route`: a normalized route such as `/stories/:storyId/edit`,
    or `/*` for an unknown path;
  - `paralleax_surface`: `editor`, `player`, `story-library`, and so on;
  - `paralleax_version`: the web package version;
  - `paralleax_viewport`: viewport width and height;
  - `paralleax_language`: the interface language;
- `$current_url` and `$pathname`, both set to the normalized route;
- ingestion fields: `token`, a pseudonymous `distinct_id`, `$lib`,
  `$lib_version`, `$process_person_profile: false`, `$geoip_disable: true`.

Paralleax never calls `identify()`. It does not send an account id, email
address, Story id, Story title, interaction text, variable values, the browser
URL, referrer, browser, operating system, device, screen size, or session and
window ids.

### Limits that remain

- **IP address.** Every HTTPS request reveals the client IP address to
  PostHog. `$geoip_disable` prevents GeoIP enrichment per event; the project's
  **Discard client IP data** setting prevents storing it. The browser cannot
  hide it.
- **Pseudonymous id.** PostHog requires a `distinct_id`. It is generated in
  memory on each page load and is not stored in a cookie or localStorage, so it
  does not link visits. Several answers sent from one page load share it.
- **Browser storage.** After the survey is opened, PostHog's survey extension
  stores `seenSurvey_*`, in-progress response, and `lastSeenSurveyDate` keys in
  localStorage. They hold survey state, not identity.
- **Free text.** The optional description and profile are typed by the user.
  The survey should tell testers not to include Story content or personal data.
- **Delivery.** Neither PostHog's thank-you screen nor the Paralleax
  announcement (`Thank you for your feedback!`) confirms reception: they follow
  the response being handed to the SDK, which batches and retries sending. A
  network failure right after submission can still lose it, which is why the
  wording thanks the user instead of claiming the response was sent.
- **Close animation.** PostHog removes a closed popover after a short
  animation. A click during that animation can display the survey and then lose
  it to the delayed cleanup; clicking again opens it.
- **Automated browsers.** PostHog drops events from browsers it classifies as
  bots, including `navigator.webdriver`. Such a browser can show the form while
  Paralleax reports it as unavailable.

### Survey answers versus product analytics

This integration collects **voluntary survey answers only**. It is not product
analytics: there are no pageviews, clicks, sessions, journeys, or person
profiles. Enabling product analytics later is a separate product decision that
needs a consent flow, an updated privacy notice, and its own configuration; it
must not be added by changing these SDK options.

## Failure behavior

| Situation                                        | Result                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Variables missing or invalid (`phx_`, path...)   | No button, no SDK                                                                       |
| SDK chunk blocked, offline, or stalled over 15 s | `The feedback form is unavailable. Try again later.`                                    |
| PostHog unreachable, blocked, or timing out      | Same message after at most about 10 seconds                                             |
| Survey draft, archived, ended, or unknown        | Same message; no popover                                                                |
| Survey loaded but not displayed within 4 seconds | Same message                                                                            |
| User closes the survey                           | Nothing announced; the button reopens it                                                |
| Response submitted                               | PostHog thank-you screen; `Thank you for your feedback!` is announced to screen readers |

The button is disabled only while a request is in progress. No error escapes
to the application, and a later click retries the SDK load.

## Simulation survey and product events

The current application does not send automatic journey milestones and does
not open a survey after Simulation. It has no consent control for behavioral
tracking. Keep these transmissions disabled until a consent flow and the
associated alpha privacy notice have been approved.

When that consent decision is in place, a separate Simulation survey can ask
“Were you able to do what you wanted with Paralleax?” with `Yes`,
`Partially`, and `No` answers, and an optional free-text difficulty question
for `Partially` and `No`.

The proposed milestone names are `first_story_created`,
`first_interaction_added`, `first_connection_created`,
`first_simulation_succeeded`, `onboarding_started`, `onboarding_completed`,
`onboarding_skipped`, `onboarding_abandoned`, and `blocking_flow_error`. They
must remain separate from technical error reports and survey answers. If
enabled later, send only these milestone names and minimal categorical fields;
never send story ids, story text, variable values, account identifiers, or
per-action histories. The feedback adapter's event allowlist would drop them;
product analytics needs its own reviewed integration.

## Open-alpha survey

Since the 2026-11-19 [priority decision](../roadmap.md#priority-decision-2026-11-19),
this feedback survey is the main source of product validation instead of
guided sessions. Before opening the alpha (roadmap task 9):

1. The optional profile question tests the
   [audience hypothesis](../positioning.md#audience-hypothesis): solo writer
   (hobby), professional writer, game studio, visual-novel team, educator or
   trainer, other. It is present in the PostHog survey.
2. The optional `narrative_tool_experience` question (none, Twine or Ink,
   ChoiceScript or QSP, a game engine such as Ren'Py, Unity, or Godot, other)
   is not in the current PostHog survey. Add it before the open alpha if the
   tool-experience hypothesis is still wanted.
3. Keep profile questions optional and categorical. They are self-declared,
   never linked to an account, and must be listed in the alpha privacy notice
   before the survey is published.
4. Keep the feedback type and the description unchanged, so the survey stays
   short enough for a quick report.

Feedback is self-selected: authors who give up early rarely answer. Triage
(roadmap task 10) therefore does not read the absence of negative feedback as a
sign that the editor is clear.

## Verification

Automated checks (no PostHog account needed):

- `posthogFeedbackClient.sdk.test.ts` runs the real `posthog-js` bundle against
  a stubbed API: no request before the click, only `/api/surveys/` and `/e/`,
  translated rendering, sanitized payloads, reopening, draft and network
  failures.
- `tests/e2e/feedback.spec.ts` runs the same journey in Chromium on desktop and
  a Pixel 7 viewport, against a dev server started with a test token.

Manual checks after launching the survey in a test environment. Prefix test
answers with `[TEST]` in the description so they can be filtered or deleted:

1. Build with the variables set and confirm the localized button appears from
   the library, editor, Simulation, and Reader routes.
2. Open each route without clicking; confirm in the browser network panel that
   no request goes to PostHog.
3. Click the button in each language and confirm the translated survey opens,
   can be closed, and opens again.
4. Submit a categorized test response and confirm in PostHog that it shows the
   five `paralleax_*` properties, the normalized `$current_url`, and no browser
   URL, referrer, browser, device, or IP-derived location.
5. Submit a second response from the same page and confirm both are recorded.
6. Repeat on a phone.
7. With the CSP active (production image), confirm the browser console reports
   no CSP violation.
8. Confirm the alpha privacy notice describes the survey, its fields, the
   provider, hosting region, retention, and the IP limit above.
