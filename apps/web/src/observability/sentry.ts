import * as Sentry from '@sentry/react';
import packageMetadata from '../../../../package.json';

export interface BrowserSentryConfig {
  dsn: string;
  release?: string;
  tracesSampleRate?: number;
}

export function parseBrowserSentryConfig(
  dsnValue: unknown,
  releaseValue: unknown,
  tracesSampleRateValue: unknown,
): BrowserSentryConfig | null {
  const dsn = parseSentryDsn(dsnValue);
  if (!dsn) {
    return null;
  }
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
  if (!configuration) {
    return;
  }
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

export function captureBrowserException(
  error: Error,
  kind: 'dynamic-import' | 'route-error',
): void {
  Sentry.captureException(error, {
    tags: { source: 'react-router', failure_kind: kind },
  });
}

export function redactSentryEvent<T extends object>(event: T): T {
  if (!isRecord(event)) {
    return event;
  }
  redactSensitiveEventData(event);
  return event;
}

function redactSensitiveEventData(event: Record<string, unknown>) {
  delete event.request;
  delete event.user;
  delete event.extra;
  delete event.contexts;
  event['breadcrumbs'] = [];
  redactExceptionPayload(event.exception);
}

function parseSentryDsn(value: unknown): string | null {
  const normalized = trimmedString(value);
  if (!normalized) {
    return null;
  }
  try {
    const url = new URL(normalized);
    if (!isValidSentryDsnUrl(url)) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function isValidSentryDsnUrl(url: URL): boolean {
  const supportedProtocol = url.protocol === 'http:' || url.protocol === 'https:';
  const hasPublicKey = Boolean(url.username) && !url.password;
  const hasProjectPath = url.pathname.split('/').some(Boolean);
  return (
    supportedProtocol &&
    hasPublicKey &&
    Boolean(url.hostname) &&
    !url.search &&
    !url.hash &&
    hasProjectPath
  );
}

function parseRelease(value: unknown): string | undefined {
  const normalized = trimmedString(value);
  if (!normalized || /[\r\n]/.test(normalized) || normalized.length > 200) {
    return undefined;
  }
  return normalized;
}

function parseSampleRate(value: unknown): number | undefined {
  const normalized = trimmedString(value);
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function redactExceptionPayload(exception: unknown) {
  if (!isRecord(exception) || !Array.isArray(exception.values)) {
    return;
  }
  for (const value of exception.values) {
    redactExceptionValue(value);
  }
}

function redactExceptionValue(value: unknown) {
  if (!isRecord(value)) {
    return;
  }
  delete value.value;
  redactStacktracePayload(value.stacktrace);
}

function redactStacktracePayload(stacktrace: unknown) {
  if (!isRecord(stacktrace) || !Array.isArray(stacktrace.frames)) {
    return;
  }
  for (const frame of stacktrace.frames) {
    redactFramePayload(frame);
  }
}

function redactFramePayload(frame: unknown) {
  if (!isRecord(frame)) {
    return;
  }
  delete frame.context_line;
  delete frame.pre_context;
  delete frame.post_context;
  delete frame.vars;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
