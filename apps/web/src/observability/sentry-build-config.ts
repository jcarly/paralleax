type Environment = Readonly<Record<string, string | undefined>>;

interface SentryCredentials {
  authToken: string | undefined;
  org: string | undefined;
  project: string | undefined;
}

interface CompleteSentryCredentials {
  authToken: string;
  org: string;
  project: string;
}

interface SentryUploadConfig extends CompleteSentryCredentials {
  release?: { name: string };
  sourcemaps: { filesToDeleteAfterUpload: string[] };
  telemetry: false;
  url?: string;
}

function optionalValue(environment: Environment, name: string): string | undefined {
  const value = environment[name]?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

function credentialsFrom(environment: Environment): SentryCredentials {
  return {
    authToken: optionalValue(environment, 'SENTRY_AUTH_TOKEN'),
    org: optionalValue(environment, 'SENTRY_ORG'),
    project: optionalValue(environment, 'SENTRY_PROJECT'),
  };
}

function hasCompleteCredentials(
  credentials: SentryCredentials,
): credentials is CompleteSentryCredentials {
  const count = [credentials.authToken, credentials.org, credentials.project].filter(
    (value) => value !== undefined,
  ).length;
  if (count === 0) {
    return false;
  }
  if (count !== 3) {
    throw new Error(
      'SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT must be configured together',
    );
  }

  return true;
}

function createUploadConfig(
  environment: Environment,
  credentials: CompleteSentryCredentials,
): SentryUploadConfig {
  const config: SentryUploadConfig = {
    ...credentials,
    telemetry: false,
    sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
  };

  const url = optionalValue(environment, 'SENTRY_URL');
  if (url !== undefined) {
    config.url = url;
  }
  const release = optionalValue(environment, 'VITE_SENTRY_RELEASE');
  if (release !== undefined) {
    config.release = { name: release };
  }

  return config;
}

export function sentrySourceMapUploadConfig(environment: Environment) {
  const credentials = credentialsFrom(environment);
  if (!hasCompleteCredentials(credentials)) {
    return undefined;
  }
  return createUploadConfig(environment, credentials);
}
