import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const healthService = {
    health: jest.fn(() => ({ status: 'ok' as const })),
    readiness: jest.fn(() => Promise.resolve({ status: 'ok' as const })),
  };
  let controller: HealthController;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();
    controller = module.get(HealthController);
  });

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
