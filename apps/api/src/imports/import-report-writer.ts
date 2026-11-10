import { closeSync, openSync, writeSync } from 'node:fs';
import type { ImportIssue, ImportDiagnostics } from '@paralleax/shared';
import type { ImportReportStorage } from './import-report-storage';

export interface ImportReportWriterOptions {
  importId?: string;
  format?: string;
  storage?: ImportReportStorage;
  reportPath?: string;
}

type ImportReportTarget =
  | { kind: 'path'; path: string }
  | { kind: 'storage'; storage: ImportReportStorage; importId: string; format: string };

interface ActiveReportFile {
  descriptor: number;
  path: string;
}

export class ImportReportWriter {
  private readonly target: ImportReportTarget;
  private activeFile?: ActiveReportFile;
  private closed = false;
  private failure?: Error;

  constructor(options: ImportReportWriterOptions) {
    if (options.reportPath !== undefined) {
      if (!options.reportPath && (!options.storage || !options.importId || !options.format)) {
        throw new Error('A report path or storage, import id, and format are required.');
      }
      this.target = { kind: 'path', path: options.reportPath };
      return;
    }
    if (!options.storage || !options.importId || !options.format) {
      throw new Error('A report path or storage, import id, and format are required.');
    }
    this.target = {
      kind: 'storage',
      storage: options.storage,
      importId: options.importId,
      format: options.format,
    };
  }

  async start(): Promise<string> {
    if (this.closed) {
      throw new Error('This report writer is already closed.');
    }
    if (this.activeFile !== undefined) {
      return this.activeFile.path;
    }
    const path =
      this.target.kind === 'path'
        ? this.target.path
        : await this.target.storage.createReportFile(this.target.importId, this.target.format);
    this.activeFile = { path, descriptor: openSync(path, 'a', 0o600) };
    return path;
  }

  writeIssue(issue: ImportIssue): void {
    const activeFile = this.activeFile;
    if (this.closed || activeFile === undefined) {
      throw new Error('The report writer must be started before writing diagnostics.');
    }
    if (this.failure) {
      throw this.failure;
    }

    const payload: Record<string, unknown> = { ...issue };
    if (issue.fileName !== undefined) {
      payload.file = issue.fileName;
    }
    if (issue.locationName !== undefined) {
      payload.location = issue.locationName;
    }
    delete payload.fileName;
    delete payload.locationName;

    try {
      const line = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
      let offset = 0;
      while (offset < line.length) {
        const written = writeSync(activeFile.descriptor, line, offset, line.length - offset);
        if (written === 0) {
          throw new Error('The import report write made no progress.');
        }
        offset += written;
      }
    } catch (caught) {
      this.failure = caught instanceof Error ? caught : new Error(String(caught));
      throw this.failure;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      if (this.failure) {
        throw this.failure;
      }
      return;
    }
    this.closed = true;
    const activeFile = this.activeFile;
    if (activeFile !== undefined) {
      try {
        closeSync(activeFile.descriptor);
      } catch (caught) {
        this.failure ??= caught instanceof Error ? caught : new Error(String(caught));
      }
      this.activeFile = undefined;
    }
    if (this.failure) {
      throw this.failure;
    }
  }

  async persistSnapshot(report: ImportDiagnostics): Promise<void> {
    await this.start();
    try {
      for (const issue of report.issues) {
        this.writeIssue(issue);
      }
    } finally {
      await this.close();
    }
  }
}
