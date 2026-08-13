import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserRole } from '@paralleax/shared';
import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { AuthRepository, type AuthUser } from './auth.repository';

const scrypt = promisify(nodeScrypt);
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async register(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (await this.repository.findUserByEmail(normalizedEmail)) {
      throw new ConflictException('Email already registered');
    }
    const now = new Date().toISOString();
    const candidate: Omit<AuthUser, 'role'> = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      createdAt: now,
    };
    const user = await this.repository.createUser(candidate);
    if (!user) {
      throw new ConflictException('Email already registered');
    }
    return this.createSession(user);
  }

  async login(email: string, password: string) {
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
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

  async listUsers(actorRole: UserRole) {
    this.assertAdmin(actorRole);
    return this.repository.listUsers();
  }

  async updateUserRole(actorRole: UserRole, userId: string, role: UserRole) {
    this.assertAdmin(actorRole);
    const updated = await this.repository.updateUserRole(userId, role);
    if (!updated) {
      const users = await this.repository.listUsers();
      if (!users.some(({ id }) => id === userId)) throw new NotFoundException('User not found');
      throw new BadRequestException('The last administrator cannot be demoted');
    }
    return updated;
  }

  private assertAdmin(role: UserRole) {
    if (role !== 'admin') throw new ForbiddenException('Administrator access required');
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
}

function publicUser(user: AuthUser) {
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
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
