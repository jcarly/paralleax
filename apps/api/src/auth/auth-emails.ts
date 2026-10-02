import type { EmailMessage } from '../email/email.service';

export function verificationEmail(verificationUrl: string): Omit<EmailMessage, 'to'> {
  return {
    subject: 'Verify your Paralleax email address',
    text: [
      'Verify your email address to activate your Paralleax account.',
      '',
      verificationUrl,
      '',
      'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
    ].join('\n'),
    html: `<p>Verify your email address to activate your Paralleax account.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>`,
  };
}

export function passwordResetEmail(resetUrl: string): Omit<EmailMessage, 'to'> {
  return {
    subject: 'Reset your Paralleax password',
    text: [
      'Use this link to set a new Paralleax password.',
      '',
      resetUrl,
      '',
      'This link expires in one hour. If you did not request a password reset, you can ignore this email.',
    ].join('\n'),
    html: `<p>Use this link to set a new Paralleax password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in one hour. If you did not request a password reset, you can ignore this email.</p>`,
  };
}
