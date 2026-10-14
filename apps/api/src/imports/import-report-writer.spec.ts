import { beforeEach, describe, expect, it } from '@jest/globals';
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
    const writer = new ImportReportWriter({ importId: 'reported-import', format: 'qsp', storage });
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

    const filePath = await storage.getReportPath('reported-import');
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
    await rm(tempDir, { recursive: true, force: true });
  });
});
