import { useTranslation } from 'react-i18next';

/**
 * Error marker for a choice that needs a label. It sits inside buttons and graph
 * nodes, so it is a described image rather than a nested tooltip button.
 */
export function ChoiceLabelErrorIcon() {
  const { t } = useTranslation();
  const message = t('player.choiceLabelNeeded');
  return (
    <span className="choice-label-error-icon" role="img" aria-label={message} title={message}>
      !
    </span>
  );
}
