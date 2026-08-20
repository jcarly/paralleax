import formbricks from '@formbricks/js';
import { formbricksFeedbackConfig, type FormbricksFeedbackConfig } from './feedbackConfig';

type FormbricksSdk = typeof formbricks;

export function createFormbricksFeedbackClient(
  sdk: FormbricksSdk,
  config: FormbricksFeedbackConfig | null,
  isSdkLoaded: () => boolean = () => typeof window !== 'undefined' && Boolean(window.formbricks),
) {
  let setupPromise: Promise<boolean> | undefined;

  const setup = (): Promise<boolean> => {
    if (!config) return Promise.resolve(false);
    if (!setupPromise) {
      setupPromise = sdk
        .setup(config)
        .then(isSdkLoaded)
        .catch(() => false);
    }
    return setupPromise;
  };

  const setLanguage = async (language: string) => {
    try {
      await sdk.setLanguage(language);
    } catch {
      // A missing survey translation must not prevent the feedback action.
    }
  };

  return {
    isConfigured: config !== null,
    setup,
    async registerRouteChange(language: string): Promise<boolean> {
      if (!(await setup())) return false;
      await setLanguage(language);
      try {
        await sdk.registerRouteChange();
        return true;
      } catch {
        return false;
      }
    },
    async trackFeedback(language: string, hiddenFields: Record<string, string>): Promise<boolean> {
      if (!(await setup())) return false;
      await setLanguage(language);
      try {
        await sdk.track('paralleax_feedback_opened', { hiddenFields });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const formbricksFeedbackClient = createFormbricksFeedbackClient(
  formbricks,
  formbricksFeedbackConfig,
);
