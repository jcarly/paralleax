import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { currentOnboardingStep, onboardingStepIds } from './onboardingProgress';
import { useOnboarding } from './OnboardingProvider';
import './OnboardingGuide.css';

const storyRoutePattern = /^\/stories\/([^/]+)\/(edit|play)\/?$/;

export function OnboardingHelpButton({ storyId }: { storyId?: string }) {
  const { t } = useTranslation();
  const { openHelp } = useOnboarding();

  return (
    <button className="product-help-button" type="button" onClick={() => openHelp(storyId)}>
      {t('shell.help')}
    </button>
  );
}

export function OnboardingGuide() {
  const { t } = useTranslation();
  const location = useLocation();
  const { progress, pause, restart, skipCurrentStep } = useOnboarding();
  const currentStep = currentOnboardingStep(progress);
  const routeMatch = location.pathname.match(storyRoutePattern);
  const currentRouteStoryId = routeMatch?.[1];
  const onLibrary = location.pathname === '/' || location.pathname === '/stories';
  const onActiveStory = currentRouteStoryId === progress.storyId;
  const isEditorRoute = routeMatch?.[2] === 'edit';
  const isSimulationRoute =
    routeMatch?.[2] === 'play' &&
    new URLSearchParams(location.search).get('mode') === 'simulation';
  const stepCanRunHere =
    currentStep === 'test-story'
      ? isEditorRoute || isSimulationRoute
      : isEditorRoute;
  const visible =
    progress.status === 'active' &&
    (onLibrary || onActiveStory || (!progress.storyId && routeMatch === null));

  if (!visible) return null;

  if (!progress.storyId) {
    return (
      <aside className="onboarding-card" role="region" aria-labelledby="onboarding-title" aria-live="polite">
        <div className="onboarding-card-heading">
          <h2 id="onboarding-title">{t('onboarding.startTitle')}</h2>
          <button
            aria-label={t('onboarding.close')}
            className="onboarding-close"
            type="button"
            onClick={pause}
          >
            ×
          </button>
        </div>
        <p>{t('onboarding.createStoryPrompt')}</p>
      </aside>
    );
  }

  if (!onActiveStory) {
    return (
      <aside className="onboarding-card" role="region" aria-labelledby="onboarding-title" aria-live="polite">
        <div className="onboarding-card-heading">
          <h2 id="onboarding-title">{t('onboarding.startTitle')}</h2>
          <button
            aria-label={t('onboarding.close')}
            className="onboarding-close"
            type="button"
            onClick={pause}
          >
            ×
          </button>
        </div>
        <p>{t('onboarding.openStoryPrompt')}</p>
        <Link className="onboarding-primary" to={`/stories/${progress.storyId}/edit`}>
          {t('onboarding.openStory')}
        </Link>
      </aside>
    );
  }

  if (!stepCanRunHere && currentStep) {
    return (
      <aside className="onboarding-card" role="region" aria-labelledby="onboarding-title" aria-live="polite">
        <div className="onboarding-card-heading">
          <h2 id="onboarding-title">{t('onboarding.startTitle')}</h2>
          <button
            aria-label={t('onboarding.close')}
            className="onboarding-close"
            type="button"
            onClick={pause}
          >
            ×
          </button>
        </div>
        <p>{t('onboarding.returnToEditorPrompt')}</p>
        <Link className="onboarding-primary" to={`/stories/${progress.storyId}/edit`}>
          {t('onboarding.openStory')}
        </Link>
      </aside>
    );
  }

  if (!currentStep) {
    return (
      <aside className="onboarding-card" aria-labelledby="onboarding-title" aria-live="polite">
        <div className="onboarding-card-heading">
          <h2 id="onboarding-title">{t('onboarding.completeTitle')}</h2>
          <button
            aria-label={t('onboarding.close')}
            className="onboarding-close"
            type="button"
            onClick={pause}
          >
            ×
          </button>
        </div>
        <p>{t('onboarding.completeDescription')}</p>
        <button
          className="onboarding-secondary"
          type="button"
          onClick={() => restart(progress.storyId ?? undefined)}
        >
          {t('onboarding.restart')}
        </button>
      </aside>
    );
  }

  const stepNumber = onboardingStepIds.indexOf(currentStep) + 1;
  return (
    <aside className="onboarding-card" role="region" aria-labelledby="onboarding-title" aria-live="polite">
      <div className="onboarding-card-heading">
        <span className="onboarding-step-count">
          {t('onboarding.stepCount', { current: stepNumber, total: onboardingStepIds.length })}
        </span>
        <button
          aria-label={t('onboarding.close')}
          className="onboarding-close"
          type="button"
          onClick={pause}
        >
          ×
        </button>
      </div>
      <h2 id="onboarding-title">{t(`onboarding.steps.${currentStep}.title`)}</h2>
      <p>{t(`onboarding.steps.${currentStep}.description`)}</p>
      <div className="onboarding-card-actions">
        <button className="onboarding-secondary" type="button" onClick={skipCurrentStep}>
          {t('onboarding.skipStep')}
        </button>
        <button
          className="onboarding-secondary"
          type="button"
          onClick={() => restart(progress.storyId ?? undefined)}
        >
          {t('onboarding.restart')}
        </button>
      </div>
    </aside>
  );
}
