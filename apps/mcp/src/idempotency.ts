import { createHash } from 'node:crypto';

export class IdempotencyKeyReusedError extends Error {
  override readonly name = 'IdempotencyKeyReusedError';
}

interface Entry<T> {
  fingerprint: string;
  expiresAt: number;
  result: Promise<T>;
}

export interface IdempotencyCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
  /**
   * Failures that may have left a durable change (a partially applied or
   * unconfirmed write). They stay cached and are replayed instead of retried.
   */
  keepsFailure?: (error: unknown) => boolean;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Process-local replay protection for write tools. A repeated call with the
 * same key and the same input returns the first result instead of writing
 * again; the same key with a different input is refused. Failures are
 * forgotten so that they can be retried, except those `keepsFailure` marks as
 * possibly applied, which are replayed. Entries live in memory only.
 */
export class IdempotencyCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly keepsFailure: (error: unknown) => boolean;

  constructor(options: IdempotencyCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? Date.now;
    this.keepsFailure = options.keepsFailure ?? (() => false);
  }

  async run(
    scope: string,
    key: string | undefined,
    input: unknown,
    operation: () => Promise<T>,
  ): Promise<{ result: T; replayed: boolean }> {
    if (key === undefined) {
      return { result: await operation(), replayed: false };
    }
    this.evictExpired();
    const cacheKey = `${scope}:${key}`;
    const fingerprint = createHash('sha256').update(stableJson(input)).digest('hex');
    const existing = this.entries.get(cacheKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new IdempotencyKeyReusedError(
          'This idempotencyKey was already used with different arguments',
        );
      }
      return { result: await existing.result, replayed: true };
    }
    const result = operation();
    this.remember(cacheKey, { fingerprint, expiresAt: this.now() + this.ttlMs, result });
    try {
      return { result: await result, replayed: false };
    } catch (error) {
      if (!this.keepsFailure(error)) {
        this.entries.delete(cacheKey);
      }
      throw error;
    }
  }

  private remember(cacheKey: string, entry: Entry<T>): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(cacheKey, entry);
  }

  private evictExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
