import { randomUUID } from 'node:crypto';

const DAILY_KEY = /^daily\/\d{4}-\d{2}-\d{2}\.dump\.age$/i;
const MAX_DAILY_AGE_MS = 30 * 60 * 60 * 1000;

export const BACKUP_RETENTION = Object.freeze({ daily: 14, weekly: 8 });
export const BACKUP_LIFECYCLE = Object.freeze({
  abortIncompleteMultipartDays: 1,
  stagingCurrentDays: 1,
  stagingNoncurrentDays: 1,
  dailyCurrentDays: BACKUP_RETENTION.daily,
  dailyNoncurrentDays: BACKUP_RETENTION.daily,
  weeklyCurrentDays: BACKUP_RETENTION.weekly * 7,
  weeklyNoncurrentDays: BACKUP_RETENTION.weekly * 7,
});

export class BackupError extends Error {
  constructor(message, code = 'BACKUP_FAILED') {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

export function validateConfiguration(environment) {
  const required = [
    'BACKUP_DATABASE_URL',
    'AGE_RECIPIENT',
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'BACKUP_HEARTBEAT_URL',
  ];
  const missing = required.filter((name) => !environment[name]);
  if (missing.length) {
    throw new BackupError(
      `Missing required configuration: ${missing.join(', ')}`,
      'CONFIG_MISSING',
    );
  }
  if (!environment.AGE_RECIPIENT.startsWith('age1')) {
    throw new BackupError('AGE_RECIPIENT must be an age public key', 'CONFIG_INVALID');
  }

  const allowTestLoopbackHttp = environment.BACKUP_TEST_ALLOW_LOOPBACK_HTTP === '1';
  validateHttpsUrl(environment.S3_ENDPOINT, 'S3_ENDPOINT', true, allowTestLoopbackHttp);
  validateHttpsUrl(
    environment.BACKUP_HEARTBEAT_URL,
    'BACKUP_HEARTBEAT_URL',
    false,
    allowTestLoopbackHttp,
  );

  return {
    databaseUrl: environment.BACKUP_DATABASE_URL,
    recipient: environment.AGE_RECIPIENT,
    endpoint: environment.S3_ENDPOINT,
    bucket: environment.S3_BUCKET,
    region: environment.S3_REGION,
    accessKeyId: environment.AWS_ACCESS_KEY_ID,
    secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
    heartbeatUrl: environment.BACKUP_HEARTBEAT_URL,
  };
}

function validateHttpsUrl(input, name, rootOnly = false, allowTestLoopbackHttp = false) {
  let value;
  try {
    value = new URL(input);
  } catch {
    throw new BackupError(`${name} must be a valid HTTPS URL`, 'CONFIG_INVALID');
  }
  if (!isAllowedBackupUrl(value, rootOnly, allowTestLoopbackHttp)) {
    throw new BackupError(`${name} must be a valid HTTPS URL`, 'CONFIG_INVALID');
  }
}

function isAllowedBackupUrl(value, rootOnly, allowTestLoopbackHttp) {
  const secure = value.protocol === 'https:';
  const testLoopback = isTestLoopbackUrl(value, allowTestLoopbackHttp);
  const noCredentials = !value.username && !value.password;
  const noQueryOrFragment = !value.search && !value.hash;
  const expectedPath = !rootOnly || value.pathname === '/';
  return (secure || testLoopback) && noCredentials && noQueryOrFragment && expectedPath;
}

function isTestLoopbackUrl(value, enabled) {
  return (
    enabled &&
    value.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(value.hostname.toLowerCase())
  );
}

export function dailyObjectKey(date) {
  return `daily/${date.toISOString().slice(0, 10)}.dump.age`;
}

export function weeklyObjectKey(date) {
  return `weekly/${date.toISOString().slice(0, 10)}.dump.age`;
}

export function attemptObjectKey(date, attemptId = randomUUID()) {
  return `staging/${date.toISOString().slice(0, 10)}/${validateAttemptId(attemptId)}.dump.age`;
}

function validateAttemptId(attemptId) {
  if (typeof attemptId !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(attemptId)) {
    throw new BackupError('Backup attempt identifier is invalid', 'CONFIG_INVALID');
  }
  return attemptId;
}

export function shouldKeepWeeklyCopy(date) {
  return date.getUTCDay() === 0;
}

export function hasRecentDailyBackup(objects, now, maximumAgeMs = MAX_DAILY_AGE_MS) {
  const timestamps = objects
    .filter((object) => DAILY_KEY.test(object.key ?? object.Key ?? ''))
    .map((object) => Date.parse(object.lastModified ?? object.LastModified))
    .filter(Number.isFinite);

  if (!timestamps.length) {
    return false;
  }

  const age = now.getTime() - Math.max(...timestamps);
  return age >= -5 * 60 * 1000 && age <= maximumAgeMs;
}
