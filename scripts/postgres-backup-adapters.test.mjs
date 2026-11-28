import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlainArchive,
  createS3Storage,
  encryptArchive,
  validateConfiguration,
  validatePlainArchive,
} from './postgres-backup-batch.mjs';

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

function createS3InvokeStub(calls) {
  let listingPage = 0;
  return async (args, options) => {
    calls.push({ args, options });
    if (!options.captureOutput) {
      return '';
    }
    if (args.includes('get-bucket-versioning')) {
      return JSON.stringify({ Status: 'Enabled' });
    }
    listingPage += 1;
    if (listingPage === 1) {
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
  };
}

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

test('S3 adapter checks versioning, paginates listings, and keeps secrets out of argv', async () => {
  const calls = [];
  const storage = createS3Storage(validateConfiguration(environment), {
    environment,
    invoke: createS3InvokeStub(calls),
  });

  assert.equal(storage.delete, undefined);
  const listed = await storage.list('daily/');
  assert.equal(await storage.getBucketVersioning(), 'Enabled');
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
