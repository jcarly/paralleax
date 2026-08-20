import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { buildFeedbackHiddenFields } from './feedbackContext';
import { formbricksFeedbackClient } from './formbricksClient';
import './FeedbackButton.css';

export function FeedbackButton() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!formbricksFeedbackClient.isConfigured) return;
    let active = true;
    void formbricksFeedbackClient.setup().then((configured) => {
      if (active) setReady(configured);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void formbricksFeedbackClient.registerRouteChange(language);
  }, [language, location.pathname, location.search, ready]);

  if (!formbricksFeedbackClient.isConfigured || !ready) return null;

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
          .finally(() => setOpening(false));
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 5.75h14v9.5H9l-4 3v-12.5Z" />
        <path d="M8.5 9.5h7M8.5 12.5h4" />
      </svg>
      <span>{t('shell.feedback')}</span>
    </button>
  );
}
