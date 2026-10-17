import { createDemoStory, type QspImportResult, type QspImportSource } from '@paralleax/shared';
import { ImportJobService } from '../../imports/import-job.service';
import type { ImportReportStorage } from '../../imports/import-report-storage';
import type { StoriesRepository } from '../stories.repository';
import type { QspImportWorkerService } from './qsp-import-worker.service';
import type { QspImportProgressService } from './qsp-import-progress.service';
import { StoryImportService } from './story-import';

const result: QspImportResult = {
  story: createDemoStory('paths-only', 'imported-story', '2026-10-17T12:00:00.000Z'),
  report: {
    format: 'qsp',
    sourceFileCount: 1,
    locationCount: 1,
    actionCount: 0,
    interactionCount: 1,
    convertedStatementCount: 1,
    approximatedStatementCount: 0,
    unsupportedStatementCount: 0,
    warningCount: 0,
    errorCount: 0,
    coverage: [],
    issues: [],
  },
};

describe('StoryImportService', () => {
  it('does not persist a QSP result when its job was cancelled while the worker ran', async () => {
    const jobs = new ImportJobService();
    const createJob = jest.spyOn(jobs, 'create');
    const repository = { save: jest.fn() };
    const reportStorage = {
      createReportFile: jest.fn().mockResolvedValue('report.jsonl'),
      deleteReport: jest.fn().mockResolvedValue(undefined),
    };
    const qspWorkers = {
      run: jest.fn(async () => {
        const importId = createJob.mock.results[0]?.value.id;
        expect(importId).toBeDefined();
        jobs.cancel(importId!);
        return result;
      }),
    };
    const qspProgress = { publish: jest.fn(), complete: jest.fn() };
    const service = new StoryImportService(
      repository as unknown as StoriesRepository,
      qspWorkers as unknown as QspImportWorkerService,
      qspProgress as unknown as QspImportProgressService,
      jobs,
      reportStorage as unknown as ImportReportStorage,
    );
    const source: QspImportSource = {
      name: 'start.qsps',
      format: 'text',
      content: "# Start\n'Hello'\n--- Start ---",
    };

    const outcome = await service.createUnlimitedQsp(
      { name: source.name, format: source.format },
      Buffer.from(source.content),
      'user-1',
    );

    expect(outcome).toMatchObject({ status: 'cancelled' });
    expect(repository.save).not.toHaveBeenCalled();
    expect(reportStorage.deleteReport).toHaveBeenCalledWith(createJob.mock.results[0]?.value.id);
  });
});