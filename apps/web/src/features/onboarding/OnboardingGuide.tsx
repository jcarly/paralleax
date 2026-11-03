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
    status === 'active' &&
    (route.isLibrary || route.storyId === storyId || (!storyId && route.storyId === null))
  );
}

function canShowStep(step: OnboardingStepId, route: GuideRoute): boolean {
  return step === 'test-story' ? route.isEditor || route.isSimulation : route.isEditor;
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
  | { kind: 'complete'; storyId: string }
  | { kind: 'step'; focus: OnboardingGuideFocus; storyId: string; step: OnboardingStepId };

function resolveGuideView(
  progress: ReturnType<typeof useOnboarding>['progress'],
  step: OnboardingStepId | null,
  route: GuideRoute,
): GuideView {
  if (!isGuideVisible(progress.status, progress.storyId, route)) {
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
  if (step && !canShowStep(step, route)) {
    return {
      kind: 'prompt',
      focus: null,
      message: 'returnToEditorPrompt',
      storyId: progress.storyId,
      showStoryLink: true,
    };
  }
  if (!step) {
    return { kind: 'complete', storyId: progress.storyId };
  }
  const focus: OnboardingGuideFocus =
    step === 'test-story'
      ? route.isSimulation
        ? 'test-story-simulation'
        : 'test-story-editor'
      : step;
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

function GuideCompleteCard({
  storyId,
  onPause,
  onRestart,
}: {
  storyId: string;
  onPause: () => void;
  onRestart: (storyId?: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <aside className="onboarding-card" aria-labelledby="onboarding-title" aria-live="polite">
      <div className="onboarding-card-heading">
        <h2 id="onboarding-title">{t('onboarding.completeTitle')}</h2>
        <GuideCloseButton label={t('onboarding.close')} onPause={onPause} />
      </div>
      <p>{t('onboarding.completeDescription')}</p>
      <button className="onboarding-secondary" type="button" onClick={() => onRestart(storyId)}>
        {t('onboarding.restart')}
      </button>
    </aside>
  );
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
        <button className="onboarding-secondary" type="button" onClick={() => onRestart(storyId)}>
          {t('onboarding.restart')}
        </button>
      </div>
    </aside>
  );
}

export function OnboardingGuide() {
  const location = useLocation();
  const { progress, pause, restart, skipCurrentStep } = useOnboarding();
  const step = currentOnboardingStep(progress);
  const route = readGuideRoute(location.pathname, location.search);
  const view = resolveGuideView(progress, step, route);
  if (view.kind === 'hidden') {
    return null;
  }
  if (view.kind === 'prompt') {
    return (
      <OnboardingGuideOverlay focus={view.focus}>
        <GuidePromptCard
          message={view.message}
          storyId={view.storyId}
          showStoryLink={view.showStoryLink}
          onPause={pause}
        />
      </OnboardingGuideOverlay>
    );
  }
  if (view.kind === 'complete') {
    return (
      <OnboardingGuideOverlay focus={null}>
        <GuideCompleteCard storyId={view.storyId} onPause={pause} onRestart={restart} />
      </OnboardingGuideOverlay>
    );
  }
  return (
    <OnboardingGuideOverlay focus={view.focus}>
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
