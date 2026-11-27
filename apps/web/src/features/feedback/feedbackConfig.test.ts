import { describe, expect, it } from 'vitest';
import { parsePostHogFeedbackConfig } from './feedbackConfig';

describe('parsePostHogFeedbackConfig', () => {
  it('requires an explicit environment-specific survey', () => {
    expect(parsePostHogFeedbackConfig('phc_public_token', 'https://eu.i.posthog.com')).toBeNull();
    expect(
      parsePostHogFeedbackConfig(' phc_public_token ', ' https://eu.i.posthog.com/ ', 'survey-1'),
    ).toEqual({
      projectToken: 'phc_public_token',
      apiHost: 'https://eu.i.posthog.com',
      surveyId: 'survey-1',
    });
  });

  it('accepts an explicit test survey and a local HTTP host', () => {
    expect(
      parsePostHogFeedbackConfig('phc_token', 'http://localhost:8010', ' 0190-test-survey '),
    ).toEqual({
      projectToken: 'phc_token',
      apiHost: 'http://localhost:8010',
      surveyId: '0190-test-survey',
    });
  });

  it.each([
    [undefined, 'https://eu.i.posthog.com', undefined],
    ['', 'https://eu.i.posthog.com', undefined],
    ['phx_personal_api_key', 'https://eu.i.posthog.com', undefined],
    ['phc_token', undefined, undefined],
    ['phc_token', 'not a URL', undefined],
    ['phc_token', 'javascript:alert(1)', undefined],
    ['phc_token', 'https://user:password@eu.i.posthog.com', undefined],
    ['phc_token', 'https://eu.i.posthog.com?unexpected=true', undefined],
    ['phc_token', 'https://eu.i.posthog.com/ingest', undefined],
    ['phc_token', 'https://eu.i.posthog.com', 'survey id with spaces'],
  ])(
    'disables feedback for an incomplete, private, or unsafe configuration',
    (token, apiHost, surveyId) => {
      expect(parsePostHogFeedbackConfig(token, apiHost, surveyId)).toBeNull();
    },
  );
});
