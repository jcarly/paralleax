import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, type SendMailOptions, type Transporter } from 'nodemailer';
import { apiErrorResponse } from '../operations/api-error-response';
import { AppConfigService } from '../config/app-config.service';

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
 * Delivers transactional email through the configured SMTP relay.
 *
 * The service deliberately accepts a single recipient and does not log message
 * content, recipients, or SMTP credentials. Product features own their
 * templates and decide when delivery is required.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | undefined;

  constructor(private readonly config: AppConfigService) {}

  get isConfigured() {
    return Boolean(this.config.emailSmtpUrl && this.config.emailFrom);
  }

  async verifyConnection(): Promise<void> {
    await this.smtpTransporter().verify();
  }

  async send(message: EmailMessage): Promise<DeliveredEmail> {
    const mail = normalizeMessage(message, this.config.emailFrom, this.config.emailReplyTo);
    try {
      const result = await this.smtpTransporter().sendMail(mail);
      if ((result.accepted?.length ?? 0) !== 1 || (result.rejected?.length ?? 0) > 0) {
        this.logger.error('SMTP relay did not accept the transactional email');
        throw unavailableEmailDelivery();
      }
      this.logger.log(`Transactional email accepted by SMTP relay (${result.messageId})`);
      return { messageId: result.messageId };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error('SMTP relay failed to deliver a transactional email');
      throw unavailableEmailDelivery();
    }
  }

  private smtpTransporter() {
    if (!this.config.emailSmtpUrl || !this.config.emailFrom) {
      throw unavailableEmailDelivery();
    }
    this.transporter ??= createTransport(
      { url: this.config.emailSmtpUrl, requireTLS: true },
      {
        from: this.config.emailFrom,
        ...(this.config.emailReplyTo ? { replyTo: this.config.emailReplyTo } : {}),
      },
    );
    return this.transporter;
  }
}

function normalizeMessage(
  message: EmailMessage,
  from: string | undefined,
  replyTo: string | undefined,
): SendMailOptions {
  const to = nonEmptyHeaderValue('recipient', message.to);
  const subject = nonEmptyHeaderValue('subject', message.subject);
  const text = message.text.trim();
  if (!text) throw new Error('Transactional emails require a text body');
  const html = message.html?.trim();
  return {
    from,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
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
