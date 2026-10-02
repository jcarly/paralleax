import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { TestEmailOutbox } from '../email/test-email-outbox';
import { Public } from './auth.decorators';

/**
 * Provides acceptance tests with a verification link from the in-memory outbox.
 * The route returns 404 unless the explicit test-only configuration is active.
 */
@Controller('test/auth')
export class AuthTestingController {
  constructor(
    private readonly config: AppConfigService,
    private readonly outbox: TestEmailOutbox,
  ) {}

  @Public()
  @Get('emails/latest')
  latestEmail(@Query('to') recipient: string) {
    if (!this.config.testEmailOutbox) throw new NotFoundException();
    const email = this.outbox.latestFor(recipient);
    if (!email) throw new NotFoundException();
    return email;
  }
}
