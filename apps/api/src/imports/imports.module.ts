import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportJobService } from './import-job.service';

@Module({
  controllers: [ImportController],
  providers: [ImportJobService],
  exports: [ImportJobService],
})
export class ImportsModule {}
