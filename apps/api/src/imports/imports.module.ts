import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportJobService } from './import-job.service';
import { LocalImportReportStorage } from './import-report-storage';

@Module({
  controllers: [ImportController],
  providers: [ImportJobService, LocalImportReportStorage],
  exports: [ImportJobService, LocalImportReportStorage],
})
export class ImportsModule {}
