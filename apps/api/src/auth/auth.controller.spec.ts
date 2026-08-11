import type { Response } from 'express';
import type { AppConfigService } from '../config/app-config.service';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController registration policy', () => {
  const result = {
    user: {
      id: 'user-1',
      email: 'author@example.com',
      createdAt: '2026-08-10T00:00:00.000Z',
    },
    token: 'session-token',
  };

  it('requires the configured invitation code before creating an alpha account', async () => {
    const auth = { register: jest.fn().mockResolvedValue(result) } as unknown as AuthService;
    const config = {
      registrationMode: 'access-code',
      registrationAccessCode: 'correct-alpha-code',
      secureCookies: true,
    } as AppConfigService;
    const response = { cookie: jest.fn() } as unknown as Response;
    const controller = new AuthController(auth, config);

    await expect(
      controller.register(
        { email: 'author@example.com', password: 'long-enough-password', accessCode: 'wrong' },
        response,
      ),
    ).rejects.toThrow('A valid invitation code is required');
    expect(auth.register).not.toHaveBeenCalled();

    await expect(
      controller.register(
        {
          email: 'author@example.com',
          password: 'long-enough-password',
          accessCode: 'correct-alpha-code',
        },
        response,
      ),
    ).resolves.toEqual(result.user);
    expect(auth.register).toHaveBeenCalledWith('author@example.com', 'long-enough-password');
    expect(response.cookie).toHaveBeenCalledWith(
      'paralleax_session',
      'session-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: true }),
    );
  });
});
