import { ForbiddenException, NotFoundException, StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import { of } from 'rxjs';
import type { RequestUser } from '../auth/auth.decorators';
import type { ImportJobSnapshot } from './import-job.service';
import { ImportController } from './import.controller';
import { ImportJobService } from './import-job.service';
import { ImportReportStorage } from './import-report-storage';

const importId = 'e8896cd2-ddaa-4c81-9432-cbc4ba278db7';
const owner: RequestUser = {
  id: 'owner-1',
  email: 'owner@example.test',
  displayName: 'Owner',
  role: 'user',
  createdAt: '2026-10-14T10:00:00.000Z',
};
const administrator: RequestUser = { ...owner, id: 'admin-1', role: 'admin' };
const otherUser: RequestUser = { ...owner, id: 'other-1' };

function job(overrides: Partial<ImportJobSnapshot> = {}): ImportJobSnapshot {
  return {
    id: importId,
    ownerId: owner.id,
    format: 'qsp',
    status: 'running',
    phase: 'parsing',
    progress: 25,
    warningCount: 0,
    errorCount: 0,
    reportAvailable: false,
    createdAt: '2026-10-14T10:00:00.000Z',
    updatedAt: '2026-10-14T10:00:00.000Z',
    ...overrides,
  };
}

describe('ImportController', () => {
  const jobs = {
    get: jest.fn(),
    stream: jest.fn(),
    cancel: jest.fn(),
  };
  const reportStorage = {
    streamReport: jest.fn(),
    deleteReport: jest.fn(),
  };
  const controller = new ImportController(
    jobs as unknown as ImportJobService,
    reportStorage as unknown as ImportReportStorage,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jobs.stream.mockReturnValue(of({ type: 'state', data: job() }));
    reportStorage.deleteReport.mockResolvedValue(undefined);
  });

  it('returns a job to its owner or an administrator and rejects other users', () => {
    jobs.get.mockReturnValue(job());

    expect(controller.getJob(importId, owner)).toMatchObject({ id: importId });
    expect(controller.getJob(importId, administrator)).toMatchObject({ id: importId });
    expect(() => controller.getJob(importId, otherUser)).toThrow(ForbiddenException);

    jobs.get.mockReturnValue(undefined);
    expect(() => controller.getJob(importId, owner)).toThrow(NotFoundException);
  });

  it('streams only an authorized job and makes missing streams indistinguishable from forbidden ones', () => {
    jobs.get.mockReturnValue(job());
    expect(controller.streamEvents(importId, owner)).toBe(jobs.stream.mock.results[0]?.value);
    expect(jobs.stream).toHaveBeenCalledWith(owner.id, importId);
    expect(() => controller.streamEvents(importId, otherUser)).toThrow(ForbiddenException);

    jobs.get.mockReturnValue(undefined);
    expect(() => controller.streamEvents(importId, owner)).toThrow(ForbiddenException);
  });

  it('downloads an available report only for an authorized reader', async () => {
    jobs.get.mockReturnValue(job({ reportAvailable: true }));
    reportStorage.streamReport.mockResolvedValue(Readable.from(['{"code":"warning"}\n']));

    const response = await controller.getReport(importId, owner);

    expect(response).toBeInstanceOf(StreamableFile);
    expect(reportStorage.streamReport).toHaveBeenCalledWith(importId);
    await expect(controller.getReport(importId, otherUser)).rejects.toThrow(ForbiddenException);

    jobs.get.mockReturnValue(job({ reportAvailable: false }));
    await expect(controller.getReport(importId, owner)).rejects.toThrow(NotFoundException);
    jobs.get.mockReturnValue(job({ reportAvailable: true }));
    reportStorage.streamReport.mockResolvedValue(undefined);
    await expect(controller.getReport(importId, owner)).rejects.toThrow(NotFoundException);
  });

  it('cancels an authorized job and leaves report cleanup to import orchestration', () => {
    jobs.get.mockReturnValue(job());
    jobs.cancel.mockReturnValue(true);

    expect(controller.cancel(importId, owner)).toEqual({ status: 'cancelled' });
    expect(jobs.cancel).toHaveBeenCalledWith(importId);
    expect(reportStorage.deleteReport).not.toHaveBeenCalled();
    expect(() => controller.cancel(importId, otherUser)).toThrow(ForbiddenException);

    jobs.cancel.mockReturnValue(false);
    expect(controller.cancel(importId, owner)).toEqual({ status: 'running' });
    expect(reportStorage.deleteReport).not.toHaveBeenCalled();

    jobs.get.mockReturnValue(undefined);
    expect(controller.cancel(importId, owner)).toBeUndefined();
  });
});
