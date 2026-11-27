export interface BrowserConfig {
  sentryDsn?: string;
  sentryRelease?: string;
  sentryTracesSampleRate?: string;
  posthogProjectToken?: string;
  posthogApiHost?: string;
  posthogFeedbackSurveyId?: string;
}

function localSurvey(value: string | undefined): string {
  return value === undefined || value === '' ? '01a1f88c-830b-0000-a431-e0f5703c21fc' : value;
}

const localConfig = (): BrowserConfig =>
  import.meta.env.DEV
    ? {
        sentryDsn: import.meta.env.VITE_SENTRY_DSN,
        sentryRelease: import.meta.env.VITE_SENTRY_RELEASE,
        sentryTracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
        posthogProjectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
        posthogApiHost: import.meta.env.VITE_POSTHOG_API_HOST,
        posthogFeedbackSurveyId: localSurvey(import.meta.env.VITE_POSTHOG_FEEDBACK_SURVEY_ID),
      }
    : {};

let config: BrowserConfig = localConfig();

export function getBrowserConfig(): BrowserConfig {
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function loadBrowserConfig(): Promise<void> {
  if (import.meta.env.DEV) {
    return;
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, 3000);
  });
  try {
    const request = fetch('/runtime-config.json', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    }).then(async (response): Promise<unknown> => (response.ok ? response.json() : undefined));
    const data: unknown = await Promise.race([request, timeout]);
    if (!isRecord(data)) {
      return;
    }
    const source = data;
    const result: BrowserConfig = {};
    for (const key of [
      'sentryDsn',
      'sentryRelease',
      'sentryTracesSampleRate',
      'posthogProjectToken',
      'posthogApiHost',
      'posthogFeedbackSurveyId',
    ] as const) {
      if (typeof source[key] === 'string') {
        result[key] = source[key];
      }
    }
    config = result;
  } catch {
    // Monitoring is optional, including when the endpoint is unavailable.
  } finally {
    clearTimeout(timer);
  }
}
