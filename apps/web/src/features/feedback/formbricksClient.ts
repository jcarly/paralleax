import { formbricksFeedbackConfig, type FormbricksFeedbackConfig } from './feedbackConfig';

type FormbricksSdk = Pick<
  typeof import('@formbricks/js').default,
  'setup' | 'setLanguage' | 'track'
>;

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
        .catch(() => false)
        .then((ready) => {
          if (!ready) setupPromise = undefined;
          return ready;
        });
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

let formbricksSdkPromise: Promise<FormbricksSdk> | undefined;

function loadFormbricksSdk(): Promise<FormbricksSdk> {
  if (!formbricksSdkPromise) {
    formbricksSdkPromise = import('@formbricks/js')
      .then(({ default: sdk }) => sdk)
      .catch((caught: unknown) => {
        formbricksSdkPromise = undefined;
        throw caught;
      });
  }
  return formbricksSdkPromise;
}

const lazyFormbricksSdk: FormbricksSdk = {
  setup: (config) => loadFormbricksSdk().then((sdk) => sdk.setup(config)),
  setLanguage: (language) => loadFormbricksSdk().then((sdk) => sdk.setLanguage(language)),
  track: (event, properties) => loadFormbricksSdk().then((sdk) => sdk.track(event, properties)),
};

export const formbricksFeedbackClient = createFormbricksFeedbackClient(
  lazyFormbricksSdk,
  formbricksFeedbackConfig,
);
