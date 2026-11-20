// Runs the real posthog-js bundle that Paralleax ships, with the PostHog API
// replaced by a local fetch stub, to verify that the SDK honors the privacy
// configuration and opens the survey through its public API. The SDK is a
// process-wide singleton, so the scenarios share one client and run in order.
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { feedbackSurveyFixture } from '../../test/feedbackSurveyFixture';
import type { PostHogFeedbackClient } from './posthogFeedbackClient';

const apiHost = 'https://eu.i.posthog.com';
const surveyId = 'survey-sdk-test';
const publishedSurveys = () => Response.json({ surveys: [feedbackSurveyFixture(surveyId)] });

interface SentEvent {
  event: string;
  properties: Record<string, unknown>;
}

const requests: Array<{ url: URL; body: string }> = [];
let surveysResponse: () => Response = publishedSurveys;
let client: PostHogFeedbackClient;

const context = {
  paralleax_route: '/stories/:storyId/edit',
  paralleax_surface: 'editor',
  paralleax_version: '0.1.0',
  paralleax_viewport: '390x844',
};

/** The SDK may gzip event batches; detect them by their magic bytes. */
async function readBody(body: BodyInit | null | undefined): Promise<string> {
  if (body === undefined || body === null) {
    return '';
  }
  const bytes = new Uint8Array(await new Response(body).arrayBuffer());
  return bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes).toString('utf8')
    : new TextDecoder().decode(bytes);
}

function isEventBatch(value: unknown): value is { batch: SentEvent[] } {
  return typeof value === 'object' && value !== null && Array.isArray(Reflect.get(value, 'batch'));
}

function sentEvents(): SentEvent[] {
  return requests
    .filter(({ url, body }) => url.pathname === '/e/' && body !== '')
    .flatMap(({ body }) => {
      const parsed: unknown = JSON.parse(body);
      return isEventBatch(parsed) ? parsed.batch : [];
    });
}

async function waitForSentEvent(event: string) {
  await vi.waitFor(
    () => {
      expect(sentEvents().map((sent) => sent.event)).toContain(event);
    },
    { timeout: 8000 },
  );
}

function surveyRoot(): ShadowRoot | null {
  return (
    Array.from(document.body.children).find((element) => element.shadowRoot)?.shadowRoot ?? null
  );
}

async function closeSurvey() {
  surveyRoot()?.querySelector<HTMLButtonElement>('button[aria-label="Close survey"]')?.click();
  await vi.waitFor(
    () => {
      expect(surveyRoot()).toBeNull();
    },
    { timeout: 3000 },
  );
}

async function answerSurvey(choice: string) {
  const root = surveyRoot();
  const option = Array.from(root?.querySelectorAll('label') ?? []).find(
    (label) => label.textContent.trim() === choice,
  );
  option?.click();
  await vi.waitFor(() => {
    const submit = root?.querySelector<HTMLButtonElement>('button[aria-label="Submit survey"]');
    expect(submit?.disabled).toBe(false);
    submit?.click();
  });
}

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requests.push({ url, body: await readBody(init?.body) });
      return url.pathname.startsWith('/api/surveys')
        ? surveysResponse()
        : Response.json({ status: 1 });
    }),
  );
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test_token');
  vi.stubEnv('VITE_POSTHOG_API_HOST', apiHost);
  vi.stubEnv('VITE_POSTHOG_FEEDBACK_SURVEY_ID', surveyId);
  window.history.replaceState(null, '', '/stories/story-secret/edit?panel=context');
  vi.resetModules();
  ({ postHogFeedbackClient: client } = await import('./posthogFeedbackClient'));
});

beforeEach(() => {
  surveysResponse = publishedSurveys;
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  document.body.innerHTML = '';
});

describe('real SDK opening and answering', () => {
  it('makes no request before the click, then opens the translated survey', async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toEqual([]);
    expect(surveyRoot()).toBeNull();

    await expect(client.openFeedback('fr', context)).resolves.toBe('opened');

    expect(surveyRoot()?.textContent).toContain('Quel type de retour ?');
    expect(requests.map(({ url }) => `${url.origin}${url.pathname}`)).toEqual([
      `${apiHost}/api/surveys/`,
    ]);
  });

  it('sends the answer with the context and without automatic metadata', async () => {
    const submitted = vi.fn();
    const unsubscribe = client.onSubmitted(submitted);
    await answerSurvey('Bug');
    unsubscribe();
    expect(submitted).toHaveBeenCalledOnce();

    await waitForSentEvent('survey sent');
    const events = sentEvents();
    expect(new Set(events.map(({ event }) => event))).toEqual(
      new Set(['survey shown', 'survey sent']),
    );
    expect(events.find(({ event }) => event === 'survey sent')?.properties).toMatchObject({
      $survey_id: surveyId,
      '$survey_response_question-type': 'Bug',
      $survey_completed: true,
      $survey_language: 'fr',
      $current_url: '/stories/:storyId/edit',
      ...context,
      $geoip_disable: true,
      $process_person_profile: false,
    });
    expect(JSON.stringify(events)).not.toMatch(
      /story-secret|panel=context|\$session_id|\$window_id|\$referrer|\$browser|\$device_id|\$set/,
    );
  }, 15_000);
});

describe('real SDK reopening', () => {
  it('opens the survey again in another language after a response', async () => {
    // Close the thank-you message, as a tester would.
    await closeSurvey();

    await expect(client.openFeedback('it', context)).resolves.toBe('opened');
    expect(surveyRoot()?.textContent).toContain('Che tipo di feedback?');
  });

  it('reopens after a dismissal', async () => {
    await closeSurvey();
    await waitForSentEvent('survey dismissed');

    await expect(client.openFeedback('en', context)).resolves.toBe('opened');
    expect(surveyRoot()?.textContent).toContain('What kind of feedback?');
    await closeSurvey();
  }, 15_000);
});

describe('real SDK failures and event allowlist', () => {
  it('reports a draft survey and network failures as unavailable', async () => {
    surveysResponse = () => Response.json({ surveys: [] });
    await expect(client.openFeedback('en', context)).resolves.toBe('unavailable');
    expect(surveyRoot()).toBeNull();

    surveysResponse = () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(client.openFeedback('en', context)).resolves.toBe('unavailable');
    expect(surveyRoot()).toBeNull();
  });

  it('never sends events other than the survey lifecycle', () => {
    expect(new Set(sentEvents().map(({ event }) => event))).toEqual(
      new Set(['survey shown', 'survey sent', 'survey dismissed']),
    );
  });
});
