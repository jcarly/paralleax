import { chmod, lstat, mkdir, open, readdir, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { OnModuleInit } from '@nestjs/common';

export interface ImportReportMetadata {
  importId: string;
  format: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  size: number;
}

export abstract class ImportReportStorage {
  abstract getBaseDirectory(): string;

  abstract createReportFile(importId: string, format: string): Promise<string>;

  abstract getReportPath(importId: string): Promise<string | undefined>;

  abstract streamReport(importId: string): Promise<Readable | undefined>;

  abstract deleteReport(importId: string): Promise<void>;

  async cleanupExpiredReports(ttlMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const dir = this.getBaseDirectory();
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (caught) {
      if (isMissingPath(caught)) return;
      throw caught;
    }
    const now = Date.now();
    for (const entry of entries) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:choicescript|qsp)\.jsonl$/i.test(
          entry,
        )
      ) {
        continue;
      }
      try {
        const fullPath = join(dir, entry);
        const statResult = await lstat(fullPath);
        if (statResult.isFile() && now - statResult.mtimeMs > ttlMs) {
          await rm(fullPath, { force: true });
        }
      } catch (caught) {
        if (!isMissingPath(caught)) throw caught;
      }
    }
  }
}

export class LocalImportReportStorage extends ImportReportStorage implements OnModuleInit {
  private readonly directory: string;

  constructor(
    directory: string = process.env.PARALLEAX_IMPORT_REPORT_DIR ??
      join(process.cwd(), 'storage', 'imports'),
  ) {
    super();
    this.directory = directory;
  }

  getBaseDirectory(): string {
    return this.directory;
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    await this.cleanupExpiredReports();
  }

  async createReportFile(importId: string, format: string): Promise<string> {
    validateImportId(importId);
    if (format !== 'choicescript' && format !== 'qsp') {
      throw new Error('Unsupported import report format.');
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const fileName = `${importId}.${format}.jsonl`;
    const filePath = join(this.directory, fileName);
    const handle = await open(filePath, 'wx', 0o600);
    await handle.close();
    return filePath;
  }

  async getReportPath(importId: string): Promise<string | undefined> {
    validateImportId(importId);
    const dir = this.getBaseDirectory();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (caught) {
      if (isMissingPath(caught)) return undefined;
      throw caught;
    }
    const match = entries.find(
      (entry) =>
        entry.isFile() &&
        new RegExp(`^${importId}\\.(?:choicescript|qsp)\\.jsonl$`).test(entry.name),
    );
    return match ? join(dir, match.name) : undefined;
  }

  async streamReport(importId: string): Promise<Readable | undefined> {
    const filePath = await this.getReportPath(importId);
    if (!filePath) return undefined;
    return createReadStream(filePath, { encoding: 'utf8' });
  }

  async deleteReport(importId: string): Promise<void> {
    validateImportId(importId);
    const filePath = await this.getReportPath(importId);
    if (!filePath) return;
    try {
      await rm(filePath, { force: true });
    } catch (caught) {
      if (!isMissingPath(caught)) throw caught;
    }
  }
}

export async function copyImportReportFile(
  storage: ImportReportStorage,
  importId: string,
  destination: string,
): Promise<void> {
  const source = await storage.getReportPath(importId);
  if (!source) return;
  await mkdir(destination, { recursive: true });
  await pipeline(
    createReadStream(source),
    createWriteStream(join(destination, `${importId}.jsonl`)),
  );
}

function validateImportId(importId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(importId)) {
    throw new Error('Invalid import id.');
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
