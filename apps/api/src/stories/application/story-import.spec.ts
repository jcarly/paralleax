import {
  createDemoStory,
  type ChoiceScriptImportResult,
  type QspImportResult,
  type QspImportSource,
} from '@paralleax/shared';
import { Test } from '@nestjs/testing';
import { ImportJobService } from '../../imports/import-job.service';
import { StoriesRepository } from '../stories.repository';
import { ChoiceScriptImportWorkerService } from './choicescript-import-worker.service';
import { QspImportWorkerService } from './qsp-import-worker.service';
import { QspImportProgressService } from './qsp-import-progress.service';
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
const choiceScriptResult: ChoiceScriptImportResult = {
  story: result.story,
  report: {
    format: 'choicescript',
    sourceFileCount: 1,
    sceneCount: 1,
    interactionCount: 1,
    convertedCommandCount: 1,
    approximatedCommandCount: 0,
    ignoredCommandCount: 0,
    warningCount: 0,
    errorCount: 0,
    issues: [],
  },
};

async function createService(
  repository: object,
  qspWorkers: object,
  choiceScriptWorkers: object,
  context: { qspProgress: object; jobs: ImportJobService },
) {
  const module = await Test.createTestingModule({
    providers: [
      StoryImportService,
      { provide: StoriesRepository, useValue: repository },
      { provide: QspImportWorkerService, useValue: qspWorkers },
      { provide: ChoiceScriptImportWorkerService, useValue: choiceScriptWorkers },
      { provide: QspImportProgressService, useValue: context.qspProgress },
      { provide: ImportJobService, useValue: context.jobs },
    ],
  }).compile();
  return module.get(StoryImportService);
}

describe('StoryImportService', () => {
  it('does not persist a QSP result when its job was cancelled while the worker ran', async () => {
    const jobs = new ImportJobService();
    const createJob = jest.spyOn(jobs, 'create');
    const repository = { save: jest.fn() };
    const qspWorkers = {
      run: jest.fn(async () => {
        const importId = createJob.mock.results[0]?.value.id;
        expect(importId).toBeDefined();
        jobs.cancel(importId);
        return result;
      }),
    };
    const choiceScriptWorkers = { run: jest.fn() };
    const qspProgress = { publish: jest.fn(), complete: jest.fn() };
    const service = await createService(repository, qspWorkers, choiceScriptWorkers, {
      qspProgress,
      jobs,
    });
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
  });

  it('does not persist a ChoiceScript result when its job was cancelled while the worker ran', async () => {
    const jobs = new ImportJobService();
    const createJob = jest.spyOn(jobs, 'create');
    const repository = { save: jest.fn() };
    const choiceScriptWorkers = {
      run: jest.fn(async () => {
        const importId = createJob.mock.results[0]?.value.id;
        expect(importId).toBeDefined();
        jobs.cancel(importId);
        return choiceScriptResult;
      }),
    };
    const service = await createService(repository, { run: jest.fn() }, choiceScriptWorkers, {
      qspProgress: { publish: jest.fn(), complete: jest.fn() },
      jobs,
    });

    const outcome = await service.createChoiceScript(
      { files: [{ name: 'startup.txt', content: '*finish' }], confirmWarnings: false },
      'user-1',
    );

    expect(outcome).toMatchObject({ status: 'cancelled' });
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('returns the diagnostic preview on warning confirmation and persistence failure', async () => {
    const issues = Array.from({ length: 50 }, (_, index) => ({
      severity: 'warning' as const,
      code: 'unsupported',
      message: `Issue ${index}`,
    }));
    const report = { ...choiceScriptResult.report, warningCount: 5000, issues };
    const repository = { save: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const service = await createService(
      repository,
      { run: jest.fn() },
      {
        run: jest.fn().mockResolvedValue({ ...choiceScriptResult, report }),
      },
      { qspProgress: { publish: jest.fn(), complete: jest.fn() }, jobs: new ImportJobService() },
    );
    const input = { files: [{ name: 'startup.txt', content: '*finish' }], confirmWarnings: false };
    const preview = await service.createChoiceScript(input, 'user-1');
    expect(preview).toMatchObject({ status: 'confirmation_required', report: { issues } });
    expect(repository.save).not.toHaveBeenCalled();
    await expect(service.createChoiceScript(input, 'user-1', true)).rejects.toMatchObject({
      response: { code: 'STORY_IMPORT_SAVE_FAILED', details: { report: { issues } } },
    });
  });

  it('returns complete blocking diagnostics without saving', async () => {
    const issue = { severity: 'error' as const, code: 'missing', message: 'Missing target' };
    const repository = { save: jest.fn() };
    const service = await createService(
      repository,
      { run: jest.fn() },
      {
        run: jest.fn().mockResolvedValue({
          report: { ...choiceScriptResult.report, errorCount: 1, issues: [issue] },
        }),
      },
      { qspProgress: { publish: jest.fn(), complete: jest.fn() }, jobs: new ImportJobService() },
    );
    await expect(
      service.createChoiceScript(
        { files: [{ name: 'startup.txt', content: '*finish' }], confirmWarnings: false },
        'user-1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'STORY_IMPORT_FAILED', details: { report: { issues: [issue] } } },
    });
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('closes the QSP progress stream when the worker fails and allows a retry', async () => {
    const progress = { publish: jest.fn(), complete: jest.fn() };
    const repository = { save: jest.fn().mockResolvedValue(undefined) };
    const workers = {
      run: jest
        .fn()
        .mockRejectedValueOnce(new Error('worker failed'))
        .mockResolvedValueOnce(result),
    };
    const service = await createService(
      repository,
      workers,
      { run: jest.fn() },
      { qspProgress: progress, jobs: new ImportJobService() },
    );
    const source = { name: 'start.qsps', format: 'text' as const };
    await expect(
      service.createUnlimitedQsp(source, Buffer.from('# Start'), 'user-1', false, 'progress'),
    ).rejects.toMatchObject({ response: { code: 'STORY_IMPORT_EXECUTION_FAILED' } });
    expect(progress.complete).toHaveBeenCalledWith('user-1', 'progress');
    expect(repository.save).not.toHaveBeenCalled();
    await expect(
      service.createUnlimitedQsp(source, Buffer.from('# Start'), 'user-1', false, 'retry'),
    ).resolves.toMatchObject({ status: 'imported' });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
