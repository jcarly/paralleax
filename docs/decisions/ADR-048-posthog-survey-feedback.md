# ADR-048 - PostHog Surveys for Voluntary In-App Feedback

**Status:** Accepted  
**Date:** 2026-11-20

## Context

Since the [2026-11-19 priority decision](../roadmap.md#priority-decision-2026-11-19),
the header feedback button is the main source of open-alpha product feedback.
It was implemented with Formbricks: a lazily loaded SDK, a code action
(`paralleax_feedback_opened`) and five hidden context fields. The feedback
survey has now been created in PostHog Surveys (EU Cloud, project `336282`) so
that responses and their triage live in one tool. Keeping two feedback
integrations would duplicate configuration, CSP rules and privacy disclosures.

The PostHog browser SDK is also a product-analytics SDK. With its defaults it
autocaptures clicks and pageviews, can record sessions, stores a pseudonymous
identity in a cookie and localStorage, loads remote configuration and feature
flags, and lazy-loads extension scripts from `*-assets.i.posthog.com`. None of
that is authorized for Paralleax: the alpha has no consent flow for behavioral
tracking.

## Decision

1. **PostHog replaces Formbricks.** Formbricks code, dependency, environment
   variables and CSP entries are removed. The survey trigger contract is now
   the survey id (`DEFAULT_FEEDBACK_SURVEY_ID`, overridable per environment)
   instead of a code action.
2. **One adapter in the web layer.** `apps/web/src/features/feedback/` is the
   only place that imports `posthog-js`. The shared domain, API and persistence
   layers do not know about PostHog. `PostHogFeedbackClient` exposes
   `openFeedback()` (never rejects) and `onSubmitted()`.
3. **Loaded on the first click.** No PostHog code or request exists before the
   user clicks `Give feedback`. The SDK chunk is a dynamic import.
4. **Self-hosted, strict-CSP bundle.** Paralleax imports
   `posthog-js/no-external` and the bundled survey renderer
   (`posthog-js/dist/surveys`) with `disable_external_dependency_loading`. CSP
   keeps `script-src 'self'`; only the API host is added to `connect-src`.
   The cost is a ~180 KB (gzip) lazy chunk, loaded only on demand.
5. **Explicit display through public APIs.** The survey keeps its `widget` type.
   `disable_surveys_automatic_display` prevents PostHog from rendering its own
   tab or selector widget, and the button calls
   `displaySurvey(id, { displayType: 'popover', ignoreConditions: true,
ignoreDelay: true, properties })`. Because `displaySurvey()` returns nothing
   and fails silently, the adapter first checks with `getSurveys(cb, true)`
   that the survey is launched, then waits for its `survey shown` event before
   reporting it as open.
6. **Minimal collection by configuration and by filter.** Every automatic
   capture feature is disabled explicitly (autocapture, pageviews and
   pageleaves, rage and dead clicks, heatmaps, performance, exceptions, session
   recording, product tours, conversations, web experiments). Remote config and
   feature flags are disabled (`advanced_disable_flags`) and surveys are enabled
   locally (`advanced_enable_surveys`). Identity is in memory only
   (`persistence: 'memory'`, `person_profiles: 'never'`) and `identify()` is
   never called. A `before_send` allowlist forwards only the lifecycle events of
   the configured survey, keeps only `$survey_*` answers, `paralleax_*` context
   and the minimal ingestion fields, replaces `$current_url` and `$pathname`
   with the normalized route, and sets `$geoip_disable`.
7. **Confirmation.** The PostHog survey's translated thank-you screen is the
   visible confirmation; Paralleax announces the submission to assistive
   technology only after a completed `survey sent` event.

## Consequences

- Responses carry a pseudonymous `distinct_id` that changes on every page load,
  plus the survey answers and the five context fields. The PostHog server still
  receives the client IP address with each request; the project must discard it
  (PostHog project setting) and the alpha privacy notice must say so.
- The survey extension writes `seenSurvey_*`, in-progress response and
  `lastSeenSurveyDate` keys to localStorage after the user opens the survey.
  They support partial responses and contain no identity.
- Product analytics remains a separate, future decision that needs a consent
  flow. Enabling it must not reuse this adapter's configuration silently.
- Browsers that PostHog classifies as bots (including `navigator.webdriver`)
  have their survey events dropped by the SDK; end-to-end tests present the
  test browser as an ordinary one.
- Upgrading `posthog-js` must keep the SDK integration test
  (`posthogFeedbackClient.sdk.test.ts`) green: it runs the real bundle and
  asserts the network contract.
