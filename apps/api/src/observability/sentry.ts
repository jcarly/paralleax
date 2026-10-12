import * as Sentry from '@sentry/nestjs';
import { loadSentryConfig } from './sentry-config';

const sentryConfig = loadSentryConfig(process.env);
const sentryEnabled = Boolean(sentryConfig.dsn) && process.env.NODE_ENV !== 'test';

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryConfig.dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: sentryConfig.release,
    ...(sentryConfig.tracesSampleRate === undefined
      ? {}
      : { tracesSampleRate: sentryConfig.tracesSampleRate }),
    includeServerName: false,
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

interface ApiExceptionContext {
  requestId: string;
  method: string;
  status: number;
  code: string;
}

export function captureApiException(exception: unknown, context: ApiExceptionContext) {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    scope.setTags({
      request_id: context.requestId,
      'http.method': context.method,
      'http.status_code': String(context.status),
      'paralleax.error_code': context.code,
    });
    Sentry.captureException(exception);
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
