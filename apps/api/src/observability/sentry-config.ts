export interface SentryConfig {
  dsn?: string;
  release?: string;
  tracesSampleRate?: number;
}

export function loadSentryConfig(environment: NodeJS.ProcessEnv): SentryConfig {
  return {
    dsn: optionalSentryDsn(environment.SENTRY_DSN),
    release: optionalRelease(environment.SENTRY_RELEASE),
    tracesSampleRate: optionalSampleRate(
      'SENTRY_TRACES_SAMPLE_RATE',
      environment.SENTRY_TRACES_SAMPLE_RATE,
    ),
  };
}

function optionalSentryDsn(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('SENTRY_DSN must be a valid http(s) Sentry DSN');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.username ||
    url.password ||
    !url.hostname ||
    url.search ||
    url.hash ||
    url.pathname.split('/').filter(Boolean).length === 0
  ) {
    throw new Error('SENTRY_DSN must be a valid http(s) Sentry DSN');
  }
  return normalized;
}

function optionalRelease(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (/[\r\n]/.test(normalized) || normalized.length > 200) {
    throw new Error('SENTRY_RELEASE must contain at most 200 characters and no line break');
  }
  return normalized;
}

function optionalSampleRate(name: string, value: string | undefined): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return parsed;
}
