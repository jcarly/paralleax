import { Logger } from '@nestjs/common';
import { BrevoClient, BrevoError, BrevoTimeoutError } from '@getbrevo/brevo';
import type { AppConfigService } from '../config/app-config.service';
import { EmailService } from './email.service';
import { TestEmailOutbox } from './test-email-outbox';

jest.mock('@getbrevo/brevo', () => {
  const actual = jest.requireActual<typeof import('@getbrevo/brevo')>('@getbrevo/brevo');
  return { ...actual, BrevoClient: jest.fn() };
});

const mockBrevoClient = jest.mocked(BrevoClient);

describe('EmailService', () => {
  beforeEach(() => jest.resetAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('sends one normalized transactional message through the Brevo API', async () => {
    const sendTransacEmail = jest.fn().mockResolvedValue({ messageId: '<message-1@example.com>' });
    mockClient(sendTransacEmail);
    const service = new EmailService(configuredEmailConfig());

    await expect(
      service.send({
        to: ' reader@example.com ',
        subject: ' Verify your account ',
        text: ' Verification link ',
        html: ' <p>Verification link</p> ',
      }),
    ).resolves.toEqual({ messageId: '<message-1@example.com>' });

    expect(mockBrevoClient).toHaveBeenCalledWith({
      apiKey: 'xkeysib-secret',
      timeoutInSeconds: 10,
      maxRetries: 0,
    });
    expect(sendTransacEmail).toHaveBeenCalledWith(
      {
        sender: { email: 'no-reply@example.com', name: 'Paralleax' },
        to: [{ email: 'reader@example.com' }],
        subject: 'Verify your account',
        textContent: 'Verification link',
        htmlContent: '<p>Verification link</p>',
        replyTo: { email: 'support@example.com' },
      },
      { maxRetries: 0 },
    );
  });

  it('does not create a Brevo client until the first delivery attempt', () => {
    const service = new EmailService(configuredEmailConfig());
    expect(service.isConfigured).toBe(true);
    expect(mockBrevoClient).not.toHaveBeenCalled();
  });

  it('captures normalized messages in the test-only outbox without constructing a Brevo client', async () => {
    const outbox = new TestEmailOutbox();
    const service = new EmailService({ testEmailOutbox: true } as AppConfigService, outbox);

    await expect(
      service.send({
        to: ' reader@example.com ',
        subject: ' Verify your account ',
        text: ' Verification link ',
      }),
    ).resolves.toMatchObject({ messageId: expect.any(String) });

    expect(service.isConfigured).toBe(true);
    expect(outbox.latestFor('reader@example.com')).toMatchObject({
      to: 'reader@example.com',
      subject: 'Verify your account',
      text: 'Verification link',
    });
    expect(mockBrevoClient).not.toHaveBeenCalled();
  });

  it('fails closed if test-outbox configuration is missing its in-memory provider', async () => {
    const service = new EmailService({ testEmailOutbox: true } as AppConfigService);

    await expect(
      service.send({ to: 'reader@example.com', subject: 'Subject', text: 'Body' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });
  });

  it('fails safely when Brevo delivery is not configured', async () => {
    const service = new EmailService({} as AppConfigService);
    expect(service.isConfigured).toBe(false);
    await expect(
      service.send({ to: 'reader@example.com', subject: 'Subject', text: 'Body' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });
    expect(mockBrevoClient).not.toHaveBeenCalled();
  });

  it('does not expose unexpected delivery failures to a caller', async () => {
    const sendTransacEmail = jest.fn().mockRejectedValue(new Error('connection refused'));
    mockClient(sendTransacEmail);
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new EmailService(configuredEmailConfig());

    await expect(
      service.send({ to: 'reader@example.com', subject: 'Subject', text: 'Body' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });
  });

  it('logs safe Brevo diagnostics without exposing responses or credentials', async () => {
    const brevoError = new BrevoError({
      message: 'Authentication failed for reader@example.com with xkeysib-secret',
      statusCode: 401,
      body: {
        code: 'unauthorized',
        message: 'Invalid API key xkeysib-secret for reader@example.com',
      },
      cause: new Error('xkeysib-secret'),
    });
    const sendTransacEmail = jest.fn().mockRejectedValue(brevoError);
    mockClient(sendTransacEmail);
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new EmailService(configuredEmailConfig());

    await expect(
      service.send({ to: 'reader@example.com', subject: 'Subject', text: 'Body' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });

    expect(loggerError).toHaveBeenCalledWith({
      event: 'email_delivery_failed',
      provider: 'brevo',
      errorType: 'api',
      statusCode: 401,
      providerCode: 'unauthorized',
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toMatch(
      /xkeysib-secret|reader@example\.com|Invalid API key/,
    );
  });

  it('identifies Brevo timeouts without logging their message', async () => {
    const sendTransacEmail = jest
      .fn()
      .mockRejectedValue(new BrevoTimeoutError('Timed out while sending to reader@example.com'));
    mockClient(sendTransacEmail);
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new EmailService(configuredEmailConfig());

    await expect(
      service.send({ to: 'reader@example.com', subject: 'Subject', text: 'Body' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });

    expect(loggerError).toHaveBeenCalledWith({
      event: 'email_delivery_failed',
      provider: 'brevo',
      errorType: 'timeout',
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain('reader@example.com');
  });

  it('fails safely when Brevo accepts a request without returning a message id', async () => {
    const sendTransacEmail = jest.fn().mockResolvedValue({});
    mockClient(sendTransacEmail);
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new EmailService(configuredEmailConfig());

    await expect(
      service.send({ to: 'reader@example.com', subject: 'Subject', text: 'Body' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });

    expect(loggerError).toHaveBeenCalledWith({
      event: 'email_delivery_rejected',
      provider: 'brevo',
      reason: 'missing_message_id',
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain('reader@example.com');
  });

  it('rejects header-injection input before it reaches Brevo', async () => {
    const service = new EmailService(configuredEmailConfig());
    await expect(
      service.send({
        to: 'reader@example.com\r\nBcc: attacker@example.com',
        subject: 'Subject',
        text: 'Body',
      }),
    ).rejects.toThrow('Transactional email recipient must be a non-empty single-line value');
    expect(mockBrevoClient).not.toHaveBeenCalled();
  });
});

function mockClient(sendTransacEmail: jest.Mock) {
  mockBrevoClient.mockImplementation(
    () => ({ transactionalEmails: { sendTransacEmail } }) as unknown as BrevoClient,
  );
}

function configuredEmailConfig() {
  return {
    brevoApiKey: 'xkeysib-secret',
    emailFrom: { email: 'no-reply@example.com', name: 'Paralleax' },
    emailReplyTo: { email: 'support@example.com' },
  } as AppConfigService;
}
