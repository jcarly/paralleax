import packageMetadata from '../../../package.json';

/**
 * PostHog survey that the header feedback button opens. The survey belongs to
 * the Paralleax PostHog project; override it per environment only when a
 * separate test survey is used.
 */
export const DEFAULT_FEEDBACK_SURVEY_ID = '01a1f88c-830b-0000-a431-e0f5703c21fc';

export interface PostHogFeedbackConfig {
  apiHost: string;
  projectToken: string;
  surveyId: string;
}

// Public project tokens start with `phc_`. Personal API keys (`phx_`) and any
// other secret must never reach the browser bundle.
const PUBLIC_PROJECT_TOKEN = /^phc_[A-Za-z0-9_-]+$/;
const SURVEY_ID = /^[A-Za-z0-9-]+$/;

function isBareHttpOrigin(url: URL): boolean {
  const httpProtocol = url.protocol === 'http:' || url.protocol === 'https:';
  const extraParts = [url.username, url.password, url.search, url.hash].some((part) => part !== '');
  return httpProtocol && !extraParts && url.pathname === '/';
}

function normalizeApiHost(value: string | undefined): string | null {
  const candidate = value?.trim() ?? '';
  if (!URL.canParse(candidate)) {
    return null;
  }
  const url = new URL(candidate);
  return isBareHttpOrigin(url) ? url.origin : null;
}

function normalizeSurveyId(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (candidate === undefined || candidate === '') {
    return DEFAULT_FEEDBACK_SURVEY_ID;
  }
  return SURVEY_ID.test(candidate) ? candidate : null;
}

export function parsePostHogFeedbackConfig(
  projectTokenValue: string | undefined,
  apiHostValue: string | undefined,
  surveyIdValue?: string,
): PostHogFeedbackConfig | null {
  const projectToken = projectTokenValue?.trim() ?? '';
  const apiHost = normalizeApiHost(apiHostValue);
  const surveyId = normalizeSurveyId(surveyIdValue);
  if (!PUBLIC_PROJECT_TOKEN.test(projectToken) || apiHost === null || surveyId === null) {
    return null;
  }
  return { apiHost, projectToken, surveyId };
}

export const postHogFeedbackConfig = parsePostHogFeedbackConfig(
  import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
  import.meta.env.VITE_POSTHOG_API_HOST,
  import.meta.env.VITE_POSTHOG_FEEDBACK_SURVEY_ID,
);

export const paralleaxVersion = packageMetadata.version;
