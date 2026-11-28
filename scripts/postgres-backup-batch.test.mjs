import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BackupError,
  createHeartbeat,
  createPlainArchive,
  createS3Storage,
  dailyObjectKey,
  encryptArchive,
  expiredObjectKeys,
  hasRecentDailyBackup,
  runBackupBatch,
  shouldKeepWeeklyCopy,
  validateConfiguration,
  validatePlainArchive,
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
  const calls = [];
  return {
    objects,
    calls,
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
      objects.set(key, {
        content: await readFile(path),
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
  return {
    storage,
    events,
    heartbeat,
    temporaryRoot,
    run: (overrides = {}) => runBackupBatch({ ...dependencies, ...overrides }),
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
});

test('backup object keys use UTC dates and weekly copies are created on Sunday UTC', () => {
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
});

test('retention selects 14 daily and 8 weekly objects by their UTC date keys', () => {
  const objects = Array.from({ length: 17 }, (_, index) => ({
    key: `daily/2026-11-${String(index + 1).padStart(2, '0')}.dump.age`,
  }));
  assert.equal(expiredObjectKeys(objects, 'daily/', 14).length, 3);
  assert.equal(expiredObjectKeys(objects, 'daily/', 14)[0], 'daily/2026-11-03.dump.age');
  assert.equal(
    expiredObjectKeys(
      Array.from({ length: 10 }, (_, index) => ({
        key: `weekly/2026-${String(index + 1).padStart(2, '0')}-01.dump.age`,
      })),
      'weekly/',
      8,
    ).length,
    2,
  );
  assert.throws(() => expiredObjectKeys([], 'public/', 1), /Unsupported backup retention prefix/);
});

test('nominal batch validates before encryption, verifies both remote objects, then reports success', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.run();

    assert.deepEqual(fixture.events.slice(0, 3), ['archive', 'validate', 'encrypt']);
    assert.deepEqual(result.keys, ['daily/2026-11-29.dump.age', 'weekly/2026-11-29.dump.age']);
    assert.equal(result.verified, true);
    assert.equal(result.previousBackupFresh, true);
    assert.equal(fixture.storage.calls.filter((call) => call.startsWith('get:')).length, 2);
    assert.equal(fixture.events.at(-1), 'heartbeat:success');
    assert.equal(fixture.events.includes('heartbeat:fail'), false);
    assert.equal(fixture.storage.objects.has(result.keys[0]), true);
    assert.equal(fixture.storage.objects.has(result.keys[1]), true);
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
          throw new BackupError('PostgreSQL archive validation failed');
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
          throw new Error('synthetic error contains user data and credentials');
        },
      }),
      (error) =>
        error instanceof BackupError &&
        error.message === 'Backup batch failed' &&
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

test('a failed transfer can be retried on the same dated keys', async () => {
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
    assert.equal(fixture.storage.objects.size, 3);
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

test('retry overwrites the same dated object and succeeds after an integrity mismatch', async () => {
  const fixture = await createFixture({ previousBackup: false });
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

    await assert.rejects(fixture.run({ storage }), /Remote backup integrity check failed/);
    const retry = await fixture.run({ storage });
    assert.deepEqual(retry.keys, ['daily/2026-11-29.dump.age', 'weekly/2026-11-29.dump.age']);
    assert.equal(
      [...fixture.storage.objects.keys()].filter((key) => key === retry.keys[0]).length,
      1,
    );
    assert.equal(retry.verified, true);
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

test('retention runs after all remote objects pass integrity checks', async () => {
  const initialObjects = [];
  for (let day = 1; day <= 16; day += 1) {
    const date = `2026-11-${String(day).padStart(2, '0')}`;
    initialObjects.push([
      `daily/${date}.dump.age`,
      { content: Buffer.from('old synthetic'), lastModified: `${date}T02:00:00.000Z` },
    ]);
  }
  for (let week = 1; week <= 9; week += 1) {
    const date = `2026-09-${String(week * 3).padStart(2, '0')}`;
    initialObjects.push([
      `weekly/${date}.dump.age`,
      { content: Buffer.from('old synthetic'), lastModified: `${date}T02:00:00.000Z` },
    ]);
  }

  const fixture = await createFixture({ initialObjects });
  try {
    await fixture.run();
    const dailyKeys = [...fixture.storage.objects.keys()].filter((key) => key.startsWith('daily/'));
    const weeklyKeys = [...fixture.storage.objects.keys()].filter((key) =>
      key.startsWith('weekly/'),
    );
    assert.equal(dailyKeys.length, 14);
    assert.equal(weeklyKeys.length, 8);
    const lastVerification = Math.max(
      fixture.storage.calls
        .map((call, index) => (call.startsWith('get:') ? index : -1))
        .sort((a, b) => b - a)[0],
    );
    const firstDeletion = fixture.storage.calls.findIndex((call) => call.startsWith('delete:'));
    assert.ok(lastVerification < firstDeletion);
    await fixture.assertTemporaryFilesRemoved();
  } finally {
    await fixture.close();
  }
});

test('database backup invokes npm run db:backup without passing credentials in arguments or S3 environment', async () => {
  const calls = [];
  await createPlainArchive({
    output: '/tmp/synthetic.dump',
    configuration: validateConfiguration(environment),
    environment,
    run: async (...args) => calls.push(args),
  });

  const [command, args, options] = calls[0];
  assert.equal(command, 'npm');
  assert.deepEqual(args.slice(0, 3), ['run', 'db:backup', '--']);
  assert.equal(
    args.some((argument) => argument.includes('synthetic-db-secret')),
    false,
  );
  assert.equal(options.environment.BACKUP_DATABASE_URL, environment.BACKUP_DATABASE_URL);
  assert.equal(options.environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(options.environment.BACKUP_HEARTBEAT_URL, undefined);
});

test('archive validation and age encryption use quiet commands with only the required inputs', async () => {
  const calls = [];
  await validatePlainArchive({
    path: '/tmp/synthetic.dump',
    environment,
    run: async (...args) => calls.push(args),
  });
  await encryptArchive({
    input: '/tmp/synthetic.dump',
    output: '/tmp/synthetic.dump.age',
    recipient: environment.AGE_RECIPIENT,
    environment,
    run: async (...args) => calls.push(args),
  });

  assert.equal(calls[0][0], 'pg_restore');
  assert.deepEqual(calls[0][1], ['--list', '/tmp/synthetic.dump']);
  assert.equal(calls[0][2].environment.BACKUP_DATABASE_URL, undefined);
  assert.equal(calls[0][2].environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(calls[1][0], 'age');
  assert.equal(calls[1][1].includes(environment.AGE_RECIPIENT), true);
  assert.equal(calls[1][2].environment.BACKUP_DATABASE_URL, undefined);
});

test('S3 adapter keeps credentials in its environment, paginates listings, and never puts a secret in argv', async () => {
  const calls = [];
  const storage = createS3Storage(validateConfiguration(environment), {
    environment,
    async invoke(args, options) {
      calls.push({ args, options });
      if (options.captureOutput) {
        if (calls.filter((call) => call.options.captureOutput).length === 1) {
          return JSON.stringify({
            Contents: [
              { Key: 'daily/2026-11-01.dump.age', LastModified: '2026-11-01T00:00:00Z', Size: 3 },
            ],
            IsTruncated: true,
            NextContinuationToken: 'synthetic-next-token',
          });
        }
        return JSON.stringify({
          Contents: [
            { Key: 'daily/2026-11-02.dump.age', LastModified: '2026-11-02T00:00:00Z', Size: 4 },
          ],
          IsTruncated: false,
        });
      }
      return '';
    },
  });

  const listed = await storage.list('daily/');
  await storage.put({
    path: '/tmp/synthetic.dump.age',
    key: 'daily/2026-11-29.dump.age',
    sha256: 'abcd',
  });
  assert.deepEqual(
    listed.map(({ key }) => key),
    ['daily/2026-11-01.dump.age', 'daily/2026-11-02.dump.age'],
  );
  assert.equal(calls[1].args.includes('synthetic-next-token'), true);
  assert.equal(
    calls.every(
      (call) => call.args.join(' ').includes(environment.AWS_SECRET_ACCESS_KEY) === false,
    ),
    true,
  );
  assert.equal(
    calls.at(-1).options.environment.AWS_SECRET_ACCESS_KEY,
    environment.AWS_SECRET_ACCESS_KEY,
  );
  assert.equal(calls.at(-1).options.environment.BACKUP_DATABASE_URL, undefined);
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
