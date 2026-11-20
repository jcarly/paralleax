import type { BeforeSendFn, PostHogConfig } from 'posthog-js';
import type { PostHogFeedbackConfig } from './feedbackConfig';

/**
 * PostHog configuration for voluntary survey answers only. Every automatic
 * collection feature is disabled explicitly instead of relying on project
 * settings or SDK defaults, which can change between releases.
 */
export function buildPostHogInitConfig(
  config: PostHogFeedbackConfig,
  language: string,
  beforeSend: BeforeSendFn,
): Partial<PostHogConfig> {
  return {
    api_host: config.apiHost,
    // No cookie or localStorage identity: a new pseudonymous id per page load.
    persistence: 'memory',
    person_profiles: 'never',
    // Behavioral collection.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    disable_scroll_properties: true,
    save_referrer: false,
    // Session replay and form content.
    disable_session_recording: true,
    enable_recording_console_log: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    // Unrelated products.
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    // No remote config, feature flag request, or third-party script. The
    // survey renderer is bundled with Paralleax.
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    advanced_enable_surveys: true,
    // Surveys appear only through an explicit `displaySurvey()` call.
    disable_surveys_automatic_display: true,
    surveys_request_timeout_ms: 8000,
    override_display_language: language,
    before_send: beforeSend,
  };
}
