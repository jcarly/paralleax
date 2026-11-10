let initialization: ReturnType<typeof loadBrowserMonitoring> | undefined;

export function startBrowserMonitoring() {
  initialization ??= loadBrowserMonitoring();
  return initialization;
}

async function loadBrowserMonitoring() {
  const dsnValue: unknown = import.meta.env.VITE_SENTRY_DSN;
  if (typeof dsnValue !== 'string' || dsnValue.trim() === '') {
    return null;
  }
  try {
    const module = await import('./sentry');
    if (!module.browserSentryConfig) {
      console.error('Sentry monitoring is disabled: invalid browser DSN');
      return null;
    }
    module.initializeSentry();
    return module;
  } catch (error) {
    // Never block the application when optional monitoring is unavailable.
    console.error('Sentry monitoring could not be initialized', error);
    return null;
  }
}

export function reportBrowserError(error: Error, kind: 'dynamic-import' | 'route-error'): void {
  void startBrowserMonitoring()
    .then((module) => module?.captureBrowserException(error, kind))
    .catch((reportingError: unknown) => {
      console.error('Sentry could not report an application error', reportingError);
    });
}
