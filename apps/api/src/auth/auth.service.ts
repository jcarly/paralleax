import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isValidUserDisplayName, normalizeUserDisplayName, type UserRole } from '@paralleax/shared';
import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { AuthRepository, type AuthUser } from './auth.repository';
import { apiErrorResponse } from '../operations/api-error-response';
import { EmailService } from '../email/email.service';
import { AppConfigService } from '../config/app-config.service';
import { passwordResetEmail, verificationEmail } from './auth-emails';

const scrypt = promisify(nodeScrypt);
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const verificationTokenDurationMs = 24 * 60 * 60 * 1000;
const passwordResetTokenDurationMs = 60 * 60 * 1000;

export interface RegistrationResult {
  email: string;
  verificationRequired: true;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly email: EmailService,
    private readonly config: AppConfigService,
  ) {}

  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<RegistrationResult> {
    this.assertEmailDeliveryConfigured();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedDisplayName = normalizeUserDisplayName(displayName);
    if (!isValidUserDisplayName(normalizedDisplayName)) {
      throw new BadRequestException(
        apiErrorResponse(
          'DISPLAY_NAME_INVALID',
          'Display name must contain between 2 and 50 characters',
        ),
      );
    }
    if (await this.repository.findUserByEmail(normalizedEmail)) {
      throw new ConflictException(
        apiErrorResponse('EMAIL_ALREADY_REGISTERED', 'Email already registered'),
      );
    }
    const now = new Date().toISOString();
    const candidate: Omit<AuthUser, 'role'> = {
      id: randomUUID(),
      email: normalizedEmail,
      displayName: normalizedDisplayName,
      passwordHash: await hashPassword(password),
      createdAt: now,
    };
    const user = await this.repository.createUser(candidate);
    if (!user) {
      throw new ConflictException(
        apiErrorResponse('EMAIL_ALREADY_REGISTERED', 'Email already registered'),
      );
    }
    await this.sendVerificationEmail(user);
    return { email: user.email, verificationRequired: true };
  }

  async login(email: string, password: string) {
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException(
        apiErrorResponse('INVALID_CREDENTIALS', 'Invalid email or password'),
      );
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        apiErrorResponse(
          'EMAIL_VERIFICATION_REQUIRED',
          'Verify your email address before signing in',
        ),
      );
    }
    return this.createSession(user);
  }

  async userForToken(token: string | undefined) {
    if (!token) return undefined;
    await this.repository.deleteExpiredSessions();
    return this.repository.findUserBySessionHash(hashToken(token));
  }

  async logout(token: string | undefined) {
    if (token) await this.repository.deleteSession(hashToken(token));
  }

  async resendVerification(email: string): Promise<void> {
    this.assertEmailDeliveryConfigured();
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user);
  }

  async verifyEmail(token: string) {
    const user = await this.repository.verifyEmailWithActionToken(
      hashToken(token),
      new Date().toISOString(),
    );
    if (!user) throw invalidActionToken();
    return this.createSession(user);
  }

  async requestPasswordReset(email: string): Promise<void> {
    this.assertEmailDeliveryConfigured();
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user) return;
    if (!user.emailVerifiedAt) {
      await this.sendVerificationEmail(user);
      return;
    }
    await this.sendPasswordResetEmail(user);
  }

  async resetPassword(token: string, password: string) {
    const user = await this.repository.resetPasswordWithActionToken(
      hashToken(token),
      await hashPassword(password),
      new Date().toISOString(),
    );
    if (!user) throw invalidActionToken();
    return this.createSession(user);
  }

  async changePassword(userId: string, currentPassword: string, password: string) {
    const user = await this.repository.findUserById(userId);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException(
        apiErrorResponse('INVALID_CREDENTIALS', 'Invalid current password'),
      );
    }
    await this.repository.updatePasswordAndRevokeSessions(user.id, await hashPassword(password));
    return this.createSession(user);
  }

  async revokeOtherSessions(userId: string, currentToken: string | undefined): Promise<void> {
    if (!currentToken) {
      throw new UnauthorizedException(
        apiErrorResponse('AUTHENTICATION_REQUIRED', 'Authentication is required'),
      );
    }
    await this.repository.deleteOtherSessions(userId, hashToken(currentToken));
  }

  async listUsers(actorRole: UserRole) {
    this.assertAdmin(actorRole);
    return this.repository.listUsers();
  }

  async updateUserRole(actorRole: UserRole, userId: string, role: UserRole) {
    this.assertAdmin(actorRole);
    const updated = await this.repository.updateUserRole(userId, role);
    if (!updated) {
      const users = await this.repository.listUsers();
      if (!users.some(({ id }) => id === userId)) {
        throw new NotFoundException(apiErrorResponse('USER_NOT_FOUND', 'User not found'));
      }
      throw new BadRequestException(
        apiErrorResponse('LAST_ADMINISTRATOR', 'The last administrator cannot be demoted'),
      );
    }
    return updated;
  }

  async updateDisplayName(userId: string, displayName: string) {
    const normalizedDisplayName = normalizeUserDisplayName(displayName);
    if (!isValidUserDisplayName(normalizedDisplayName)) {
      throw new BadRequestException(
        apiErrorResponse(
          'DISPLAY_NAME_INVALID',
          'Display name must contain between 2 and 50 characters',
        ),
      );
    }
    const updated = await this.repository.updateDisplayName(userId, normalizedDisplayName);
    if (!updated) {
      throw new NotFoundException(apiErrorResponse('USER_NOT_FOUND', 'User not found'));
    }
    return updated;
  }

  private assertAdmin(role: UserRole) {
    if (role !== 'admin') {
      throw new ForbiddenException(
        apiErrorResponse('ADMINISTRATOR_REQUIRED', 'Administrator access required'),
      );
    }
  }

  private async createSession(user: AuthUser) {
    await this.repository.deleteExpiredSessions();
    const token = randomBytes(32).toString('base64url');
    const createdAt = new Date();
    await this.repository.createSession({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + sessionDurationMs).toISOString(),
    });
    return { user: publicUser(user), token };
  }

  private assertEmailDeliveryConfigured() {
    if (!this.email.isConfigured) {
      throw new ServiceUnavailableException(
        apiErrorResponse('EMAIL_DELIVERY_UNAVAILABLE', 'Email delivery is unavailable'),
      );
    }
  }

  private async sendVerificationEmail(user: AuthUser) {
    const token = await this.createActionToken(
      user.id,
      'verify_email',
      verificationTokenDurationMs,
    );
    await this.email.send({
      to: user.email,
      ...verificationEmail(actionUrl(this.config.corsOrigin, '/verify-email', token)),
    });
  }

  private async sendPasswordResetEmail(user: AuthUser) {
    const token = await this.createActionToken(
      user.id,
      'reset_password',
      passwordResetTokenDurationMs,
    );
    await this.email.send({
      to: user.email,
      ...passwordResetEmail(actionUrl(this.config.corsOrigin, '/reset-password', token)),
    });
  }

  private async createActionToken(
    userId: string,
    kind: 'verify_email' | 'reset_password',
    durationMs: number,
  ) {
    await this.repository.deleteExpiredAccountActionTokens();
    const value = randomBytes(32).toString('base64url');
    const createdAt = new Date();
    await this.repository.createOrReplaceAccountActionToken({
      id: randomUUID(),
      userId,
      kind,
      tokenHash: hashToken(value),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + durationMs).toISOString(),
    });
    return value;
  }
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    ...(user.emailVerifiedAt ? { emailVerifiedAt: user.emailVerifiedAt } : {}),
  };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function actionUrl(origin: string, path: string, token: string) {
  const url = new URL(path, origin);
  url.searchParams.set('token', token);
  return url.toString();
}

function invalidActionToken() {
  return new BadRequestException(
    apiErrorResponse(
      'ACCOUNT_ACTION_TOKEN_INVALID',
      'This account action link is invalid or expired',
    ),
  );
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltHex, hashHex] = stored.split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = (await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
