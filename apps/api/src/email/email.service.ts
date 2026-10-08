import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BrevoClient, BrevoError, BrevoTimeoutError } from '@getbrevo/brevo';
import { apiErrorResponse } from '../operations/api-error-response';
import { AppConfigService, type EmailAddress } from '../config/app-config.service';
import { TestEmailOutbox } from './test-email-outbox';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface DeliveredEmail {
  messageId: string;
}

/**
 * Delivers transactional email through the Brevo HTTPS API.
 *
 * The service deliberately accepts a single recipient and does not log message
 * content, recipients, or API credentials. Product features own their
 * templates and decide when delivery is required.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private client: BrevoClient | undefined;

  constructor(
    private readonly config: AppConfigService,
    private readonly testOutbox?: TestEmailOutbox,
  ) {}

  get isConfigured() {
    return this.config.testEmailOutbox || Boolean(this.config.brevoApiKey && this.config.emailFrom);
  }

  async send(message: EmailMessage): Promise<DeliveredEmail> {
    const normalized = normalizeMessage(message);
    if (this.config.testEmailOutbox) {
      if (!this.testOutbox) throw unavailableEmailDelivery();
      return this.testOutbox.record(normalized);
    }
    try {
      const result = await this.brevoClient().transactionalEmails.sendTransacEmail(
        toBrevoMessage(normalized, this.config.emailFrom, this.config.emailReplyTo),
        { maxRetries: 0 },
      );
      const messageId = result.messageId ?? result.messageIds?.[0];
      if (!messageId) {
        this.logger.error({
          event: 'email_delivery_rejected',
          provider: 'brevo',
          reason: 'missing_message_id',
        });
        throw unavailableEmailDelivery();
      }
      this.logger.log({ event: 'email_delivery_accepted', provider: 'brevo', messageId });
      return { messageId };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(brevoFailureLog(error));
      throw unavailableEmailDelivery();
    }
  }

  private brevoClient() {
    if (!this.config.brevoApiKey || !this.config.emailFrom) {
      throw unavailableEmailDelivery();
    }
    this.client ??= new BrevoClient({
      apiKey: this.config.brevoApiKey,
      timeoutInSeconds: 10,
      maxRetries: 0,
    });
    return this.client;
  }
}

function normalizeMessage(message: EmailMessage): EmailMessage {
  const to = nonEmptyHeaderValue('recipient', message.to);
  const subject = nonEmptyHeaderValue('subject', message.subject);
  const text = message.text.trim();
  if (!text) throw new Error('Transactional emails require a text body');
  const html = message.html?.trim();
  return { to, subject, text, ...(html ? { html } : {}) };
}

function toBrevoMessage(
  message: EmailMessage,
  sender: EmailAddress | undefined,
  replyTo: EmailAddress | undefined,
) {
  return {
    sender,
    to: [{ email: message.to }],
    subject: message.subject,
    textContent: message.text,
    ...(message.html ? { htmlContent: message.html } : {}),
    ...(replyTo ? { replyTo } : {}),
  };
}

function nonEmptyHeaderValue(name: string, value: string) {
  const normalized = value.trim();
  if (!normalized || /[\r\n]/.test(normalized)) {
    throw new Error(`Transactional email ${name} must be a non-empty single-line value`);
  }
  return normalized;
}

function unavailableEmailDelivery() {
  return new ServiceUnavailableException(
    apiErrorResponse('EMAIL_DELIVERY_UNAVAILABLE', 'Email delivery is unavailable'),
  );
}

function brevoFailureLog(error: unknown) {
  const brevoError = error instanceof BrevoError ? error : undefined;
  const statusCode = safeHttpStatus(brevoError?.statusCode);
  const providerCode = safeProviderCode(brevoError?.body);
  const providerRequestId = safeLogToken(brevoError?.requestId);
  return {
    event: 'email_delivery_failed',
    provider: 'brevo',
    errorType: error instanceof BrevoTimeoutError ? 'timeout' : brevoError ? 'api' : 'unexpected',
    ...(statusCode ? { statusCode } : {}),
    ...(providerCode ? { providerCode } : {}),
    ...(providerRequestId ? { providerRequestId } : {}),
  };
}

function safeHttpStatus(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : undefined;
}

function safeProviderCode(body: unknown) {
  if (!body || typeof body !== 'object' || !('code' in body)) return undefined;
  return safeLogToken(body.code);
}

function safeLogToken(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(value) ? value : undefined;
}
