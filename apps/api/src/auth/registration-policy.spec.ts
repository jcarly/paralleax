import { assertRegistrationAllowed } from './registration-policy';

describe('registration policy', () => {
  it('allows open registration', () => {
    expect(() => assertRegistrationAllowed('open')).not.toThrow();
  });

  it('blocks account creation when registration is closed', () => {
    expect(() => assertRegistrationAllowed('closed')).toThrow('Registration is closed');
  });
});
