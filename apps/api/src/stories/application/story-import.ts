import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  parseQspLocationBundle,
  defaultStoryAccess,
  resolveStoryAccess,
  type ChoiceScriptImportResult,
  type QspImportResult,
  type QspImportSource,
  type StorySummary,
} from '@paralleax/shared';
import type { ImportChoiceScriptDto, ImportQspDto, QspSourceMetadataDto } from '../dto/stories.dto';
import { StoriesRepository } from '../stories.repository';
import { apiErrorResponse } from '../../operations/api-error-response';
import { ImportJobService } from '../../imports/import-job.service';
import { QspImportWorkerService } from './qsp-import-worker.service';
import { ChoiceScriptImportWorkerService } from './choicescript-import-worker.service';
import { QspImportProgressService } from './qsp-import-progress.service';

export const CHOICESCRIPT_IMPORT_SOURCE_LIMIT = 96 * 1024;
export const QSP_IMPORT_SOURCE_LIMIT = 80 * 1024;

@Injectable()
export class StoryImportService {
  constructor(
    private readonly repository: StoriesRepository,
    private readonly qspWorkers: QspImportWorkerService,
    private readonly choiceScriptWorkers: ChoiceScriptImportWorkerService,
    private readonly qspProgress: QspImportProgressService,
    private readonly jobs: ImportJobService,
  ) {}

  async createChoiceScript(
    input: ImportChoiceScriptDto,
    userId: string,
    confirmWarnings = false,
    abortSignal?: AbortSignal,
  ) {
    const sourceSize = input.files.reduce(
      (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
      0,
    );
    if (sourceSize > CHOICESCRIPT_IMPORT_SOURCE_LIMIT) {
      throw new BadRequestException(
        apiErrorResponse(
          'CHOICESCRIPT_IMPORT_TOO_LARGE',
          'ChoiceScript source files exceed the 96 KiB import limit',
        ),
      );
    }
    const job = this.jobs.create(userId, 'choicescript');
    const jobSignal = this.jobs.getAbortSignal(job.id);
    const effectiveAbortSignal =
      abortSignal && jobSignal
        ? AbortSignal.any([abortSignal, jobSignal])
        : (abortSignal ?? jobSignal);
    let result: ChoiceScriptImportResult;
    try {
      this.jobs.update(job.id, { status: 'running', phase: 'parsing' });
      result = await this.choiceScriptWorkers.run(
        input.files,
        importOptions(),
        effectiveAbortSignal,
      );
    } catch (caught) {
      if (effectiveAbortSignal?.aborted || this.jobs.isCancelled(job.id)) {
        this.jobs.cancel(job.id);
        return this.finishCancelledImport(job.id);
      }
      return this.failInfrastructureImport(job.id, 'choicescript', caught);
    }
    return this.completeImport(
      result,
      'ChoiceScript',
      userId,
      confirmWarnings,
      job.id,
      effectiveAbortSignal,
    );
  }

  async createQsp(
    input: ImportQspDto,
    userId: string,
    confirmWarnings = false,
    abortSignal?: AbortSignal,
  ) {
    const bytes = Buffer.from(input.file.contentBase64, 'base64');
    return this.createQspFromBytes(
      input.file,
      bytes,
      userId,
      confirmWarnings,
      QSP_IMPORT_SOURCE_LIMIT,
      input.progressId,
      abortSignal,
    );
  }

  createUnlimitedQsp(
    input: QspSourceMetadataDto,
    bytes: Buffer,
    userId: string,
    confirmWarnings = false,
    progressId?: string,
    abortSignal?: AbortSignal,
  ) {
    return this.createQspFromBytes(
      input,
      bytes,
      userId,
      confirmWarnings,
      undefined,
      progressId,
      abortSignal,
    );
  }

  private async createQspFromBytes(
    input: QspSourceMetadataDto,
    bytes: Buffer,
    userId: string,
    confirmWarnings: boolean,
    sourceLimit?: number,
    progressId?: string,
    abortSignal?: AbortSignal,
  ) {
    const expectedFormat = qspFormatForFileName(input.name);
    if (expectedFormat !== input.format) {
      throw new BadRequestException(
        apiErrorResponse(
          'QSP_IMPORT_FORMAT_MISMATCH',
          `The file extension does not match the declared QSP ${input.format} format`,
        ),
      );
    }
    const source = qspImportSource(input, bytes);
    if (sourceLimit !== undefined && qspSourceSize(source) > sourceLimit) {
      throw new BadRequestException(
        apiErrorResponse('QSP_IMPORT_TOO_LARGE', 'The QSP source exceeds the 80 KiB import limit'),
      );
    }
    const job = this.jobs.create(userId, 'qsp');
    const jobSignal = this.jobs.getAbortSignal(job.id);
    const effectiveAbortSignal =
      abortSignal && jobSignal
        ? AbortSignal.any([abortSignal, jobSignal])
        : (abortSignal ?? jobSignal);
    let result: QspImportResult;
    try {
      this.jobs.update(job.id, { status: 'running', phase: 'decoding' });
      result = await this.qspWorkers.run(
        source,
        (progress) => {
          this.qspProgress.publish(userId, progressId, progress);
          this.jobs.update(job.id, {
            phase: progress.phase,
            progress: progress.total ? Math.floor((progress.completed / progress.total) * 100) : 0,
            total: progress.total,
            currentFile: progress.currentFile,
          });
        },
        effectiveAbortSignal,
      );
    } catch (caught) {
      this.qspProgress.complete(userId, progressId);
      if (effectiveAbortSignal?.aborted || this.jobs.isCancelled(job.id)) {
        this.jobs.cancel(job.id);
        return this.finishCancelledImport(job.id);
      }
      return this.failInfrastructureImport(job.id, 'qsp', caught);
    }

    try {
      const willPersist =
        result.story !== undefined &&
        result.report.errorCount === 0 &&
        (confirmWarnings || result.report.warningCount === 0);
      const outcome = await this.completeImport(
        result,
        'QSP',
        userId,
        confirmWarnings,
        job.id,
        effectiveAbortSignal,
        willPersist
          ? () => {
              this.qspProgress.publish(userId, progressId, { phase: 'saving', completed: 0 });
            }
          : undefined,
      );
      if (outcome.status === 'imported') {
        this.qspProgress.publish(userId, progressId, {
          phase: 'saving',
          completed: 1,
          total: 1,
        });
      }
      return outcome;
    } finally {
      this.qspProgress.complete(userId, progressId);
    }
  }

  private async completeImport(
    result: ChoiceScriptImportResult | QspImportResult,
    sourceLabel: string,
    userId: string,
    confirmWarnings: boolean,
    importId: string,
    abortSignal?: AbortSignal,
    onSaving?: () => void,
  ) {
    if (abortSignal?.aborted) {
      this.jobs.cancel(importId);
    }
    if (this.jobs.isCancelled(importId)) {
      return this.finishCancelledImport(importId);
    }
    const report = result.report;
    if (!result.story || result.report.errorCount > 0) {
      this.jobs.update(importId, {
        status: 'failed',
        phase: 'finalizing',
        warningCount: result.report.warningCount,
        errorCount: result.report.errorCount,
      });
      this.jobs.complete(importId);
      throw new BadRequestException(
        apiErrorResponse('STORY_IMPORT_FAILED', `${sourceLabel} import failed`, {
          importId,
          report,
        }),
      );
    }
    if (!confirmWarnings && result.report.warningCount > 0) {
      this.jobs.update(importId, {
        status: 'awaiting_confirmation',
        phase: 'finalizing',
        warningCount: result.report.warningCount,
        errorCount: result.report.errorCount,
      });
      this.jobs.complete(importId);
      return { status: 'confirmation_required' as const, importId, report };
    }
    if (abortSignal?.aborted) {
      this.jobs.cancel(importId);
    }
    if (this.jobs.isCancelled(importId)) {
      return this.finishCancelledImport(importId);
    }
    if (
      !this.jobs.beginPersistence(importId, {
        warningCount: result.report.warningCount,
        errorCount: result.report.errorCount,
      })
    ) {
      return this.finishCancelledImport(importId);
    }
    onSaving?.();
    try {
      await this.repository.save(result.story, userId);
    } catch (caught) {
      this.jobs.update(importId, { status: 'failed', phase: 'finalizing' });
      this.jobs.complete(importId);
      if (caught instanceof UnprocessableEntityException) {
        const original = caught.getResponse();
        if (typeof original === 'object') {
          const body = original as { details?: unknown };
          const details =
            typeof body.details === 'object' && body.details !== null ? body.details : {};
          throw new UnprocessableEntityException({
            ...body,
            details: { ...details, importId, report },
          });
        }
        throw caught;
      }
      throw new InternalServerErrorException(
        apiErrorResponse(
          'STORY_IMPORT_SAVE_FAILED',
          'The converted Story could not be saved; a diagnostic preview is included.',
          {
            importId,
            report,
          },
        ),
        { cause: caught },
      );
    }
    this.jobs.update(importId, {
      status: 'completed',
      phase: 'finalizing',
      progress: 100,
      warningCount: result.report.warningCount,
      errorCount: result.report.errorCount,
      storyId: result.story.id,
    });
    this.jobs.complete(importId);
    const access = result.story.access ?? defaultStoryAccess;
    const story: StorySummary = {
      id: result.story.id,
      revision: result.story.revision,
      title: result.story.title,
      interactionCount: result.story.interactions.length,
      startDateTime: result.story.startDateTime,
      access,
      capabilities:
        result.story.capabilities ??
        resolveStoryAccess(access, { authenticated: true, isOwner: true }),
      owner: result.story.owner,
      createdAt: result.story.createdAt,
      updatedAt: result.story.updatedAt,
    };
    return {
      status: 'imported' as const,
      importId,
      story,
      report,
    };
  }

  private async finishCancelledImport(importId: string) {
    this.jobs.complete(importId);
    return { status: 'cancelled' as const, importId };
  }

  private async failInfrastructureImport(
    importId: string,
    format: 'choicescript' | 'qsp',
    caught: unknown,
  ): Promise<never> {
    this.jobs.update(importId, { status: 'failed', phase: 'finalizing' });
    this.jobs.complete(importId);
    throw this.importInfrastructureError(importId, format, caught);
  }

  private importInfrastructureError(importId: string, format: string, caught: unknown) {
    const errorType = caught instanceof Error ? caught.name : 'UnknownError';
    return new InternalServerErrorException(
      apiErrorResponse(
        'STORY_IMPORT_EXECUTION_FAILED',
        `${format} import execution failed during processing.`,
        { importId, format, errorType },
      ),
      { cause: caught instanceof Error ? caught : undefined },
    );
  }
}

function importOptions() {
  return {
    storyId: randomUUID(),
    timestamp: new Date().toISOString(),
    createId: randomUUID,
  };
}

function qspFormatForFileName(name: string): QspImportSource['format'] {
  if (/\.(?:qsp|gam)$/i.test(name)) {
    return 'binary';
  }
  return /\.qsrc$/i.test(name) ? 'locations' : 'text';
}

function qspImportSource(input: QspSourceMetadataDto, bytes: Buffer): QspImportSource {
  if (input.format === 'binary') {
    return { name: input.name, format: 'binary', content: bufferToArrayBuffer(bytes) };
  }
  const content = decodeUtf8(bytes);
  return input.format === 'locations'
    ? { name: input.name, format: 'locations', content: decodeQspLocationBundle(content) }
    : { name: input.name, format: 'text', content };
}

function decodeQspLocationBundle(content: string) {
  try {
    return parseQspLocationBundle(content);
  } catch (caught) {
    throw new BadRequestException(
      apiErrorResponse(
        'QSP_LOCATION_BUNDLE_INVALID',
        caught instanceof Error ? caught.message : 'The QSP locations bundle is invalid',
      ),
    );
  }
}

function qspSourceSize(source: QspImportSource) {
  if (source.format === 'binary') {
    return source.content.byteLength;
  }
  if (source.format === 'text') {
    return Buffer.byteLength(source.content, 'utf8');
  }
  return source.content.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0);
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new BadRequestException(
      apiErrorResponse('QSP_SOURCE_INVALID_UTF8', 'The QSP text source is not valid UTF-8'),
    );
  }
}

function bufferToArrayBuffer(bytes: Buffer): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return Uint8Array.from(bytes).buffer;
}
