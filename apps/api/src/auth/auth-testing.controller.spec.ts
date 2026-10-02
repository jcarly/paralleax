import { NotFoundException } from '@nestjs/common';
import type { AppConfigService } from '../config/app-config.service';
import { TestEmailOutbox } from '../email/test-email-outbox';
import { AuthTestingController } from './auth-testing.controller';

describe('AuthTestingController', () => {
  it('returns the latest matching test email only when the explicit test outbox is enabled', () => {
    const outbox = new TestEmailOutbox();
    outbox.record({
      to: 'author@example.com',
      subject: 'Verify your account',
      text: 'http://localhost:5173/verify-email?token=verification-token',
    });
    const enabled = new AuthTestingController(
      { testEmailOutbox: true } as AppConfigService,
      outbox,
    );

    expect(enabled.latestEmail(' AUTHOR@example.com ')).toMatchObject({
      to: 'author@example.com',
      subject: 'Verify your account',
    });

    const disabled = new AuthTestingController(
      { testEmailOutbox: false } as AppConfigService,
      outbox,
    );
    expect(() => disabled.latestEmail('author@example.com')).toThrow(NotFoundException);
    expect(() => enabled.latestEmail('missing@example.com')).toThrow(NotFoundException);
  });
});
