import assert from 'node:assert/strict';
import test from 'node:test';
import { createHeartbeat } from './postgres-backup-batch.mjs';

const monitorUrl = 'https://monitor.example.test/opaque-private-token';

test('external monitor outages return a safe structured error without revealing the URL', async () => {
  const heartbeat = createHeartbeat(monitorUrl, {
    async fetchRequest() {
      return { ok: false };
    },
  });

  await assert.rejects(
    heartbeat.success(),
    (error) =>
      error.code === 'MONITOR_UNAVAILABLE' &&
      !error.message.includes('opaque-private-token') &&
      !error.message.includes(monitorUrl),
  );
});
