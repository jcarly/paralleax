import { BackupError } from './postgres-backup-policy.mjs';
import { runQuietly, selectedEnvironment } from './postgres-backup-process.mjs';

const AWS_ERROR_CLASSIFICATIONS = new Map([
  ['AccessDenied', 'ACCESS_DENIED'],
  ['AuthorizationHeaderMalformed', 'REGION_REJECTED'],
  ['BadDigest', 'CHECKSUM_REJECTED'],
  ['EntityTooSmall', 'OBJECT_TOO_SMALL'],
  ['InternalError', 'SERVICE_ERROR'],
  ['InvalidAccessKeyId', 'INVALID_ACCESS_KEY'],
  ['InvalidArgument', 'REQUEST_REJECTED'],
  ['InvalidDigest', 'CHECKSUM_REJECTED'],
  ['InvalidRequest', 'REQUEST_REJECTED'],
  ['NoSuchBucket', 'BUCKET_NOT_FOUND'],
  ['NotImplemented', 'OPERATION_UNSUPPORTED'],
  ['PermanentRedirect', 'REGION_REJECTED'],
  ['RequestTimeout', 'REQUEST_TIMEOUT'],
  ['ServiceUnavailable', 'SERVICE_UNAVAILABLE'],
  ['SignatureDoesNotMatch', 'SIGNATURE_REJECTED'],
  ['SlowDown', 'THROTTLED'],
  ['XAmzContentSHA256Mismatch', 'CHECKSUM_REJECTED'],
]);

export function classifyS3Failure(stderr, fallbackCode) {
  const match = stderr.match(/An error occurred \(([A-Za-z0-9]+)\) when calling the /);
  let classification = match ? AWS_ERROR_CLASSIFICATIONS.get(match[1]) : null;
  if (!classification && match) {
    classification = 'REMOTE_REJECTED';
  } else if (!classification && /Could not connect to the endpoint URL/i.test(stderr)) {
    classification = 'ENDPOINT_UNAVAILABLE';
  } else if (!classification && /Invalid endpoint/i.test(stderr)) {
    classification = 'ENDPOINT_INVALID';
  }
  if (!classification) {
    return fallbackCode;
  }
  const prefix = fallbackCode.endsWith('_FAILED')
    ? fallbackCode.slice(0, -'_FAILED'.length)
    : 'S3_OPERATION';
  return `${prefix}_${classification}`;
}

function awsCommandEnvironment(configuration, environment) {
  return {
    ...selectedEnvironment(environment, [
      'PATH',
      'HOME',
      'TMPDIR',
      'LANG',
      'LC_ALL',
      'HTTPS_PROXY',
      'HTTP_PROXY',
      'NO_PROXY',
      'AWS_CA_BUNDLE',
    ]),
    AWS_ACCESS_KEY_ID: configuration.accessKeyId,
    AWS_SECRET_ACCESS_KEY: configuration.secretAccessKey,
    AWS_DEFAULT_REGION: configuration.region,
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_PAGER: '',
    AWS_CLI_AUTO_PROMPT: 'off',
  };
}

function endpointArguments(configuration) {
  return ['--endpoint-url', configuration.endpoint, '--region', configuration.region];
}

async function invokeAws(args, options) {
  return runQuietly('aws', args, options);
}

async function uploadObject({
  configuration,
  endpoint,
  invoke,
  environment,
  path,
  key,
  sha256,
  signal,
}) {
  await invoke(
    [
      's3',
      'cp',
      path,
      `s3://${configuration.bucket}/${key}`,
      ...endpoint,
      '--only-show-errors',
      '--content-type',
      'application/octet-stream',
      '--metadata',
      `sha256=${sha256}`,
    ],
    {
      environment,
      signal,
      operation: 'S3 upload',
      errorCode: 'S3_UPLOAD_FAILED',
      failureCodeFromStderr: (stderr) => classifyS3Failure(stderr, 'S3_UPLOAD_FAILED'),
    },
  );
}

async function downloadObject({ configuration, endpoint, invoke, environment, key, path, signal }) {
  await invoke(
    [
      's3api',
      'get-object',
      '--bucket',
      configuration.bucket,
      '--key',
      key,
      ...endpoint,
      '--output',
      'json',
      path,
    ],
    {
      environment,
      signal,
      operation: 'S3 verification download',
      errorCode: 'S3_DOWNLOAD_FAILED',
      failureCodeFromStderr: (stderr) => classifyS3Failure(stderr, 'S3_DOWNLOAD_FAILED'),
    },
  );
}

async function readBucketVersioning({ configuration, endpoint, invoke, environment, signal }) {
  const output = await invoke(
    [
      's3api',
      'get-bucket-versioning',
      '--bucket',
      configuration.bucket,
      ...endpoint,
      '--output',
      'json',
    ],
    {
      environment,
      signal,
      operation: 'S3 bucket versioning check',
      errorCode: 'S3_VERSIONING_CHECK_FAILED',
      captureOutput: true,
      failureCodeFromStderr: (stderr) => classifyS3Failure(stderr, 'S3_VERSIONING_CHECK_FAILED'),
    },
  );
  try {
    return JSON.parse(output).Status ?? null;
  } catch {
    throw new BackupError('S3 bucket versioning check failed', 'S3_VERSIONING_CHECK_FAILED');
  }
}

async function listPage({ configuration, endpoint, invoke, environment, prefix, token, signal }) {
  const args = [
    's3api',
    'list-objects-v2',
    '--bucket',
    configuration.bucket,
    '--prefix',
    prefix,
    ...endpoint,
    '--max-keys',
    '1000',
    '--no-paginate',
    '--output',
    'json',
  ];
  if (token) {
    args.push('--continuation-token', token);
  }

  const output = await invoke(args, {
    environment,
    signal,
    operation: 'S3 listing',
    errorCode: 'S3_LIST_FAILED',
    captureOutput: true,
    failureCodeFromStderr: (stderr) => classifyS3Failure(stderr, 'S3_LIST_FAILED'),
  });
  try {
    return JSON.parse(output);
  } catch {
    throw new BackupError('S3 listing failed', 'S3_LIST_FAILED');
  }
}

function appendObjects(objects, page) {
  if (!Array.isArray(page.Contents)) {
    return;
  }
  objects.push(
    ...page.Contents.map(({ Key, LastModified, Size }) => ({
      key: Key,
      lastModified: LastModified,
      size: Size,
    })),
  );
}

async function listObjects({ configuration, endpoint, invoke, environment, prefix, signal }) {
  const objects = [];
  let token;
  while (true) {
    const page = await listPage({
      configuration,
      endpoint,
      invoke,
      environment,
      prefix,
      token,
      signal,
    });
    appendObjects(objects, page);
    if (!page.IsTruncated) {
      return objects;
    }
    token = page.NextContinuationToken;
    if (!token) {
      throw new BackupError('S3 listing failed', 'S3_LIST_FAILED');
    }
  }
}

export function createS3Storage(
  configuration,
  { environment = process.env, invoke = invokeAws } = {},
) {
  const awsEnvironment = awsCommandEnvironment(configuration, environment);
  const endpoint = endpointArguments(configuration);
  const context = { configuration, endpoint, invoke, environment: awsEnvironment };

  return {
    put: (request) => uploadObject({ ...context, ...request }),
    get: (request) => downloadObject({ ...context, ...request }),
    getBucketVersioning: ({ signal } = {}) => readBucketVersioning({ ...context, signal }),
    list: (prefix, { signal } = {}) => listObjects({ ...context, prefix, signal }),
  };
}
