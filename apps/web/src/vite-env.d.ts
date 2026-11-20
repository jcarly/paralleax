/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_PROJECT_TOKEN?: string;
  readonly VITE_POSTHOG_API_HOST?: string;
  readonly VITE_POSTHOG_FEEDBACK_SURVEY_ID?: string;
}
