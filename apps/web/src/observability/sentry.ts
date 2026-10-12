import * as Sentry from '@sentry/react';
import packageMetadata from '../../../../package.json';

export interface BrowserSentryConfig {
  dsn: string;
  release?: string;
  tracesSampleRate?: number;
}

export function parseBrowserSentryConfig(
  dsnValue: string | undefined,
  releaseValue: string | undefined,
  tracesSampleRateValue: string | undefined,
): BrowserSentryConfig | null {
  const dsn = parseSentryDsn(dsnValue);
  if (!dsn) return null;
  const tracesSampleRate = parseSampleRate(tracesSampleRateValue);
  return {
    dsn,
    release: parseRelease(releaseValue) ?? packageMetadata.version,
    ...(tracesSampleRate === undefined ? {} : { tracesSampleRate }),
  };
}

export const browserSentryConfig = parseBrowserSentryConfig(
  import.meta.env.VITE_SENTRY_DSN,
  import.meta.env.VITE_SENTRY_RELEASE,
  import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
);

export function initializeSentry(configuration = browserSentryConfig) {
  if (!configuration) return;
  Sentry.init({
    dsn: configuration.dsn,
    environment: import.meta.env.MODE,
    release: configuration.release,
    ...(configuration.tracesSampleRate === undefined
      ? {}
      : {
          tracesSampleRate: configuration.tracesSampleRate,
          integrations: [Sentry.browserTracingIntegration()],
          tracePropagationTargets: [/^\/api/],
        }),
    maxBreadcrumbs: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    beforeBreadcrumb: () => null,
    beforeSend: redactSentryEvent,
  });
}

export function redactSentryEvent<T extends object>(event: T): T {
  const redacted = event as unknown as Record<string, unknown>;
  delete redacted.request;
  delete redacted.user;
  delete redacted.extra;
  delete redacted.contexts;
  redacted['breadcrumbs'] = [];
  redactExceptionPayload(redacted.exception);
  return event;
}

function parseSentryDsn(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !url.username ||
      url.password ||
      !url.hostname ||
      url.search ||
      url.hash ||
      url.pathname.split('/').filter(Boolean).length === 0
    ) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function parseRelease(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || /[\r\n]/.test(normalized) || normalized.length > 200) return undefined;
  return normalized;
}

function parseSampleRate(value: string | undefined): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function redactExceptionPayload(exception: unknown) {
  if (!isRecord(exception) || !Array.isArray(exception.values)) return;
  for (const value of exception.values) {
    if (!isRecord(value)) continue;
    delete value.value;
    const frames = isRecord(value.stacktrace) ? value.stacktrace.frames : undefined;
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      if (!isRecord(frame)) continue;
      delete frame.context_line;
      delete frame.pre_context;
      delete frame.post_context;
      delete frame.vars;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
