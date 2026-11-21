import type { CaptureResult, Properties } from 'posthog-js';

/** Survey lifecycle events that the feedback survey is allowed to send. */
export const FEEDBACK_SURVEY_EVENTS = [
  'survey shown',
  'survey sent',
  'survey dismissed',
  'survey abandoned',
] as const;

export type FeedbackSurveyEvent = (typeof FEEDBACK_SURVEY_EVENTS)[number];

// Minimal technical properties PostHog ingestion needs or uses to attribute an
// SDK version. Everything else that the SDK adds automatically (URLs, referrer,
// browser, device, screen, session and window ids, person properties) is
// dropped before the request leaves the browser.
const TECHNICAL_PROPERTIES = new Set([
  'token',
  'distinct_id',
  '$lib',
  '$lib_version',
  '$process_person_profile',
]);

const CONTEXT_PREFIX = 'paralleax_';
const SURVEY_PREFIX = '$survey_';

function isFeedbackSurveyEvent(event: string): event is FeedbackSurveyEvent {
  return (FEEDBACK_SURVEY_EVENTS as readonly string[]).includes(event);
}

function keepProperty(name: string): boolean {
  return (
    TECHNICAL_PROPERTIES.has(name) ||
    name.startsWith(SURVEY_PREFIX) ||
    name.startsWith(CONTEXT_PREFIX)
  );
}

/**
 * Reduces an outgoing PostHog event to the feedback survey contract, or drops
 * it. Only lifecycle events of the configured survey survive; their properties
 * are limited to survey answers, the Paralleax context fields, and the minimal
 * technical fields. `$current_url` and `$pathname` carry the normalized route,
 * never the browser URL, and GeoIP enrichment is disabled for the event.
 */
export function sanitizeFeedbackEvent(
  captured: CaptureResult | null,
  surveyId: string,
): CaptureResult | null {
  if (captured === null || !isFeedbackSurveyEvent(captured.event)) {
    return null;
  }
  const source = captured.properties;
  if (source.$survey_id !== surveyId) {
    return null;
  }

  const properties: Properties = {};
  for (const name of Object.keys(source)) {
    if (keepProperty(name)) {
      const value: unknown = source[name];
      properties[name] = value;
    }
  }
  const route: unknown = source.paralleax_route;
  if (typeof route === 'string') {
    properties.$pathname = route;
    properties.$current_url = route;
  }
  properties.$geoip_disable = true;
  properties.$process_person_profile = false;

  return {
    uuid: captured.uuid,
    event: captured.event,
    properties,
    ...(captured.timestamp === undefined ? {} : { timestamp: captured.timestamp }),
  };
}
