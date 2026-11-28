import { BackupError } from './postgres-backup-policy.mjs';
import { runBackupBatch } from './postgres-backup-batch.mjs';

function logEvent(level, event, values = {}) {
  const output = level === 'error' ? process.stderr : process.stdout;
  output.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...values })}\n`,
  );
}

function registerSignals(controller) {
  const state = { interruptedBy: null };
  const interrupt = (signal) => {
    state.interruptedBy ??= signal;
    controller.abort();
  };
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  return {
    state,
    unregister() {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
  };
}

function codeForError(error) {
  return error instanceof BackupError ? error.code : 'BACKUP_FAILED';
}

function exitCodeForSignal(signal) {
  return signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
}

function reportFailure(error, interruptedBy) {
  logEvent('error', 'backup_failed', {
    code: codeForError(error),
    interrupted: Boolean(interruptedBy),
    ...(error?.monitorUnavailable ? { monitorCode: 'MONITOR_UNAVAILABLE' } : {}),
  });
  process.exitCode = exitCodeForSignal(interruptedBy);
}

function reportSuccess(result) {
  logEvent('info', 'backup_verified', {
    attemptId: result.attemptId,
    keys: result.keys,
    bytes: result.size,
    previousBackup: result.previousBackupFresh ? 'fresh' : 'missing_or_stale',
  });
}

async function main() {
  const controller = new globalThis.AbortController();
  const signals = registerSignals(controller);
  try {
    reportSuccess(await runBackupBatch({ signal: controller.signal }));
  } catch (error) {
    reportFailure(error, signals.state.interruptedBy);
  } finally {
    signals.unregister();
  }
}

await main();
