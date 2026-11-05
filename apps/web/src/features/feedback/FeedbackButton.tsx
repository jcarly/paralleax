import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { buildFeedbackHiddenFields } from './feedbackContext';
import { formbricksFeedbackClient } from './formbricksClient';
import './FeedbackButton.css';

export function FeedbackButton() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [opening, setOpening] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  if (!formbricksFeedbackClient.isConfigured) return null;

  return (
    <button
      id="paralleax-feedback-button"
      className="product-feedback-button"
      type="button"
      aria-busy={opening}
      disabled={opening}
      onClick={() => {
        setOpening(true);
        void formbricksFeedbackClient
          .trackFeedback(language, buildFeedbackHiddenFields(location.pathname, language))
          .then((opened) => setUnavailable(!opened))
          .finally(() => setOpening(false));
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 5.75h14v9.5H9l-4 3v-12.5Z" />
        <path d="M8.5 9.5h7M8.5 12.5h4" />
      </svg>
      <span>{t('shell.feedback')}</span>
      <span aria-live="polite" className="visually-hidden">
        {unavailable ? t('shell.feedbackUnavailable') : ''}
      </span>
    </button>
  );
}
