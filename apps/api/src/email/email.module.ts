import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { EmailService } from './email.service';
import { TestEmailOutbox } from './test-email-outbox';

@Module({
  imports: [ConfigModule],
  providers: [EmailService, TestEmailOutbox],
  exports: [EmailService, TestEmailOutbox],
})
export class EmailModule {}
