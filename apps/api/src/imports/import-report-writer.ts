import { createWriteStream, type WriteStream } from 'node:fs';
import type { ImportIssue, ImportDiagnostics } from '@paralleax/shared';
import type { ImportReportStorage } from './import-report-storage';

export interface ImportReportWriterOptions {
  importId: string;
  format: string;
  storage: ImportReportStorage;
  maxBufferedWrites?: number;
  flushIntervalMs?: number;
}

export class ImportReportWriter {
  private readonly storage: ImportReportStorage;
  private readonly importId: string;
  private readonly format: string;
  private readonly maxBufferedWrites: number;
  private readonly flushIntervalMs: number;
  private queue: string[] = [];
  private writeStream?: WriteStream;
  private flushTimer?: NodeJS.Timeout;
  private closed = false;

  constructor(options: ImportReportWriterOptions) {
    this.storage = options.storage;
    this.importId = options.importId;
    this.format = options.format;
    this.maxBufferedWrites = options.maxBufferedWrites ?? 128;
    this.flushIntervalMs = options.flushIntervalMs ?? 250;
  }

  async start(): Promise<string> {
    if (this.closed) {
      throw new Error('This report writer is already closed.');
    }
    if (this.writeStream) {
      return this.writeStream.path.toString();
    }
    const reportPath = await this.storage.createReportFile(this.importId, this.format);
    this.writeStream = createWriteStream(reportPath, { flags: 'a', encoding: 'utf8' });
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    return reportPath;
  }

  attachToReport(report: ImportDiagnostics): ImportDiagnostics {
    const capture = {
      onIssue: (issue: ImportIssue) => this.writeIssue(issue),
      maxPreviewIssues: 0,
    };
    const reportCapture = (report as ImportDiagnostics & { __reportWriterCapture?: typeof capture })
      .__reportWriterCapture;
    if (reportCapture) {
      return report;
    }
    (
      report as ImportDiagnostics & { __reportWriterCapture?: typeof capture }
    ).__reportWriterCapture = capture;
    return report;
  }

  writeIssue(issue: ImportIssue): void {
    if (this.closed) return;
    const payload = {
      ...issue,
      file: issue.fileName,
      location: issue.locationName,
    };
    delete payload.fileName;
    delete payload.locationName;
    this.queue.push(`${JSON.stringify(payload)}\n`);
    if (this.queue.length >= this.maxBufferedWrites) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    const stream = this.writeStream;
    if (!stream || this.queue.length === 0) return;
    const queue = this.queue;
    this.queue = [];
    for (const chunk of queue) stream.write(chunk);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
    await new Promise<void>((resolve, reject) => {
      if (!this.writeStream) {
        resolve();
        return;
      }
      this.writeStream.end((error: Error | null | undefined) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.writeStream = undefined;
  }

  async persistSnapshot(report: ImportDiagnostics): Promise<void> {
    await this.start();
    for (const issue of report.issues ?? []) {
      this.writeIssue(issue);
    }
    await this.flush();
    await this.close();
  }
}
