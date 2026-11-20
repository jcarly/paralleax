import { describe, expect, it } from 'vitest';
import { buildPostHogInitConfig } from './posthogInitConfig';

describe('buildPostHogInitConfig', () => {
  const beforeSend = () => null;
  const config = buildPostHogInitConfig(
    { apiHost: 'https://eu.i.posthog.com', projectToken: 'phc_token', surveyId: 'survey-1' },
    'it',
    beforeSend,
  );

  it('targets the configured host, language, and privacy filter', () => {
    expect(config).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      override_display_language: 'it',
      before_send: beforeSend,
    });
  });

  it('disables automatic and behavioral collection explicitly', () => {
    expect(config).toMatchObject({
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_performance: false,
      capture_exceptions: false,
      disable_session_recording: true,
      enable_recording_console_log: false,
      save_referrer: false,
      disable_scroll_properties: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
    });
  });

  it('keeps no persistent identity and loads no remote script or config', () => {
    expect(config).toMatchObject({
      persistence: 'memory',
      person_profiles: 'never',
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      advanced_enable_surveys: true,
      disable_surveys_automatic_display: true,
    });
  });
});
