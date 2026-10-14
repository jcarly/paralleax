import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImportJobService } from './import-job.service';
import { LocalImportReportStorage } from './import-report-storage';
import { ImportReportWriter } from './import-report-writer';

describe('import report writer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'paralleax-import-report-'));
  });

  it('writes every issue to a JSONL report and retains the file path', async () => {
    const storage = new LocalImportReportStorage(tempDir);
    const importId = randomUUID();
    const writer = new ImportReportWriter({ importId, format: 'qsp', storage });
    await writer.start();
    writer.writeIssue({
      severity: 'warning',
      code: 'compatibility_warning',
      message: 'A static GOTO could not be resolved.',
      fileName: 'start.qsp',
      locationName: 'Start',
      line: 7,
    });
    writer.writeIssue({
      severity: 'error',
      code: 'unresolved_location',
      message: 'The source could not be parsed.',
      fileName: 'start.qsp',
      line: 12,
    });
    await writer.close();

    const filePath = await storage.getReportPath(importId);
    expect(filePath).toBeDefined();
    const content = await readFile(filePath!, 'utf8');
    const rows = content.trim().split('\n').filter(Boolean);
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[0])).toMatchObject({
      severity: 'warning',
      code: 'compatibility_warning',
      file: 'start.qsp',
      location: 'Start',
      line: 7,
    });
    expect(JSON.parse(rows[1])).toMatchObject({
      severity: 'error',
      code: 'unresolved_location',
      file: 'start.qsp',
      line: 12,
    });
  });

  it('writes a large diagnostic sequence in stable order', async () => {
    const storage = new LocalImportReportStorage(tempDir);
    const importId = randomUUID();
    const writer = new ImportReportWriter({ importId, format: 'choicescript', storage });
    await writer.start();

    for (let index = 0; index < 10_000; index += 1) {
      writer.writeIssue({
        severity: 'warning',
        code: `warning_${index}`,
        message: `Issue ${index}`,
      });
    }
    await writer.close();

    const filePath = await storage.getReportPath(importId);
    const rows = (await readFile(filePath!, 'utf8')).trim().split('\n');
    expect(rows).toHaveLength(10_000);
    expect(JSON.parse(rows[0])).toMatchObject({ code: 'warning_0' });
    expect(JSON.parse(rows[9_999])).toMatchObject({ code: 'warning_9999' });
  });

  it('supports an explicit report path and closes idempotently', async () => {
    const reportPath = join(tempDir, 'explicit.jsonl');
    const writer = new ImportReportWriter({ reportPath });

    await expect(writer.start()).resolves.toBe(reportPath);
    await expect(writer.start()).resolves.toBe(reportPath);
    writer.writeIssue({
      severity: 'warning',
      code: 'explicit_path',
      message: 'Stored through an explicit path.',
    });
    await expect(writer.close()).resolves.toBeUndefined();
    await expect(writer.close()).resolves.toBeUndefined();
    await expect(writer.start()).rejects.toThrow('already closed');

    expect(await readFile(reportPath, 'utf8')).toContain('explicit_path');
  });

  it('validates its lifecycle and persists an entire diagnostic snapshot', async () => {
    const reportPath = join(tempDir, 'snapshot.jsonl');
    const writer = new ImportReportWriter({ reportPath });

    expect(() =>
      writer.writeIssue({ severity: 'error', code: 'before_start', message: 'Not yet started.' }),
    ).toThrow('must be started');

    await writer.persistSnapshot({
      warningCount: 1,
      errorCount: 1,
      issues: [
        { severity: 'warning', code: 'first', message: 'First issue.' },
        { severity: 'error', code: 'second', message: 'Second issue.' },
      ],
    });

    expect((await readFile(reportPath, 'utf8')).trim().split('\n')).toHaveLength(2);
    expect(() =>
      writer.writeIssue({ severity: 'error', code: 'after_close', message: 'Already closed.' }),
    ).toThrow('must be started');
  });

  it('requires either an explicit path or complete storage metadata', () => {
    expect(() => new ImportReportWriter({})).toThrow('report path or storage');
  });

  it('rejects report identifiers that could escape the storage directory', async () => {
    const storage = new LocalImportReportStorage(tempDir);
    await expect(storage.createReportFile('../outside', 'qsp')).rejects.toThrow(
      'Invalid import id.',
    );
  });

  it('tracks import jobs and emits progress state to their owner stream', async () => {
    const service = new ImportJobService();
    const job = service.create('owner-1', 'qsp');
    const events: Array<{ data?: { status?: string } }> = [];
    const subscription = service.stream('owner-1', job.id).subscribe((event) => {
      events.push(event as { data?: { status?: string } });
    });

    service.update(job.id, {
      status: 'running',
      phase: 'parsing',
      progress: 38,
      currentFile: 'room.qsrc',
    });
    service.setStatus(job.id, 'awaiting_confirmation');

    expect(job.status).toBe('queued');
    expect(service.get(job.id)).toMatchObject({
      status: 'awaiting_confirmation',
      phase: 'parsing',
      progress: 38,
      currentFile: 'room.qsrc',
    });
    expect(events.some((event) => event.data?.status === 'awaiting_confirmation')).toBe(true);

    subscription.unsubscribe();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });
});
