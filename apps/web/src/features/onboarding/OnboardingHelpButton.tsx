import { useTranslation } from 'react-i18next';
import { useOnboarding } from './onboardingContext';
import './OnboardingHelpButton.css';

export function OnboardingHelpButton({ storyId }: { storyId?: string }) {
  const { t } = useTranslation();
  const { openHelp } = useOnboarding();

  return (
    <button className="product-help-button" type="button" onClick={() => openHelp(storyId)}>
      {t('shell.help')}
    </button>
  );
}
