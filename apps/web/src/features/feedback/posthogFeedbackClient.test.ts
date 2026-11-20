import type { BeforeSendFn, CaptureResult, PostHogConfig, Properties, Survey } from 'posthog-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { feedbackSurveyFixture } from '../../test/feedbackSurveyFixture';
import type { PostHogFeedbackConfig } from './feedbackConfig';
import { PostHogFeedbackClient, type PostHogSurveySdk } from './posthogFeedbackClient';

const lazySdk = vi.hoisted(() => ({ loaded: vi.fn() }));

vi.mock('posthog-js/no-external', () => {
  lazySdk.loaded();
  return { default: { init: vi.fn() } };
});
vi.mock('posthog-js/dist/surveys', () => ({}));

const config: PostHogFeedbackConfig = {
  apiHost: 'https://eu.i.posthog.com',
  projectToken: 'phc_token',
  surveyId: 'survey-1',
};
const timeouts = { surveyLoadMs: 50, displayMs: 50 };

interface FakeSdkOptions {
  surveys?: Survey[];
  loaded?: boolean;
  rendersSurvey?: boolean;
}

/** Imitates the public SDK contract: every capture goes through `before_send`. */
function createFakeSdk({
  surveys = [feedbackSurveyFixture(config.surveyId)],
  loaded = true,
  rendersSurvey = true,
}: FakeSdkOptions = {}) {
  let beforeSend: BeforeSendFn = (event) => event;
  let displayProperties: Properties = {};
  const sent: CaptureResult[] = [];
  const capture = (event: string, properties: Properties) => {
    const result = beforeSend({ uuid: String(sent.length), event, properties });
    if (result !== null) {
      sent.push(result);
    }
  };
  const sdk = {
    set_config: vi.fn<PostHogSurveySdk['set_config']>(),
    getSurveys: vi.fn<PostHogSurveySdk['getSurveys']>((callback) => {
      callback(loaded ? surveys : [], { isLoaded: loaded });
    }),
    displaySurvey: vi.fn<PostHogSurveySdk['displaySurvey']>((surveyId, options) => {
      displayProperties = options.properties ?? {};
      if (rendersSurvey) {
        capture('survey shown', { $survey_id: surveyId });
      }
    }),
  };
  const loader = vi.fn((_token: string, initConfig: Partial<PostHogConfig>) => {
    const hook = initConfig.before_send;
    beforeSend = typeof hook === 'function' ? hook : beforeSend;
    capture('$pageview', { $current_url: 'https://alpha.example/stories/story-secret/edit' });
    return Promise.resolve<PostHogSurveySdk>(sdk);
  });
  const answer = (completed: boolean) => {
    capture('survey sent', {
      $survey_id: config.surveyId,
      $survey_completed: completed,
      ...displayProperties,
    });
  };
  const dismiss = () => {
    capture('survey dismissed', { $survey_id: config.surveyId });
  };
  return { sdk, loader, sent, answer, dismiss };
}

function createClient(fake: ReturnType<typeof createFakeSdk>) {
  return new PostHogFeedbackClient(fake.loader, config, timeouts);
}

describe('PostHog feedback client opening', () => {
  it('loads the SDK once, on demand, and opens the configured survey as a popover', async () => {
    const fake = createFakeSdk();
    const client = createClient(fake);
    expect(fake.loader).not.toHaveBeenCalled();

    await expect(client.openFeedback('fr', { paralleax_surface: 'editor' })).resolves.toBe(
      'opened',
    );

    expect(fake.loader).toHaveBeenCalledOnce();
    expect(fake.loader).toHaveBeenCalledWith(
      'phc_token',
      expect.objectContaining({ api_host: config.apiHost, override_display_language: 'fr' }),
    );
    expect(fake.sdk.getSurveys).toHaveBeenCalledWith(expect.any(Function), true);
    expect(fake.sdk.displaySurvey).toHaveBeenCalledWith('survey-1', {
      displayType: 'popover',
      ignoreConditions: true,
      ignoreDelay: true,
      properties: { paralleax_surface: 'editor' },
    });
    expect(fake.sent.map(({ event }) => event)).toEqual(['survey shown']);
  });

  it('does not display the survey twice while it is already open', async () => {
    const fake = createFakeSdk();
    const client = createClient(fake);

    await client.openFeedback('en', {});
    await expect(client.openFeedback('en', {})).resolves.toBe('opened');
    expect(fake.sdk.displaySurvey).toHaveBeenCalledOnce();
  });
});

describe('PostHog feedback client responses', () => {
  it('reopens after a dismissal and accepts several responses', async () => {
    const fake = createFakeSdk();
    const client = createClient(fake);
    const submitted = vi.fn();
    const unsubscribe = client.onSubmitted(submitted);

    await expect(client.openFeedback('en', {})).resolves.toBe('opened');
    fake.dismiss();
    await expect(client.openFeedback('en', {})).resolves.toBe('opened');
    fake.answer(false);
    expect(submitted).not.toHaveBeenCalled();
    fake.answer(true);
    await expect(client.openFeedback('it', {})).resolves.toBe('opened');
    fake.answer(true);

    expect(submitted).toHaveBeenCalledTimes(2);
    expect(fake.sdk.displaySurvey).toHaveBeenCalledTimes(3);
    expect(fake.sdk.set_config).toHaveBeenLastCalledWith({ override_display_language: 'it' });
    expect(fake.loader).toHaveBeenCalledOnce();
    unsubscribe();
    fake.answer(true);
    expect(submitted).toHaveBeenCalledTimes(2);
  });

  it('forwards only survey events with the normalized context', async () => {
    const fake = createFakeSdk();

    await createClient(fake).openFeedback('en', { paralleax_route: '/stories/:storyId/edit' });
    fake.answer(true);

    expect(fake.sent.map(({ event }) => event)).toEqual(['survey shown', 'survey sent']);
    expect(fake.sent[1]?.properties).toMatchObject({
      $current_url: '/stories/:storyId/edit',
      paralleax_route: '/stories/:storyId/edit',
      $geoip_disable: true,
    });
    expect(JSON.stringify(fake.sent)).not.toContain('story-secret');
  });
});

describe('PostHog feedback client failures', () => {
  it.each<[string, FakeSdkOptions]>([
    ['a draft or unknown survey', { surveys: [] }],
    [
      'an ended survey',
      { surveys: [feedbackSurveyFixture(config.surveyId, { end_date: '2026-11-01T00:00:00Z' })] },
    ],
    ['an unreachable surveys API', { loaded: false }],
    ['a survey that never renders', { rendersSurvey: false }],
  ])('reports %s as unavailable', async (_case, options) => {
    const client = createClient(createFakeSdk(options));

    await expect(client.openFeedback('en', {})).resolves.toBe('unavailable');
  });

  it('reports a surveys request that never answers as unavailable', async () => {
    const fake = createFakeSdk();
    fake.sdk.getSurveys.mockImplementation(() => undefined);

    await expect(createClient(fake).openFeedback('en', {})).resolves.toBe('unavailable');
    expect(fake.sdk.displaySurvey).not.toHaveBeenCalled();
  });

  it('contains SDK exceptions and retries a blocked SDK load on the next click', async () => {
    const fake = createFakeSdk();
    const loader = vi
      .fn<typeof fake.loader>()
      .mockRejectedValueOnce(new Error('blocked by an extension'))
      .mockImplementation(fake.loader);
    const client = new PostHogFeedbackClient(loader, config, timeouts);

    await expect(client.openFeedback('en', {})).resolves.toBe('unavailable');
    await expect(client.openFeedback('en', {})).resolves.toBe('opened');
    fake.dismiss();
    fake.sdk.getSurveys.mockImplementation(() => {
      throw new Error('offline');
    });
    await expect(client.openFeedback('en', {})).resolves.toBe('unavailable');
  });
});

describe('PostHog feedback client configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('stays inert without configuration', async () => {
    const fake = createFakeSdk();
    const client = new PostHogFeedbackClient(fake.loader, null, timeouts);

    expect(client.isConfigured).toBe(false);
    await expect(client.openFeedback('en', {})).resolves.toBe('unavailable');
    expect(fake.loader).not.toHaveBeenCalled();
  });

  it('does not import posthog-js until a configured client opens feedback', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_token');
    vi.stubEnv('VITE_POSTHOG_API_HOST', 'https://eu.i.posthog.com');
    vi.resetModules();

    const { postHogFeedbackClient } = await import('./posthogFeedbackClient');
    expect(postHogFeedbackClient.isConfigured).toBe(true);
    expect(lazySdk.loaded).not.toHaveBeenCalled();

    await expect(postHogFeedbackClient.openFeedback('en', {})).resolves.toBe('unavailable');
    expect(lazySdk.loaded).toHaveBeenCalledOnce();
  });
});
