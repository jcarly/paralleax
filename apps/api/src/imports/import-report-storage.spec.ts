import { appendFile, mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { copyImportReportFile, LocalImportReportStorage } from './import-report-storage';

const importId = '4c7a2f98-c28c-4b91-8b84-fb735b38b824';

describe('LocalImportReportStorage', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'paralleax-import-storage-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates, streams, copies, and deletes a report in its private directory', async () => {
    const storage = new LocalImportReportStorage(directory);
    await storage.onModuleInit();

    const reportPath = await storage.createReportFile(importId, 'qsp');
    await appendFile(reportPath, '{"code":"warning"}\n', 'utf8');

    expect(await storage.getReportPath(importId)).toBe(reportPath);
    const stream = await storage.streamReport(importId);
    const rows: Buffer[] = [];
    for await (const row of stream!) rows.push(Buffer.from(row));
    expect(Buffer.concat(rows).toString('utf8')).toBe('{"code":"warning"}\n');

    const copyDirectory = join(directory, 'copy');
    await copyImportReportFile(storage, importId, copyDirectory);
    expect(await readFile(join(copyDirectory, `${importId}.jsonl`), 'utf8')).toBe(
      '{"code":"warning"}\n',
    );

    await storage.deleteReport(importId);
    expect(await storage.getReportPath(importId)).toBeUndefined();
    expect(await storage.streamReport(importId)).toBeUndefined();
    await storage.deleteReport(importId);
  });

  it('rejects invalid identifiers and formats and removes only expired report files', async () => {
    const storage = new LocalImportReportStorage(directory);
    await expect(storage.getReportPath(importId)).resolves.toBeUndefined();
    await expect(storage.createReportFile('../escape', 'qsp')).rejects.toThrow(
      'Invalid import id.',
    );
    await expect(storage.createReportFile(importId, 'unknown')).rejects.toThrow(
      'Unsupported import report format.',
    );

    const reportPath = await storage.createReportFile(importId, 'choicescript');
    const old = new Date(Date.now() - 2_000);
    await utimes(reportPath, old, old);
    await appendFile(join(directory, 'unrelated.txt'), 'keep', 'utf8');

    await storage.cleanupExpiredReports(1_000);

    expect(await storage.getReportPath(importId)).toBeUndefined();
    expect(await storage.getReportPath('9d4d0c5b-71a6-4aa6-b091-da4cdd4ca947')).toBeUndefined();
  });
});
