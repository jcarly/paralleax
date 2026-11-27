import { getBrowserConfig } from '../../observability/browserConfig';
import packageMetadata from '../../../package.json';

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
    return null;
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

export const getPostHogFeedbackConfig = () =>
  parsePostHogFeedbackConfig(
    getBrowserConfig().posthogProjectToken,
    getBrowserConfig().posthogApiHost,
    getBrowserConfig().posthogFeedbackSurveyId,
  );

export const paralleaxVersion = packageMetadata.version;
