import { closeSync, openSync, writeSync } from 'node:fs';
import type { ImportIssue, ImportDiagnostics } from '@paralleax/shared';
import type { ImportReportStorage } from './import-report-storage';

export interface ImportReportWriterOptions {
  importId?: string;
  format?: string;
  storage?: ImportReportStorage;
  reportPath?: string;
}

export class ImportReportWriter {
  private readonly storage?: ImportReportStorage;
  private readonly importId?: string;
  private readonly format?: string;
  private readonly reportPath?: string;
  private fileDescriptor?: number;
  private activePath?: string;
  private closed = false;
  private failure?: Error;

  constructor(options: ImportReportWriterOptions) {
    this.storage = options.storage;
    this.importId = options.importId;
    this.format = options.format;
    this.reportPath = options.reportPath;
    if (!this.reportPath && (!this.storage || !this.importId || !this.format)) {
      throw new Error('A report path or storage, import id, and format are required.');
    }
  }

  async start(): Promise<string> {
    if (this.closed) throw new Error('This report writer is already closed.');
    if (this.fileDescriptor !== undefined) return this.activePath!;
    const path =
      this.reportPath ?? (await this.storage!.createReportFile(this.importId!, this.format!));
    this.fileDescriptor = openSync(path, 'a', 0o600);
    this.activePath = path;
    return path;
  }

  writeIssue(issue: ImportIssue): void {
    if (this.closed || this.fileDescriptor === undefined) {
      throw new Error('The report writer must be started before writing diagnostics.');
    }
    if (this.failure) throw this.failure;

    const payload: Record<string, unknown> = { ...issue };
    if (issue.fileName !== undefined) payload.file = issue.fileName;
    if (issue.locationName !== undefined) payload.location = issue.locationName;
    delete payload.fileName;
    delete payload.locationName;

    try {
      const line = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
      let offset = 0;
      while (offset < line.length) {
        const written = writeSync(this.fileDescriptor, line, offset, line.length - offset);
        if (written === 0) throw new Error('The import report write made no progress.');
        offset += written;
      }
    } catch (caught) {
      this.failure = caught instanceof Error ? caught : new Error(String(caught));
      throw this.failure;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      if (this.failure) throw this.failure;
      return;
    }
    this.closed = true;
    if (this.fileDescriptor !== undefined) {
      try {
        closeSync(this.fileDescriptor);
      } catch (caught) {
        this.failure ??= caught instanceof Error ? caught : new Error(String(caught));
      }
      this.fileDescriptor = undefined;
    }
    if (this.failure) throw this.failure;
  }

  async persistSnapshot(report: ImportDiagnostics): Promise<void> {
    await this.start();
    try {
      for (const issue of report.issues) this.writeIssue(issue);
    } finally {
      await this.close();
    }
  }
}
