import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BACKUP_LIFECYCLE,
  BACKUP_RETENTION,
  BackupError,
  createHeartbeat,
  dailyObjectKey,
  hasRecentDailyBackup,
  runBackupBatch,
  shouldKeepWeeklyCopy,
  validateConfiguration,
  weeklyObjectKey,
} from './postgres-backup-batch.mjs';

const runDate = new Date('2026-11-29T02:00:00.000Z');
const environment = {
  BACKUP_DATABASE_URL:
    'postgres://backup:synthetic-db-secret@postgres.railway.internal/paralleax?sslmode=require',
  AGE_RECIPIENT: 'age1syntheticpublicrecipient',
  S3_ENDPOINT: 'https://s3.example.test',
  S3_BUCKET: 'paralleax-private-backups',
  S3_REGION: 'test-region-1',
  AWS_ACCESS_KEY_ID: 'synthetic-access-key',
  AWS_SECRET_ACCESS_KEY: 'synthetic-s3-secret',
  BACKUP_HEARTBEAT_URL: 'https://monitor.example.test/opaque-monitor-token',
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
};

function createFakeStorage() {
  const objects = new Map();
  const versions = new Map();
  const calls = [];
  return {
    objects,
    versions,
    calls,
    async getBucketVersioning() {
      calls.push('versioning:Enabled');
      return 'Enabled';
    },
    async list(prefix) {
      calls.push(`list:${prefix}`);
      return [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({
          key,
          lastModified: object.lastModified,
          size: object.content.length,
        }));
    },
    async put({ path, key }) {
      calls.push(`put:${key}`);
      const content = await readFile(path);
      const previous = objects.get(key);
      if (previous) {
        const noncurrent = versions.get(key) ?? [];
        noncurrent.push(previous);
        versions.set(key, noncurrent);
      }
      objects.set(key, {
        content,
        lastModified: runDate.toISOString(),
      });
    },
    async get({ key, path }) {
      calls.push(`get:${key}`);
      const object = objects.get(key);
      if (!object) {
        throw new Error('synthetic missing object');
      }
      await writeFile(path, object.content);
    },
    async delete(key) {
      calls.push(`delete:${key}`);
      objects.delete(key);
    },
  };
}

async function createFixture({ previousBackup = true, initialObjects = [] } = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'paralleax-backup-batch-test-'));
  const storage = createFakeStorage();
  const events = [];
  const heartbeat = {
    async fail() {
      events.push('heartbeat:fail');
    },
    async success() {
      events.push('heartbeat:success');
    },
  };
  seedFakeObjects(storage, { previousBackup, initialObjects });
  const dependencies = createFixtureDependencies({ storage, heartbeat, events, temporaryRoot });
  return createFixtureControls({ storage, heartbeat, events, temporaryRoot, dependencies });
}

function seedFakeObjects(storage, { previousBackup, initialObjects }) {
  if (previousBackup) {
    storage.objects.set('daily/2026-11-28.dump.age', {
      content: Buffer.from('older encrypted archive'),
      lastModified: '2026-11-28T02:00:00.000Z',
    });
  }
  for (const [key, object] of initialObjects) {
    storage.objects.set(key, object);
  }
}

function createFixtureDependencies({ storage, heartbeat, events, temporaryRoot }) {
  const archiveContent = Buffer.from('synthetic PostgreSQL custom archive');
  return {
    environment,
    now: runDate,
    storage,
    heartbeat,
    temporaryRoot,
    async createArchive({ output }) {
      events.push('archive');
      await writeFile(output, archiveContent);
    },
    async validateArchive({ path }) {
      events.push('validate');
      assert.deepEqual(await readFile(path), archiveContent);
    },
    async encrypt({ input, output }) {
      events.push('encrypt');
      await writeFile(
        output,
        Buffer.concat([Buffer.from('age-encrypted:'), await readFile(input)]),
      );
    },
  };
}

function createFixtureControls({ storage, heartbeat, events, temporaryRoot, dependencies }) {
  let attemptNumber = 0;
  return {
    storage,
    events,
    heartbeat,
    temporaryRoot,
    run: (overrides = {}) =>
      runBackupBatch({
        ...dependencies,
        attemptId: `attempt-${++attemptNumber}`,
        ...overrides,
      }),
    async assertTemporaryFilesRemoved() {
      assert.deepEqual(await readdir(temporaryRoot), []);
    },
    async close() {
      await rm(temporaryRoot, { recursive: true, force: true });
    },
  };
}

test('configuration requires the database URL, age recipient, private S3 settings, and heartbeat', () => {
  assert.deepEqual(validateConfiguration(environment), {
    databaseUrl: environment.BACKUP_DATABASE_URL,
    recipient: environment.AGE_RECIPIENT,
    endpoint: environment.S3_ENDPOINT,
    bucket: environment.S3_BUCKET,
    region: environment.S3_REGION,
    accessKeyId: environment.AWS_ACCESS_KEY_ID,
    secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
    heartbeatUrl: environment.BACKUP_HEARTBEAT_URL,
  });

  assert.throws(
    () => validateConfiguration({ ...environment, AWS_SECRET_ACCESS_KEY: '' }),
    (error) =>
      error instanceof BackupError &&
      error.message.includes('AWS_SECRET_ACCESS_KEY') &&
      !error.message.includes(environment.BACKUP_DATABASE_URL) &&
      !error.message.includes(environment.AWS_SECRET_ACCESS_KEY),
  );
  assert.throws(
    () => validateConfiguration({ ...environment, S3_ENDPOINT: 'http://s3.example.test' }),
    /S3_ENDPOINT must be a valid HTTPS URL/,
  );
  assert.throws(
    () => validateConfiguration({ ...environment, S3_ENDPOINT: 'http://127.0.0.1:9090' }),
    /S3_ENDPOINT must be a valid HTTPS URL/,
  );
  assert.equal(
    validateConfiguration({
      ...environment,
      S3_ENDPOINT: 'http://127.0.0.1:9090',
      BACKUP_HEARTBEAT_URL: 'http://localhost:43210/monitor/test',
      BACKUP_TEST_ALLOW_LOOPBACK_HTTP: '1',
    }).endpoint,
    'http://127.0.0.1:9090',
  );
  assert.throws(
    () =>
      validateConfiguration({
        ...environment,
        S3_ENDPOINT: 'http://s3.example.test',
        BACKUP_TEST_ALLOW_LOOPBACK_HTTP: '1',
      }),
    /S3_ENDPOINT must be a valid HTTPS URL/,
  );
});

test('backup object keys are canonical per UTC date and weekly copies are created on Sunday UTC', () => {
  assert.equal(dailyObjectKey(runDate), 'daily/2026-11-29.dump.age');
  assert.equal(weeklyObjectKey(runDate), 'weekly/2026-11-29.dump.age');
  assert.equal(shouldKeepWeeklyCopy(runDate), true);
  assert.equal(shouldKeepWeeklyCopy(new Date('2026-11-30T02:00:00.000Z')), false);
});

test('missing-backup detection rejects no object and an object older than the grace window', () => {
  assert.equal(hasRecentDailyBackup([], runDate), false);
  assert.equal(
    hasRecentDailyBackup(
      [{ key: 'daily/2026-11-27.dump.age', lastModified: '2026-11-27T01:00:00.000Z' }],
      runDate,
    ),
    false,
  );
  assert.equal(
    hasRecentDailyBackup(
      [{ key: 'daily/2026-11-28.dump.age', lastModified: '2026-11-28T02:00:00.000Z' }],
      runDate,
    ),
    true,
  );
  assert.equal(
    hasRecentDailyBackup(
      [{ key: 'daily/2026-11-27.dump.age', lastModified: '2026-11-27T20:00:00.000Z' }],
      runDate,
    ),
    true,
  );
  assert.equal(
    hasRecentDailyBackup(
      [{ key: 'daily/2026-11-27.dump.age', lastModified: '2026-11-27T19:59:59.000Z' }],
      runDate,
    ),
    false,
  );
});

test('provider lifecycle retains 14 daily and 8 weekly periods including noncurrent versions', () => {
  assert.deepEqual(BACKUP_RETENTION, { daily: 14, weekly: 8 });
  assert.deepEqual(BACKUP_LIFECYCLE, {
    abortIncompleteMultipartDays: 1,
    stagingCurrentDays: 1,
    stagingNoncurrentDays: 1,
    dailyCurrentDays: 14,
    dailyNoncurrentDays: 14,
    weeklyCurrentDays: 56,
    weeklyNoncurrentDays: 56,
  });
});

test('nominal batch verifies staging before promoting canonical daily and weekly objects', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.run();

    assert.deepEqual(fixture.events.slice(0, 3), ['archive', 'validate', 'encrypt']);
    assert.deepEqual(result.keys, ['daily/2026-11-29.dump.age', 'weekly/2026-11-29.dump.age']);
    assert.equal(result.verified, true);
    assert.equal(result.previousBackupFresh, true);
    assert.equal(fixture.storage.calls.filter((call) => call.startsWith('get:')).length, 3);
    assert.equal(fixture.storage.calls[0], 'versioning:Enabled');
    assert.equal(
      fixture.storage.calls.indexOf('put:staging/2026-11-29/attempt-1.dump.age') <
        fixture.storage.calls.indexOf('put:daily/2026-11-29.dump.age'),
      true,
    );
    assert.equal(fixture.events.at(-1), 'heartbeat:success');
    assert.equal(fixture.events.includes('heartbeat:fail'), false);
    assert.equal(fixture.storage.objects.has(result.keys[0]), true);
    assert.equal(fixture.storage.objects.has(result.keys[1]), true);
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('concurrent executions stage independently and preserve prior canonical object versions', async () => {
  const fixture = await createFixture();
  try {
    const [first, second] = await Promise.all([fixture.run(), fixture.run()]);
    assert.notEqual(first.attemptId, second.attemptId);
    assert.deepEqual(first.keys, second.keys);
    assert.equal(
      first.keys.every((key) => fixture.storage.objects.has(key)),
      true,
    );
    assert.equal(
      second.keys.every((key) => fixture.storage.objects.has(key)),
      true,
    );
    assert.equal(fixture.storage.objects.size, 5);
    assert.equal(fixture.storage.versions.get(first.keys[0]).length, 1);
    assert.equal(fixture.storage.versions.get(first.keys[1]).length, 1);
    assert.equal(fixture.events.filter((event) => event === 'heartbeat:success').length, 2);
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('invalid archive fails before encryption or upload and removes temporary files', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      fixture.run({
        async validateArchive() {
          throw new BackupError('PostgreSQL archive validation failed', 'ARCHIVE_INVALID');
        },
      }),
      /PostgreSQL archive validation failed/,
    );
    assert.equal(fixture.events.includes('encrypt'), false);
    assert.equal(
      fixture.storage.calls.some((call) => call.startsWith('put:')),
      false,
    );
    assert.equal(fixture.events.at(-1), 'heartbeat:fail');
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('encryption failure sends an alert and leaves no uploaded object or temporary file', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      fixture.run({
        async encrypt() {
          throw new BackupError(
            'synthetic encryption failure with secret details omitted',
            'ENCRYPTION_FAILED',
          );
        },
      }),
      (error) =>
        error instanceof BackupError &&
        error.code === 'ENCRYPTION_FAILED' &&
        !error.message.includes('credentials'),
    );
    assert.equal(
      fixture.storage.calls.some((call) => call.startsWith('put:')),
      false,
    );
    assert.equal(fixture.events.at(-1), 'heartbeat:fail');
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('a failed upload does not report success and removes temporary files', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      fixture.run({
        storage: {
          ...fixture.storage,
          async put() {
            throw new Error('synthetic transfer failure with private details');
          },
        },
      }),
      /Backup batch failed/,
    );
    assert.equal(fixture.events.includes('heartbeat:success'), false);
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('a failed transfer retry uses a new staging key and then promotes canonical keys', async () => {
  const fixture = await createFixture();
  let failFirstUpload = true;
  const storage = {
    ...fixture.storage,
    async put(request) {
      if (failFirstUpload) {
        failFirstUpload = false;
        throw new Error('synthetic interrupted upload');
      }
      await fixture.storage.put(request);
    },
  };
  try {
    await assert.rejects(fixture.run({ storage }), /Backup batch failed/);
    await fixture.assertTemporaryFilesRemoved();

    const retry = await fixture.run({ storage });

    assert.deepEqual(retry.keys, ['daily/2026-11-29.dump.age', 'weekly/2026-11-29.dump.age']);
    assert.equal(retry.verified, true);
    assert.equal(fixture.events.at(-1), 'heartbeat:success');
    assert.equal(fixture.storage.objects.size, 4);
    assert.equal(fixture.storage.objects.has('staging/2026-11-29/attempt-2.dump.age'), true);
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('an interrupted transfer reports failure and removes temporary files', async () => {
  const fixture = await createFixture();
  const controller = new globalThis.AbortController();
  try {
    const pending = fixture.run({
      signal: controller.signal,
      storage: {
        ...fixture.storage,
        async put({ signal }) {
          await new Promise((resolve, reject) => {
            if (signal.aborted) {
              reject(new Error('interrupted'));
              return;
            }
            signal.addEventListener('abort', () => reject(new Error('interrupted')), {
              once: true,
            });
          });
        },
      },
    });
    globalThis.setTimeout(() => controller.abort(), 10);
    await assert.rejects(pending, /Backup interrupted/);
    assert.equal(fixture.events.includes('heartbeat:success'), false);
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('failed staging verification preserves a verified same-day backup before a retry', async () => {
  const priorKey = 'daily/2026-11-29.dump.age';
  const priorObject = {
    content: Buffer.from('previously verified encrypted archive'),
    lastModified: runDate.toISOString(),
  };
  const fixture = await createFixture({
    previousBackup: false,
    initialObjects: [[priorKey, priorObject]],
  });
  let corruptFirstRead = true;
  try {
    const storage = {
      ...fixture.storage,
      async get({ key, path }) {
        fixture.storage.calls.push(`get:${key}`);
        const object = fixture.storage.objects.get(key);
        await writeFile(
          path,
          corruptFirstRead ? Buffer.from('corrupt ciphertext') : object.content,
        );
        corruptFirstRead = false;
      },
    };

    await assert.rejects(
      fixture.run({ storage }),
      (error) => error.code === 'REMOTE_INTEGRITY_FAILED',
    );
    assert.deepEqual(fixture.storage.objects.get(priorKey), priorObject);
    const retry = await fixture.run({ storage });
    assert.deepEqual(retry.keys, ['daily/2026-11-29.dump.age', 'weekly/2026-11-29.dump.age']);
    assert.deepEqual(fixture.storage.versions.get(priorKey)?.[0], priorObject);
    assert.equal(retry.verified, true);
    assert.equal(fixture.events.at(-1), 'heartbeat:success');
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('failed canonical promotion keeps the verified prior version recoverable across retry', async () => {
  const priorKey = 'daily/2026-11-29.dump.age';
  const priorObject = {
    content: Buffer.from('verified prior encrypted archive'),
    lastModified: runDate.toISOString(),
  };
  const fixture = await createFixture({
    previousBackup: false,
    initialObjects: [[priorKey, priorObject]],
  });
  let failFirstPromotionRead = true;
  const storage = {
    ...fixture.storage,
    async get({ key, path }) {
      if (key === priorKey && failFirstPromotionRead) {
        failFirstPromotionRead = false;
        fixture.storage.calls.push(`get:${key}`);
        await writeFile(path, Buffer.from('synthetic corrupt remote response'));
        return;
      }
      await fixture.storage.get({ key, path });
    },
  };
  try {
    await assert.rejects(
      fixture.run({ storage }),
      (error) => error.code === 'REMOTE_INTEGRITY_FAILED',
    );
    assert.deepEqual(fixture.storage.versions.get(priorKey)?.[0], priorObject);
    assert.equal(fixture.events.includes('heartbeat:success'), false);

    const retry = await fixture.run({ storage });
    assert.equal(retry.verified, true);
    assert.equal(
      fixture.storage.versions.get(priorKey)?.some((version) => version === priorObject),
      true,
    );
    assert.equal(fixture.events.at(-1), 'heartbeat:success');
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('a missing previous backup pings the external failure monitor before the recovery run', async () => {
  const fixture = await createFixture({ previousBackup: false });
  try {
    const result = await fixture.run();
    assert.equal(result.previousBackupFresh, false);
    assert.equal(fixture.events[0], 'heartbeat:fail');
    assert.equal(fixture.events.at(-1), 'heartbeat:success');
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('retention is provider-managed and the batch never deletes storage objects', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.run();
    assert.equal(result.retention.dailyCurrentDays, 14);
    assert.equal(result.retention.weeklyCurrentDays, 56);
    assert.equal(result.retention.stagingCurrentDays, 1);
    assert.equal(
      fixture.storage.calls.some((call) => call.startsWith('delete:')),
      false,
    );
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('backup refuses writes when bucket versioning is unavailable or disabled', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      fixture.run({
        storage: {
          ...fixture.storage,
          async getBucketVersioning() {
            return 'Suspended';
          },
        },
      }),
      (error) => error.code === 'S3_VERSIONING_REQUIRED',
    );
    assert.equal(
      fixture.storage.calls.some((call) => call.startsWith('put:')),
      false,
    );
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('heartbeat uses success and failure paths without logging its opaque URL', async () => {
  const urls = [];
  const heartbeat = createHeartbeat(environment.BACKUP_HEARTBEAT_URL, {
    async fetchRequest(url) {
      urls.push(String(url));
      return { ok: true };
    },
  });
  await heartbeat.fail();
  await heartbeat.success();

  assert.deepEqual(urls, [
    `${environment.BACKUP_HEARTBEAT_URL}/fail`,
    environment.BACKUP_HEARTBEAT_URL,
  ]);
});
