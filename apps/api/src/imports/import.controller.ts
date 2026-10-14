import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  type MessageEvent,
  Param,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { CurrentUser, type RequestUser } from '../auth/auth.decorators';
import { ImportJobService } from './import-job.service';
import { LocalImportReportStorage } from './import-report-storage';

@Controller('imports')
export class ImportController {
  constructor(
    private readonly jobs: ImportJobService,
    private readonly reportStorage: LocalImportReportStorage,
  ) {}

  @Get(':importId')
  getJob(@Param('importId') importId: string, @CurrentUser() user: RequestUser) {
    const job = this.jobs.get(importId);
    if (!job) {
      return undefined;
    }
    if (job.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this import job.');
    }
    return job;
  }

  @Sse(':importId/events')
  @Header('X-Accel-Buffering', 'no')
  streamEvents(
    @Param('importId') importId: string,
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
  @Header('Content-Type', 'application/jsonl; charset=utf-8')
  async getReport(
    @Param('importId') importId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const job = this.jobs.get(importId);
    if (!job) {
      throw new ForbiddenException('The import job does not exist.');
    }
    if (job.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this import report.');
    }
    const filePath = await this.reportStorage.getReportPath(importId);
    if (!filePath) {
      response.status(404);
      return { message: 'No report is available for this import.' };
    }
    const stream = await this.reportStorage.streamReport(importId);
    if (!stream) {
      response.status(404);
      return { message: 'No report is available for this import.' };
    }
    response.setHeader('Content-Disposition', `attachment; filename="${importId}.jsonl"`);
    return stream;
  }

  @Delete(':importId')
  cancel(@Param('importId') importId: string, @CurrentUser() user: RequestUser) {
    const job = this.jobs.get(importId);
    if (!job) {
      return;
    }
    if (job.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this import job.');
    }
    this.jobs.setStatus(importId, 'cancelled');
    void this.reportStorage.deleteReport(importId);
    return { status: 'cancelled' };
  }
}
