import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

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
    } catch {
      return;
    }
    const now = Date.now();
    for (const entry of entries) {
      try {
        const fullPath = join(dir, entry);
        const statResult = await stat(fullPath);
        if (statResult.isFile() && now - statResult.mtimeMs > ttlMs) {
          await rm(fullPath, { force: true });
        }
      } catch {
        // Ignore stale files or races while cleaning up.
      }
    }
  }
}

export class LocalImportReportStorage extends ImportReportStorage {
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

  async createReportFile(importId: string, format: string): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const fileName = `${importId}.${format}.jsonl`;
    const filePath = join(this.directory, fileName);
    return filePath;
  }

  async getReportPath(importId: string): Promise<string | undefined> {
    const dir = this.getBaseDirectory();
    try {
      const entries = await readdir(dir);
      const match = entries.find(
        (entry) => entry.startsWith(`${importId}.`) && entry.endsWith('.jsonl'),
      );
      if (!match) return undefined;
      return join(dir, match);
    } catch {
      return undefined;
    }
  }

  async streamReport(importId: string): Promise<Readable | undefined> {
    const filePath = await this.getReportPath(importId);
    if (!filePath) return undefined;
    return createReadStream(filePath, { encoding: 'utf8' });
  }

  async deleteReport(importId: string): Promise<void> {
    const filePath = await this.getReportPath(importId);
    if (!filePath) return;
    await rm(filePath, { force: true });
  }
}

export async function readImportReportFile(
  storage: ImportReportStorage,
  importId: string,
): Promise<string | undefined> {
  const filePath = await storage.getReportPath(importId);
  if (!filePath) return undefined;
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return undefined;
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
