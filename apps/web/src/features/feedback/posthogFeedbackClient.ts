import type {
  CaptureResult,
  DisplaySurveyOptions,
  PostHogConfig,
  Properties,
  SurveyCallback,
} from 'posthog-js';
import { postHogFeedbackConfig, type PostHogFeedbackConfig } from './feedbackConfig';
import { sanitizeFeedbackEvent } from './feedbackEventPrivacy';
import { buildPostHogInitConfig } from './posthogInitConfig';

/** The public `posthog-js` methods that Paralleax uses. */
export interface PostHogSurveySdk {
  displaySurvey(surveyId: string, options: DisplaySurveyOptions): void;
  getSurveys(callback: SurveyCallback, forceReload?: boolean): void;
  set_config(config: Partial<PostHogConfig>): void;
}

export type PostHogSdkLoader = (
  projectToken: string,
  initConfig: Partial<PostHogConfig>,
) => Promise<PostHogSurveySdk>;

export type FeedbackOpenResult = 'opened' | 'unavailable';

export interface FeedbackClientTimeouts {
  /** Maximum wait for the lazily imported SDK chunk and its initialization. */
  sdkLoadMs: number;
  /** Maximum wait for the survey definition request. */
  surveyLoadMs: number;
  /** Maximum wait between `displaySurvey()` and the `survey shown` event. */
  displayMs: number;
}

const DEFAULT_TIMEOUTS: FeedbackClientTimeouts = {
  sdkLoadMs: 15_000,
  surveyLoadMs: 10_000,
  displayMs: 4_000,
};

/** Resolves to `undefined` when `promise` does not settle in time. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      resolve(undefined);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function findPublishedSurvey(
  sdk: PostHogSurveySdk,
  surveyId: string,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    const settle = (found: boolean) => {
      clearTimeout(timer);
      resolve(found);
    };
    try {
      // The surveys endpoint only returns launched surveys: a draft, archived,
      // or unreachable survey is reported as unavailable instead of failing
      // silently inside `displaySurvey()`.
      sdk.getSurveys((surveys, context) => {
        const survey = surveys.find((candidate) => candidate.id === surveyId);
        settle(context?.isLoaded !== false && survey?.end_date === null);
      }, true);
    } catch {
      settle(false);
    }
  });
}

/** Follows the survey lifecycle from the sanitized events the SDK sends. */
class SurveyDisplayObserver {
  private visible = false;
  private readonly shownWaiters = new Set<() => void>();
  private readonly submittedListeners = new Set<() => void>();

  get isVisible(): boolean {
    return this.visible;
  }

  observe(event: CaptureResult): void {
    if (event.event === 'survey shown') {
      this.visible = true;
      this.shownWaiters.forEach((resolve) => {
        resolve();
      });
      this.shownWaiters.clear();
    } else if (event.event === 'survey dismissed') {
      this.visible = false;
    } else if (event.event === 'survey sent' && event.properties.$survey_completed === true) {
      // The PostHog thank-you screen may still be visible; a later click
      // displays a fresh survey.
      this.visible = false;
      this.submittedListeners.forEach((listener) => {
        listener();
      });
    }
  }

  waitForShown(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const onShown = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.shownWaiters.delete(onShown);
        resolve(false);
      }, timeoutMs);
      this.shownWaiters.add(onShown);
    });
  }

  onSubmitted(listener: () => void): () => void {
    this.submittedListeners.add(listener);
    return () => {
      this.submittedListeners.delete(listener);
    };
  }
}

/**
 * The only PostHog integration point of Paralleax. It loads the SDK after an
 * explicit request, opens the configured survey, and never rejects.
 */
export class PostHogFeedbackClient {
  isConfigured: boolean;
  private readonly observer = new SurveyDisplayObserver();
  private sdkPromise: Promise<PostHogSurveySdk> | undefined;

  constructor(
    private readonly loadSdk: PostHogSdkLoader,
    private readonly config: PostHogFeedbackConfig | null,
    private readonly timeouts: FeedbackClientTimeouts = DEFAULT_TIMEOUTS,
  ) {
    this.isConfigured = config !== null;
  }

  async openFeedback(language: string, context: Properties): Promise<FeedbackOpenResult> {
    if (this.config === null) {
      return 'unavailable';
    }
    try {
      return await this.display(this.config, language, context);
    } catch {
      return 'unavailable';
    }
  }

  /**
   * Notifies when a completed response is handed to the SDK. Delivery is not
   * confirmed: the SDK batches and retries the request, so callers thank the
   * user without claiming the response was received.
   */
  onSubmitted(listener: () => void): () => void {
    return this.observer.onSubmitted(listener);
  }

  private async display(
    config: PostHogFeedbackConfig,
    language: string,
    context: Properties,
  ): Promise<FeedbackOpenResult> {
    // A stalled chunk download must not keep the button busy indefinitely; a
    // later click awaits the same load again.
    const sdk = await withTimeout(this.load(config, language), this.timeouts.sdkLoadMs);
    if (sdk === undefined) {
      return 'unavailable';
    }
    sdk.set_config({ override_display_language: language });
    if (this.observer.isVisible) {
      return 'opened';
    }
    if (!(await findPublishedSurvey(sdk, config.surveyId, this.timeouts.surveyLoadMs))) {
      return 'unavailable';
    }
    const shown = this.observer.waitForShown(this.timeouts.displayMs);
    sdk.displaySurvey(config.surveyId, {
      displayType: 'popover',
      ignoreConditions: true,
      ignoreDelay: true,
      properties: context,
    });
    return (await shown) ? 'opened' : 'unavailable';
  }

  private load(config: PostHogFeedbackConfig, language: string): Promise<PostHogSurveySdk> {
    const beforeSend = (captured: CaptureResult | null): CaptureResult | null => {
      const sanitized = sanitizeFeedbackEvent(captured, config.surveyId);
      if (sanitized !== null) {
        this.observer.observe(sanitized);
      }
      return sanitized;
    };
    this.sdkPromise ??= this.loadSdk(
      config.projectToken,
      buildPostHogInitConfig(config, language, beforeSend),
    ).catch((caught: unknown) => {
      this.sdkPromise = undefined;
      throw caught;
    });
    return this.sdkPromise;
  }
}

const loadPostHogSdk: PostHogSdkLoader = async (projectToken, initConfig) => {
  // The survey renderer registers itself before init so that no external
  // script is requested.
  const [{ default: posthog }] = await Promise.all([
    import('posthog-js/no-external'),
    import('posthog-js/dist/surveys'),
  ]);
  return posthog.init(projectToken, initConfig);
};

export const postHogFeedbackClient = new PostHogFeedbackClient(
  loadPostHogSdk,
  postHogFeedbackConfig,
);
