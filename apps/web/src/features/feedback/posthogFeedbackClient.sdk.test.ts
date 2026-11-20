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

function answers(completed: boolean): SentEvent[] {
  return sentEvents().filter(
    ({ event, properties }) =>
      event === 'survey sent' && properties.$survey_completed === completed,
  );
}

async function waitForSentEvent(match: (events: SentEvent[]) => boolean) {
  await vi.waitFor(
    () => {
      expect(match(sentEvents())).toBe(true);
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

async function showsQuestion(question: string) {
  await vi.waitFor(() => {
    expect(surveyRoot()?.querySelector('.survey-question')?.textContent).toBe(question);
  });
}

/** Survey state updates are asynchronous: wait until the answer is rendered. */
async function choose(choice: string) {
  const option = () =>
    Array.from(surveyRoot()?.querySelectorAll('label') ?? []).find(
      (label) => label.textContent.trim() === choice,
    );
  option()?.click();
  await vi.waitFor(() => {
    expect(option()?.querySelector('input')?.checked).toBe(true);
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function type(text: string) {
  const field = surveyRoot()?.querySelector('textarea');
  if (field) {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
}

/** Clicks the survey's next/submit button once the current answer is accepted. */
async function submitStep() {
  await vi.waitFor(() => {
    const submit = surveyRoot()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Submit survey"]',
    );
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

describe('real SDK opening and abandonment', () => {
  it('makes no request before the click, then opens the French base survey', async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toEqual([]);
    expect(surveyRoot()).toBeNull();

    await expect(client.openFeedback('fr', context)).resolves.toBe('opened');

    await showsQuestion('Quel type de retour ?');
    expect(requests.map(({ url }) => `${url.origin}${url.pathname}`)).toEqual([
      `${apiHost}/api/surveys/`,
    ]);
  });

  it('keeps a partial answer without thanking the user when the survey is abandoned', async () => {
    const thanked = vi.fn();
    const unsubscribe = client.onSubmitted(thanked);
    await choose('Bug');
    await submitStep();
    await showsQuestion('Décrivez votre retour');
    await closeSurvey();
    unsubscribe();

    await waitForSentEvent((events) => events.some(({ event }) => event === 'survey dismissed'));
    expect(thanked).not.toHaveBeenCalled();
    expect(answers(true)).toEqual([]);
    expect(answers(false).at(-1)?.properties).toMatchObject({
      '$survey_response_feedback-type': 'Bug',
      ...context,
    });
  }, 15_000);
});

describe('real SDK complete response', () => {
  it('sends the three answers with the context and without automatic metadata', async () => {
    const thanked = vi.fn();
    const unsubscribe = client.onSubmitted(thanked);
    await expect(client.openFeedback('en', context)).resolves.toBe('opened');
    await showsQuestion('What kind of feedback?');
    await choose('Usability difficulty');
    await submitStep();
    await showsQuestion('Describe your feedback');
    await type('[TEST] The save indicator is unclear.');
    await submitStep();
    await showsQuestion('What is your profile?');
    await choose('Game studio');
    await submitStep();
    unsubscribe();

    expect(thanked).toHaveBeenCalledOnce();
    await waitForSentEvent((events) =>
      events.some(({ properties }) => properties.$survey_completed === true),
    );
    const complete = answers(true);
    expect(complete).toHaveLength(1);
    expect(complete[0]?.properties).toMatchObject({
      $survey_id: surveyId,
      '$survey_response_feedback-type': 'Usability difficulty',
      '$survey_response_feedback-description': '[TEST] The save indicator is unclear.',
      '$survey_response_author-profile': 'Game studio',
      $survey_language: 'en',
      $current_url: '/stories/:storyId/edit',
      ...context,
      $geoip_disable: true,
      $process_person_profile: false,
    });
    expect(JSON.stringify(sentEvents())).not.toMatch(
      /story-secret|panel=context|\$session_id|\$window_id|\$referrer|\$browser|\$device_id|\$set/,
    );
  }, 15_000);
});

describe('real SDK reopening', () => {
  it('opens the survey again in Italian after a response', async () => {
    // Close the thank-you message, as a tester would.
    await closeSurvey();

    await expect(client.openFeedback('it', context)).resolves.toBe('opened');
    await showsQuestion('Che tipo di feedback?');
    await closeSurvey();
  });
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

  it('never sends events other than the survey lifecycle', async () => {
    await waitForSentEvent(
      (events) => events.filter(({ event }) => event === 'survey dismissed').length >= 2,
    );
    expect(new Set(sentEvents().map(({ event }) => event))).toEqual(
      new Set(['survey shown', 'survey sent', 'survey dismissed']),
    );
  });
});
