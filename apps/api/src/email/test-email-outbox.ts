import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { DeliveredEmail, EmailMessage } from './email.service';

export interface TestEmailMessage extends EmailMessage, DeliveredEmail {
  createdAt: string;
}

/**
 * Captures normalized messages only for isolated test processes. It is never
 * exposed unless the application configuration explicitly enables test mode.
 */
@Injectable()
export class TestEmailOutbox {
  private readonly messages: TestEmailMessage[] = [];

  record(message: EmailMessage): DeliveredEmail {
    const delivered = {
      ...message,
      messageId: `<${randomUUID()}@test.paralleax.invalid>`,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(delivered);
    return { messageId: delivered.messageId };
  }

  latestFor(recipient: string): TestEmailMessage | undefined {
    const normalizedRecipient = recipient.trim().toLowerCase();
    return [...this.messages]
      .reverse()
      .find((message) => message.to.toLowerCase() === normalizedRecipient);
  }
}
