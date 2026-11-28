import assert from 'node:assert/strict';
import test from 'node:test';
import { backupContainerErrorCode } from './postgres-backup-integration-support.mjs';

test('synthetic backup integration exposes only allowlisted container failure codes', () => {
  assert.equal(
    backupContainerErrorCode('{"event":"backup_verified","bytes":123,"keys":["daily/x"]}'),
    null,
  );
  assert.equal(
    backupContainerErrorCode(
      '{"event":"backup_failed","code":"S3_UPLOAD_FAILED","message":"private detail"}',
    ),
    'S3_UPLOAD_FAILED',
  );
  assert.equal(
    backupContainerErrorCode('{"event":"backup_failed","code":"private detail with credential"}'),
    'INTEGRATION_BACKUP_FAILED',
  );
  assert.equal(
    backupContainerErrorCode('not json\n{"event":"unknown","code":"S3_UPLOAD_FAILED"}'),
    'INTEGRATION_BACKUP_FAILED',
  );
});
