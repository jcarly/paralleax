import { createTransport } from 'nodemailer';
import type { AppConfigService } from '../config/app-config.service';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const mockCreateTransport = jest.mocked(createTransport);

describe('EmailService', () => {
  beforeEach(() => jest.resetAllMocks());

  it('sends one normalized transactional message through the configured SMTP relay', async () => {
    const sendMail = jest.fn().mockResolvedValue({
      accepted: ['reader@example.com'],
      rejected: [],
      messageId: '<message-1@example.com>',
    });
    const verify = jest.fn().mockResolvedValue(true);
    mockCreateTransport.mockReturnValue({ sendMail, verify } as never);
    const service = new EmailService(configuredEmailConfig());

    await expect(
      service.send({
        to: ' reader@example.com ',
        subject: ' Verify your account ',
        text: ' Verification link ',
        html: ' <p>Verification link</p> ',
      }),
    ).resolves.toEqual({ messageId: '<message-1@example.com>' });
    await service.verifyConnection();

    expect(mockCreateTransport).toHaveBeenCalledWith(
      { url: 'smtps://user:pass@smtp.example.com:465', requireTLS: true },
      {
        from: 'Paralleax <no-reply@example.com>',
        replyTo: 'support@example.com',
      },
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Paralleax <no-reply@example.com>',
      to: 'reader@example.com',
      subject: 'Verify your account',
      text: 'Verification link',
      html: '<p>Verification link</p>',
      replyTo: 'support@example.com',
    });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('does not create a transport until the first delivery attempt', async () => {
    const service = new EmailService(configuredEmailConfig());
    expect(service.isConfigured).toBe(true);
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('fails safely when SMTP delivery is not configured', async () => {
    const service = new EmailService({} as AppConfigService);
    expect(service.isConfigured).toBe(false);
    await expect(
      service.send({ to: 'reader@example.com', subject: 'Subject', text: 'Body' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('does not expose SMTP failures to a caller', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('connection refused'));
    mockCreateTransport.mockReturnValue({ sendMail } as never);
    const service = new EmailService(configuredEmailConfig());

    await expect(
      service.send({ to: 'reader@example.com', subject: 'Subject', text: 'Body' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });
  });

  it('rejects header-injection input before it reaches Nodemailer', async () => {
    const service = new EmailService(configuredEmailConfig());
    await expect(
      service.send({
        to: 'reader@example.com\r\nBcc: attacker@example.com',
        subject: 'Subject',
        text: 'Body',
      }),
    ).rejects.toThrow('Transactional email recipient must be a non-empty single-line value');
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });
});

function configuredEmailConfig() {
  return {
    emailSmtpUrl: 'smtps://user:pass@smtp.example.com:465',
    emailFrom: 'Paralleax <no-reply@example.com>',
    emailReplyTo: 'support@example.com',
  } as AppConfigService;
}
