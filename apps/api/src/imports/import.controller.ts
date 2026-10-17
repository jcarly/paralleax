import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  ParseUUIDPipe,
  StreamableFile,
  type MessageEvent,
  Param,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser, type RequestUser } from '../auth/auth.decorators';
import { ImportJobService } from './import-job.service';
import { ImportReportStorage } from './import-report-storage';

@Controller('imports')
export class ImportController {
  constructor(
    private readonly jobs: ImportJobService,
    private readonly reportStorage: ImportReportStorage,
  ) {}

  @Get(':importId')
  getJob(
    @Param('importId', new ParseUUIDPipe({ version: '4' })) importId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const job = this.jobs.get(importId);
    if (!job) throw new NotFoundException('The import job does not exist.');
    if (job.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this import job.');
    }
    return job;
  }

  @Sse(':importId/events')
  @Header('X-Accel-Buffering', 'no')
  streamEvents(
    @Param('importId', new ParseUUIDPipe({ version: '4' })) importId: string,
    @CurrentUser() user: RequestUser,
  ): Observable<MessageEvent> {
    const job = this.jobs.get(importId);
    if (!job) {
      throw new ForbiddenException('The import job does not exist.');
    }
    if (job.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this import job.');
    }
    return this.jobs.stream(user.id, importId);
  }

  @Get(':importId/report')
  async getReport(
    @Param('importId', new ParseUUIDPipe({ version: '4' })) importId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const job = this.jobs.get(importId);
    if (!job) throw new NotFoundException('The import job does not exist.');
    if (job.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this import report.');
    }
    if (!job.reportAvailable)
      throw new NotFoundException('No report is available for this import.');
    const stream = await this.reportStorage.streamReport(importId);
    if (!stream) throw new NotFoundException('No report is available for this import.');
    return new StreamableFile(stream, {
      type: 'application/x-ndjson; charset=utf-8',
      disposition: `attachment; filename="${importId}.jsonl"`,
    });
  }

  @Delete(':importId')
  cancel(
    @Param('importId', new ParseUUIDPipe({ version: '4' })) importId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const job = this.jobs.get(importId);
    if (!job) {
      return;
    }
    if (job.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this import job.');
    }
    if (!this.jobs.cancel(importId)) return { status: job.status };
    return { status: 'cancelled' };
  }
}
