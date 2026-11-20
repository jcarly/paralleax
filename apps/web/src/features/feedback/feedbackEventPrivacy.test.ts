import type { CaptureResult } from 'posthog-js';
import { describe, expect, it } from 'vitest';
import { sanitizeFeedbackEvent } from './feedbackEventPrivacy';

const surveyId = 'survey-1';

function capture(event: string, properties: CaptureResult['properties']): CaptureResult {
  return { uuid: 'event-1', event, properties };
}

const surveyAnswerWithMetadata: CaptureResult = {
  ...capture('survey sent', {
    token: 'phc_token',
    distinct_id: 'anonymous-1',
    $lib: 'web',
    $lib_version: '1.448.0',
    $survey_id: surveyId,
    $survey_response: 'bug',
    $survey_response_question2: 'The save indicator is unclear.',
    $survey_completed: true,
    paralleax_route: '/stories/:storyId/edit',
    paralleax_surface: 'editor',
    $current_url: 'https://alpha.example/stories/story-secret/edit?panel=context',
    $pathname: '/stories/story-secret/edit',
    $host: 'alpha.example',
    $referrer: 'https://mail.example/inbox',
    $referring_domain: 'mail.example',
    $session_id: 'session-1',
    $window_id: 'window-1',
    $device_id: 'device-1',
    $browser: 'Chrome',
    $os: 'Linux',
    $screen_width: 1440,
    sessionRecordingUrl: 'https://eu.posthog.com/replay/session-1',
    $set: { email: 'author@example.com' },
  }),
  $set: { email: 'author@example.com' },
  $set_once: { $initial_current_url: 'https://alpha.example/stories/story-secret/edit' },
};

const sanitizedSurveyAnswer = {
  uuid: 'event-1',
  event: 'survey sent',
  properties: {
    token: 'phc_token',
    distinct_id: 'anonymous-1',
    $lib: 'web',
    $lib_version: '1.448.0',
    $survey_id: surveyId,
    $survey_response: 'bug',
    $survey_response_question2: 'The save indicator is unclear.',
    $survey_completed: true,
    paralleax_route: '/stories/:storyId/edit',
    paralleax_surface: 'editor',
    $current_url: '/stories/:storyId/edit',
    $pathname: '/stories/:storyId/edit',
    $geoip_disable: true,
    $process_person_profile: false,
  },
};

describe('sanitizeFeedbackEvent survey answers', () => {
  it('keeps survey answers and Paralleax context while removing automatic metadata', () => {
    const sanitized = sanitizeFeedbackEvent(surveyAnswerWithMetadata, surveyId);

    expect(sanitized).toEqual(sanitizedSurveyAnswer);
    expect(JSON.stringify(sanitized)).not.toMatch(/story-secret|author@example|session-1/);
  });
});

describe('sanitizeFeedbackEvent filtering', () => {
  it.each([
    '$pageview',
    '$pageleave',
    '$autocapture',
    '$rageclick',
    '$exception',
    '$web_vitals',
    '$identify',
    '$opt_in',
    'custom event',
  ])('drops the automatic or unrelated %s event', (event) => {
    expect(sanitizeFeedbackEvent(capture(event, { $survey_id: surveyId }), surveyId)).toBeNull();
  });

  it('drops events of another survey and empty captures', () => {
    expect(
      sanitizeFeedbackEvent(capture('survey shown', { $survey_id: 'other-survey' }), surveyId),
    ).toBeNull();
    expect(sanitizeFeedbackEvent(null, surveyId)).toBeNull();
  });

  it('removes the browser URL when no normalized route is available', () => {
    const sanitized = sanitizeFeedbackEvent(
      capture('survey dismissed', {
        $survey_id: surveyId,
        $current_url: 'https://alpha.example/stories/story-secret/play',
      }),
      surveyId,
    );
    expect(sanitized?.properties).toEqual({
      $survey_id: surveyId,
      $geoip_disable: true,
      $process_person_profile: false,
    });
  });
});
