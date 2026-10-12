import type { AppConfigService } from '../config/app-config.service';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController registration policy', () => {
  const result = { email: 'author@example.com', verificationRequired: true as const };

  it('creates an unverified account when registration is open', async () => {
    const auth = { register: jest.fn().mockResolvedValue(result) } as unknown as AuthService;
    const config = {
      registrationMode: 'open',
      secureCookies: true,
    } as AppConfigService;
    const controller = new AuthController(auth, config);

    await expect(
      controller.register({
        email: 'author@example.com',
        displayName: 'Author',
        password: 'long-enough-password',
      }),
    ).resolves.toEqual(result);
    expect(auth.register).toHaveBeenCalledWith(
      'author@example.com',
      'long-enough-password',
      'Author',
    );
  });
});
