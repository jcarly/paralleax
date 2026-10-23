import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormbricksFeedbackClient } from './formbricksClient';

const lazySdk = vi.hoisted(() => ({
  setup: vi.fn().mockResolvedValue(undefined),
  setLanguage: vi.fn().mockResolvedValue(undefined),
  registerRouteChange: vi.fn().mockResolvedValue(undefined),
  track: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@formbricks/js', () => ({ default: lazySdk }));

function createSdk() {
  return {
    setup: vi.fn().mockResolvedValue(undefined),
    setEmail: vi.fn().mockResolvedValue(undefined),
    setAttribute: vi.fn().mockResolvedValue(undefined),
    setAttributes: vi.fn().mockResolvedValue(undefined),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    setUserId: vi.fn().mockResolvedValue(undefined),
    setNonce: vi.fn().mockResolvedValue(undefined),
    track: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    registerRouteChange: vi.fn().mockResolvedValue(undefined),
    setEmbeddedData: vi.fn().mockResolvedValue(undefined),
    clearEmbeddedData: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(() => () => undefined),
    off: vi.fn(),
  };
}

describe('Formbricks feedback client', () => {
  const config = {
    workspaceId: 'workspace-1',
    appUrl: 'https://app.formbricks.com',
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sets up once and forwards route changes and hidden fields', async () => {
    const sdk = createSdk();
    const client = createFormbricksFeedbackClient(sdk, config, () => true);

    await expect(Promise.all([client.setup(), client.setup()])).resolves.toEqual([true, true]);
    await expect(client.registerRouteChange('fr')).resolves.toBe(true);
    await expect(client.trackFeedback('fr', { paralleax_surface: 'editor' })).resolves.toBe(true);

    expect(sdk.setup).toHaveBeenCalledOnce();
    expect(sdk.setup).toHaveBeenCalledWith(config);
    expect(sdk.setLanguage).toHaveBeenCalledWith('fr');
    expect(sdk.registerRouteChange).toHaveBeenCalledOnce();
    expect(sdk.track).toHaveBeenCalledWith('paralleax_feedback_opened', {
      hiddenFields: { paralleax_surface: 'editor' },
    });
    expect(sdk.setUserId).not.toHaveBeenCalled();
    expect(sdk.setEmail).not.toHaveBeenCalled();
  });

  it('keeps actions available when language synchronization fails', async () => {
    const sdk = createSdk();
    sdk.setLanguage.mockRejectedValue(new Error('missing translation'));
    const client = createFormbricksFeedbackClient(sdk, config, () => true);

    await expect(client.trackFeedback('fr', {})).resolves.toBe(true);
    expect(sdk.track).toHaveBeenCalledOnce();
  });

  it('contains SDK failures and stays disabled without configuration', async () => {
    const failingSdk = createSdk();
    failingSdk.setup.mockRejectedValue(new Error('offline'));
    const failingClient = createFormbricksFeedbackClient(failingSdk, config, () => true);
    await expect(failingClient.setup()).resolves.toBe(false);
    await expect(failingClient.registerRouteChange('en')).resolves.toBe(false);
    await expect(failingClient.trackFeedback('en', {})).resolves.toBe(false);

    const disabledSdk = createSdk();
    const disabledClient = createFormbricksFeedbackClient(disabledSdk, null, () => true);
    expect(disabledClient.isConfigured).toBe(false);
    await expect(disabledClient.setup()).resolves.toBe(false);
    expect(disabledSdk.setup).not.toHaveBeenCalled();
  });

  it('reports route and tracking call failures without rejecting', async () => {
    const sdk = createSdk();
    sdk.registerRouteChange.mockRejectedValue(new Error('route failed'));
    sdk.track.mockRejectedValue(new Error('track failed'));
    const client = createFormbricksFeedbackClient(sdk, config, () => true);

    await expect(client.registerRouteChange('en')).resolves.toBe(false);
    await expect(client.trackFeedback('en', {})).resolves.toBe(false);
  });

  it('does not expose a ready client when the remote SDK did not load', async () => {
    const sdk = createSdk();
    const client = createFormbricksFeedbackClient(sdk, config, () => false);

    await expect(client.setup()).resolves.toBe(false);
  });

  it('uses the browser SDK presence as the default readiness signal', async () => {
    const sdk = createSdk();
    const previousSdk = window.formbricks;
    window.formbricks = sdk;
    try {
      const client = createFormbricksFeedbackClient(sdk, config);
      await expect(client.setup()).resolves.toBe(true);
    } finally {
      window.formbricks = previousSdk;
    }
  });

  it('loads the browser SDK on demand and forwards configured feedback calls', async () => {
    vi.stubEnv('VITE_FORMBRICKS_WORKSPACE_ID', 'workspace-1');
    vi.stubEnv('VITE_FORMBRICKS_APP_URL', 'https://app.formbricks.com');
    vi.resetModules();
    const previousSdk = window.formbricks;
    window.formbricks = lazySdk as unknown as typeof window.formbricks;

    try {
      const { formbricksFeedbackClient } = await import('./formbricksClient');

      expect(formbricksFeedbackClient.isConfigured).toBe(true);
      await expect(
        Promise.all([formbricksFeedbackClient.setup(), formbricksFeedbackClient.setup()]),
      ).resolves.toEqual([true, true]);
      await expect(formbricksFeedbackClient.registerRouteChange('fr')).resolves.toBe(true);
      await expect(
        formbricksFeedbackClient.trackFeedback('fr', { paralleax_surface: 'editor' }),
      ).resolves.toBe(true);

      expect(lazySdk.setup).toHaveBeenCalledOnce();
      expect(lazySdk.setup).toHaveBeenCalledWith(config);
      expect(lazySdk.setLanguage).toHaveBeenCalledWith('fr');
      expect(lazySdk.registerRouteChange).toHaveBeenCalledOnce();
      expect(lazySdk.track).toHaveBeenCalledWith('paralleax_feedback_opened', {
        hiddenFields: { paralleax_surface: 'editor' },
      });
    } finally {
      window.formbricks = previousSdk;
    }
  });
});
