import type { AppConfigService } from '../config/app-config.service';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController registration policy', () => {
  const result = { email: 'author@example.com', verificationRequired: true as const };

  it('requires the configured invitation code before creating an alpha account', async () => {
    const auth = { register: jest.fn().mockResolvedValue(result) } as unknown as AuthService;
    const config = {
      registrationMode: 'access-code',
      registrationAccessCode: 'correct-alpha-code',
      secureCookies: true,
    } as AppConfigService;
    const controller = new AuthController(auth, config);

    await expect(
      controller.register({
        email: 'author@example.com',
        displayName: 'Author',
        password: 'long-enough-password',
        accessCode: 'wrong',
      }),
    ).rejects.toThrow('A valid invitation code is required');
    expect(auth.register).not.toHaveBeenCalled();

    await expect(
      controller.register({
        email: 'author@example.com',
        displayName: 'Author',
        password: 'long-enough-password',
        accessCode: 'correct-alpha-code',
      }),
    ).resolves.toEqual(result);
    expect(auth.register).toHaveBeenCalledWith(
      'author@example.com',
      'long-enough-password',
      'Author',
    );
  });
});
