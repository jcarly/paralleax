import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportJobService } from './import-job.service';
import { ImportReportStorage, LocalImportReportStorage } from './import-report-storage';

@Module({
  controllers: [ImportController],
  providers: [
    ImportJobService,
    LocalImportReportStorage,
    { provide: ImportReportStorage, useExisting: LocalImportReportStorage },
  ],
  exports: [ImportJobService, ImportReportStorage],
})
export class ImportsModule {}
