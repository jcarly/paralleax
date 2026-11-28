import { spawn } from 'node:child_process';
import { BackupError } from './postgres-backup-policy.mjs';

const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;

export function selectedEnvironment(environment, names) {
  return Object.fromEntries(
    names.flatMap((name) => (environment[name] === undefined ? [] : [[name, environment[name]]])),
  );
}

export function databaseCommandEnvironment(environment, databaseUrl) {
  return {
    ...selectedEnvironment(environment, [
      'PATH',
      'HOME',
      'TMPDIR',
      'LANG',
      'LC_ALL',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
      'NODE_EXTRA_CA_CERTS',
    ]),
    BACKUP_DATABASE_URL: databaseUrl,
    NODE_ENV: 'production',
    npm_config_audit: 'false',
    npm_config_update_notifier: 'false',
  };
}

export function ageCommandEnvironment(environment) {
  return selectedEnvironment(environment, ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']);
}

function captureStdout(child, state) {
  if (!state.captureOutput) {
    return;
  }
  child.stdout.on('data', (chunk) => {
    state.outputBytes += chunk.length;
    if (state.outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
      state.outputExceeded = true;
      child.kill('SIGTERM');
      return;
    }
    state.output += chunk.toString('utf8');
  });
}

function finishChild(child, state, { resolve, reject, operation }) {
  let settled = false;
  child.once('error', () => {
    settled = true;
    reject(new BackupError(`${operation} failed`));
  });
  child.once('close', (code, childSignal) => {
    if (settled) {
      return;
    }
    if (code === 0 && childSignal === null && !state.outputExceeded) {
      resolve(state.output);
      return;
    }
    reject(new BackupError(`${operation} failed`));
  });
}

export function runQuietly(command, args, options) {
  return new Promise((resolve, reject) => {
    const { environment, signal, operation, captureOutput = false } = options;
    const state = { captureOutput, output: '', outputBytes: 0, outputExceeded: false };
    let child;
    try {
      child = spawn(command, args, {
        env: environment,
        signal,
        stdio: captureOutput ? ['ignore', 'pipe', 'ignore'] : 'ignore',
        windowsHide: true,
      });
    } catch {
      reject(new BackupError(`${operation} failed`));
      return;
    }
    captureStdout(child, state);
    finishChild(child, state, { resolve, reject, operation });
  });
}
