const DAILY_KEY = /^daily\/\d{4}-\d{2}-\d{2}\.dump\.age$/;
const WEEKLY_KEY = /^weekly\/\d{4}-\d{2}-\d{2}\.dump\.age$/;
const MAX_DAILY_AGE_MS = 30 * 60 * 60 * 1000;

export const BACKUP_RETENTION = Object.freeze({ daily: 14, weekly: 8 });

export class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupError';
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
    throw new BackupError(`Missing required configuration: ${missing.join(', ')}`);
  }
  if (!environment.AGE_RECIPIENT.startsWith('age1')) {
    throw new BackupError('AGE_RECIPIENT must be an age public key');
  }

  validateHttpsUrl(environment.S3_ENDPOINT, 'S3_ENDPOINT', true);
  validateHttpsUrl(environment.BACKUP_HEARTBEAT_URL, 'BACKUP_HEARTBEAT_URL');

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

function validateHttpsUrl(input, name, rootOnly = false) {
  let value;
  try {
    value = new URL(input);
  } catch {
    throw new BackupError(`${name} must be a valid HTTPS URL`);
  }
  if (
    value.protocol !== 'https:' ||
    value.username ||
    value.password ||
    value.search ||
    value.hash ||
    (rootOnly && value.pathname !== '/')
  ) {
    throw new BackupError(`${name} must be a valid HTTPS URL`);
  }
}

export function dailyObjectKey(date) {
  return `daily/${date.toISOString().slice(0, 10)}.dump.age`;
}

export function weeklyObjectKey(date) {
  return `weekly/${date.toISOString().slice(0, 10)}.dump.age`;
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

export function expiredObjectKeys(objects, prefix, limit) {
  const pattern = prefix === 'daily/' ? DAILY_KEY : prefix === 'weekly/' ? WEEKLY_KEY : null;
  if (!pattern) {
    throw new BackupError('Unsupported backup retention prefix');
  }

  return objects
    .filter((object) => pattern.test(object.key ?? object.Key ?? ''))
    .sort((left, right) => (right.key ?? right.Key).localeCompare(left.key ?? left.Key))
    .slice(limit)
    .map((object) => object.key ?? object.Key);
}
