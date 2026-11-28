import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as wait } from 'node:timers/promises';
import { BackupError } from './postgres-backup-policy.mjs';

const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;
const GROUP_POLL_INTERVAL_MS = 25;
export const MAX_BACKUP_DURATION_MS = 4 * 60 * 60 * 1000;
export const PROCESS_KILL_GRACE_MS = 5000;

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

function processStatHasLiveGroup(entry, processGroupId) {
  try {
    const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
    const fields = stat
      .slice(stat.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/);
    return Number(fields[2]) === processGroupId && fields[0] !== 'Z' && fields[0] !== 'X';
  } catch {
    return false;
  }
}

function linuxGroupHasLiveProcess(processGroupId) {
  try {
    return readdirSync('/proc').some(
      (entry) => /^\d+$/.test(entry) && processStatHasLiveGroup(entry, processGroupId),
    );
  } catch {
    return null;
  }
}

export function isProcessGroupRunning(processGroupId) {
  if (!processGroupId) {
    return false;
  }
  const linuxResult =
    process.platform === 'linux' ? linuxGroupHasLiveProcess(processGroupId) : null;
  if (linuxResult !== null) {
    return linuxResult;
  }
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function sendProcessGroupSignal(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw new BackupError('Could not stop backup process group', 'PROCESS_TREE_STOP_FAILED');
    }
  }
}

async function waitForGroupExit(processGroupId, killGraceMs) {
  const deadline = Date.now() + killGraceMs;
  while (isProcessGroupRunning(processGroupId) && Date.now() < deadline) {
    await wait(GROUP_POLL_INTERVAL_MS);
  }
  while (isProcessGroupRunning(processGroupId)) {
    try {
      sendProcessGroupSignal(processGroupId, 'SIGKILL');
      await wait(GROUP_POLL_INTERVAL_MS);
    } catch {
      await wait(1000);
    }
  }
}

function abortError(signal, operation) {
  const reason = signal?.reason;
  if (reason instanceof BackupError) {
    return reason;
  }
  const code = reason?.name === 'TimeoutError' ? 'BACKUP_TIMEOUT' : 'BACKUP_INTERRUPTED';
  return new BackupError(`${operation} interrupted`, code);
}

function createProcessState(options, resolve, reject) {
  return {
    operation: options.operation,
    errorCode: options.errorCode ?? 'PROCESS_FAILED',
    captureOutput: options.captureOutput ?? false,
    output: '',
    outputBytes: 0,
    failure: null,
    stopPromise: null,
    resolve,
    reject,
    signal: options.signal,
    timeout: null,
    abortHandler: null,
    killGraceMs: options.killGraceMs ?? PROCESS_KILL_GRACE_MS,
    timeoutMs: options.timeoutMs ?? MAX_BACKUP_DURATION_MS,
    settled: false,
  };
}

function completeProcessState(state, error, output = '') {
  if (state.settled) {
    return;
  }
  state.settled = true;
  clearTimeout(state.timeout);
  state.signal?.removeEventListener('abort', state.abortHandler);
  if (error) {
    state.reject(error);
  } else {
    state.resolve(output);
  }
}

function requestProcessGroupStop(child, state, failure) {
  state.failure ??= failure;
  if (state.stopPromise) {
    return;
  }
  try {
    sendProcessGroupSignal(child.pid, 'SIGTERM');
  } catch (error) {
    state.failure = error;
    state.stopPromise = waitForGroupExit(child.pid, 0);
    return;
  }
  state.stopPromise = waitForGroupExit(child.pid, state.killGraceMs);
}

function captureStdout(child, state) {
  if (!state.captureOutput) {
    return;
  }
  child.stdout.on('data', (chunk) => {
    state.outputBytes += chunk.length;
    if (state.outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
      requestProcessGroupStop(
        child,
        state,
        new BackupError('Command output exceeded the safe limit', 'OUTPUT_LIMIT'),
      );
      return;
    }
    state.output += chunk.toString('utf8');
  });
}

function completeFromExit(state, code, childSignal) {
  if (state.failure) {
    completeProcessState(state, state.failure);
  } else if (code === 0 && childSignal === null) {
    completeProcessState(state, null, state.output);
  } else {
    completeProcessState(state, new BackupError(`${state.operation} failed`, state.errorCode));
  }
}

async function handleChildClose(child, state, code, childSignal) {
  if (!state.failure && isProcessGroupRunning(child.pid)) {
    requestProcessGroupStop(
      child,
      state,
      new BackupError(`${state.operation} left child processes running`, 'PROCESS_TREE_LEAK'),
    );
  }
  if (state.stopPromise) {
    await state.stopPromise;
  }
  completeFromExit(state, code, childSignal);
}

function superviseChild(child, state) {
  captureStdout(child, state);
  child.once('error', () =>
    completeProcessState(
      state,
      new BackupError(`${state.operation} failed`, 'PROCESS_START_FAILED'),
    ),
  );
  child.once('close', (code, childSignal) => {
    void handleChildClose(child, state, code, childSignal);
  });
  state.abortHandler = () =>
    requestProcessGroupStop(child, state, abortError(state.signal, state.operation));
  state.signal?.addEventListener('abort', state.abortHandler, { once: true });
  state.timeout = setTimeout(
    () =>
      requestProcessGroupStop(
        child,
        state,
        new BackupError(`${state.operation} exceeded its maximum duration`, 'PROCESS_TIMEOUT'),
      ),
    state.timeoutMs,
  );
}

function spawnCommand(command, args, options) {
  try {
    return spawn(command, args, {
      env: options.environment,
      detached: true,
      stdio: options.captureOutput ? ['ignore', 'pipe', 'ignore'] : 'ignore',
      windowsHide: true,
    });
  } catch {
    throw new BackupError(`${options.operation} failed`, 'PROCESS_START_FAILED');
  }
}

export function runQuietly(command, args, options) {
  if (process.platform === 'win32') {
    return Promise.reject(
      new BackupError('Backup process groups require a POSIX runtime', 'PROCESS_TREE_UNSUPPORTED'),
    );
  }
  if (options.signal?.aborted) {
    return Promise.reject(abortError(options.signal, options.operation));
  }
  return new Promise((resolve, reject) => {
    const state = createProcessState(options, resolve, reject);
    let child;
    try {
      child = spawnCommand(command, args, options);
    } catch (error) {
      reject(error);
      return;
    }
    superviseChild(child, state);
  });
}
