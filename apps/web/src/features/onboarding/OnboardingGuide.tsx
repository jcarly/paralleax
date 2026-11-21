import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useOnboarding } from './onboardingContext';
import { OnboardingGuideOverlay } from './OnboardingGuideOverlay';
import type { OnboardingGuideFocus } from './OnboardingGuideOverlay';
import {
  currentOnboardingStep,
  onboardingStepIds,
  type OnboardingStatus,
  type OnboardingStepId,
} from './onboardingProgress';
import './OnboardingGuide.css';

interface GuideRoute {
  storyId: string | null;
  isLibrary: boolean;
  isEditor: boolean;
  isSimulation: boolean;
}

const storyRoutePattern = /^\/stories\/([^/]+)\/(edit|play)\/?$/;

function readGuideRoute(pathname: string, search: string): GuideRoute {
  const match = pathname.match(storyRoutePattern);
  return {
    storyId: match?.[1] ?? null,
    isLibrary: pathname === '/' || pathname === '/stories',
    isEditor: match?.[2] === 'edit',
    isSimulation: match?.[2] === 'play' && new URLSearchParams(search).get('mode') === 'simulation',
  };
}

function isGuideVisible(
  status: OnboardingStatus,
  storyId: string | null,
  route: GuideRoute,
): boolean {
  return (
    (status === 'active' || status === 'complete') &&
    (route.isLibrary || route.storyId === storyId || (!storyId && route.storyId === null))
  );
}

function canShowStep(route: GuideRoute): boolean {
  return route.isEditor;
}

type GuideView =
  | { kind: 'hidden' }
  | {
      kind: 'prompt';
      focus: OnboardingGuideFocus;
      message: 'createStoryPrompt' | 'openStoryPrompt' | 'returnToEditorPrompt';
      storyId?: string;
      showStoryLink?: boolean;
    }
  | { kind: 'step'; focus: OnboardingGuideFocus; storyId: string; step: OnboardingStepId };

function resolveGuideView(
  progress: ReturnType<typeof useOnboarding>['progress'],
  step: OnboardingStepId | null,
  route: GuideRoute,
): GuideView {
  // Simulation stays uncovered: the guide closes when the author starts testing.
  if (route.isSimulation || !isGuideVisible(progress.status, progress.storyId, route)) {
    return { kind: 'hidden' };
  }
  if (!progress.storyId) {
    return { kind: 'prompt', focus: 'create-story', message: 'createStoryPrompt' };
  }
  if (!route.isLibrary && route.storyId !== progress.storyId) {
    return {
      kind: 'prompt',
      focus: null,
      message: 'openStoryPrompt',
      storyId: progress.storyId,
      showStoryLink: true,
    };
  }
  if (step && !canShowStep(route)) {
    return {
      kind: 'prompt',
      focus: null,
      message: 'returnToEditorPrompt',
      storyId: progress.storyId,
      showStoryLink: true,
    };
  }
  if (!step) {
    // Finishing the guide closes it: a first path is not a finished Story.
    return { kind: 'hidden' };
  }
  const focus: OnboardingGuideFocus = step === 'test-story' ? 'test-story-editor' : step;
  return { kind: 'step', focus, storyId: progress.storyId, step };
}

function GuideCloseButton({ label, onPause }: { label: string; onPause: () => void }) {
  return (
    <button aria-label={label} className="onboarding-close" type="button" onClick={onPause}>
      ×
    </button>
  );
}

function GuidePromptCard({
  message,
  storyId,
  showStoryLink = false,
  onPause,
}: {
  message: 'createStoryPrompt' | 'openStoryPrompt' | 'returnToEditorPrompt';
  storyId?: string;
  showStoryLink?: boolean;
  onPause: () => void;
}) {
  const { t } = useTranslation();
  const linkStoryId = storyId ?? '';

  return (
    <aside
      className="onboarding-card"
      role="region"
      aria-labelledby="onboarding-title"
      aria-live="polite"
    >
      <div className="onboarding-card-heading">
        <h2 id="onboarding-title">{t('onboarding.startTitle')}</h2>
        <GuideCloseButton label={t('onboarding.close')} onPause={onPause} />
      </div>
      <p>{t(`onboarding.${message}`)}</p>
      {showStoryLink ? (
        <Link className="onboarding-primary" to={`/stories/${linkStoryId}/edit`}>
          {t('onboarding.openStory')}
        </Link>
      ) : null}
    </aside>
  );
}

function createRestartHandler(onRestart: (storyId?: string) => void, storyId: string) {
  return () => {
    onRestart(storyId);
  };
}

function GuideStepCard({
  step,
  storyId,
  onPause,
  onRestart,
  onSkip,
}: {
  step: OnboardingStepId;
  storyId: string;
  onPause: () => void;
  onRestart: (storyId?: string) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const stepNumber = onboardingStepIds.indexOf(step) + 1;

  return (
    <aside
      className="onboarding-card"
      role="region"
      aria-labelledby="onboarding-title"
      aria-live="polite"
    >
      <div className="onboarding-card-heading">
        <span className="onboarding-step-count">
          {t('onboarding.stepCount', { current: stepNumber, total: onboardingStepIds.length })}
        </span>
        <GuideCloseButton label={t('onboarding.close')} onPause={onPause} />
      </div>
      <h2 id="onboarding-title">{t(`onboarding.steps.${step}.title`)}</h2>
      <p>{t(`onboarding.steps.${step}.description`)}</p>
      <div className="onboarding-card-actions">
        <button className="onboarding-secondary" type="button" onClick={onSkip}>
          {t('onboarding.skipStep')}
        </button>
        <button
          className="onboarding-secondary"
          type="button"
          onClick={createRestartHandler(onRestart, storyId)}
        >
          {t('onboarding.restart')}
        </button>
      </div>
    </aside>
  );
}

const guideExitDurationMs = 180;

/** Keeps the last visible card mounted briefly so closing the guide can fade it out. */
function useGuideExitTransition(view: GuideView) {
  const lastVisibleView = useRef<Exclude<GuideView, { kind: 'hidden' }> | undefined>(undefined);
  const exitTimer = useRef<number | undefined>(undefined);
  const [leavingView, setLeavingView] = useState<GuideView>();

  useEffect(() => {
    if (view.kind !== 'hidden') {
      lastVisibleView.current = view;
      return;
    }
    const last = lastVisibleView.current;
    if (!last) {
      return;
    }
    // Later hidden views (for example the route change to Simulation) must not
    // cancel the exit, so the timer is not tied to this effect's cleanup.
    lastVisibleView.current = undefined;
    setLeavingView(last);
    window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => {
      setLeavingView(undefined);
    }, guideExitDurationMs);
  }, [view]);

  useEffect(
    () => () => {
      window.clearTimeout(exitTimer.current);
    },
    [],
  );

  return view.kind === 'hidden'
    ? { view: leavingView ?? view, leaving: true }
    : { view, leaving: false };
}

/**
 * Choosing the highlighted Simulation entry point is the last step of the guide.
 * The click only records the intent: the step completes once Simulation for that
 * Story has actually opened, so a navigation blocked by a pending save, or
 * cancelled, leaves the guide where it was.
 */
function useCompleteTestOnSimulationLaunch(view: GuideView, route: GuideRoute) {
  const { reportStepComplete } = useOnboarding();
  const requestedLaunch = useRef<string | undefined>(undefined);
  const storyId = view.kind === 'step' && view.step === 'test-story' ? view.storyId : undefined;

  useEffect(() => {
    if (storyId === undefined) {
      return undefined;
    }
    const recordLaunch = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-onboarding-target="simulation-launch"]')
      ) {
        requestedLaunch.current = storyId;
      }
    };
    document.addEventListener('click', recordLaunch, true);
    return () => {
      document.removeEventListener('click', recordLaunch, true);
    };
  }, [storyId]);

  const { isSimulation, storyId: routeStoryId } = route;
  useEffect(() => {
    const requested = requestedLaunch.current;
    if (requested === undefined || (!isSimulation && routeStoryId === requested)) {
      // Still on this Story's editor: the navigation is pending, blocked, or cancelled.
      return;
    }
    requestedLaunch.current = undefined;
    if (isSimulation && routeStoryId === requested) {
      reportStepComplete(requested, 'test-story');
    }
  }, [isSimulation, reportStepComplete, routeStoryId]);
}

export function OnboardingGuide() {
  const { pathname, search } = useLocation();
  const { progress, pause, restart, skipCurrentStep } = useOnboarding();
  const route = useMemo(() => readGuideRoute(pathname, search), [pathname, search]);
  const resolvedView = useMemo(
    () => resolveGuideView(progress, currentOnboardingStep(progress), route),
    [progress, route],
  );
  useCompleteTestOnSimulationLaunch(resolvedView, route);
  const { view, leaving } = useGuideExitTransition(resolvedView);
  if (view.kind === 'hidden') {
    return null;
  }
  if (view.kind === 'prompt') {
    return (
      <OnboardingGuideOverlay focus={view.focus} leaving={leaving}>
        <GuidePromptCard
          message={view.message}
          storyId={view.storyId}
          showStoryLink={view.showStoryLink}
          onPause={pause}
        />
      </OnboardingGuideOverlay>
    );
  }
  return (
    <OnboardingGuideOverlay focus={leaving ? null : view.focus} leaving={leaving}>
      <GuideStepCard
        step={view.step}
        storyId={view.storyId}
        onPause={pause}
        onRestart={restart}
        onSkip={skipCurrentStep}
      />
    </OnboardingGuideOverlay>
  );
}

export default OnboardingGuide;
