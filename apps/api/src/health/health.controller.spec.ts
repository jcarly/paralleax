import type { HealthService } from './health.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const healthService = {
    health: jest.fn(() => ({ status: 'ok' as const })),
    readiness: jest.fn(() => Promise.resolve({ status: 'ok' as const })),
  };
  const controller = new HealthController(healthService as unknown as HealthService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes process health', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
    expect(healthService.health).toHaveBeenCalledTimes(1);
  });

  it('exposes readiness', async () => {
    await expect(controller.readiness()).resolves.toEqual({ status: 'ok' });
    expect(healthService.readiness).toHaveBeenCalledTimes(1);
  });
});
