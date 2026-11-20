import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { buildFeedbackContext } from './feedbackContext';
import { postHogFeedbackClient } from './posthogFeedbackClient';
import './FeedbackButton.css';

type FeedbackStatus = 'idle' | 'sent' | 'unavailable';

function useFeedbackSurvey() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [opening, setOpening] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus>('idle');

  useEffect(
    () =>
      postHogFeedbackClient.onSubmitted(() => {
        setStatus('sent');
      }),
    [],
  );

  const open = () => {
    setOpening(true);
    setStatus('idle');
    void postHogFeedbackClient
      .openFeedback(language, buildFeedbackContext(location.pathname, language))
      .then((result) => {
        setStatus(result === 'opened' ? 'idle' : 'unavailable');
      })
      .finally(() => {
        setOpening(false);
      });
  };

  const announcements: Record<FeedbackStatus, string> = {
    idle: '',
    sent: t('shell.feedbackSent'),
    unavailable: t('shell.feedbackUnavailable'),
  };
  return { announcement: announcements[status], label: t('shell.feedback'), open, opening };
}

export function FeedbackButton() {
  const { announcement, label, open, opening } = useFeedbackSurvey();

  if (!postHogFeedbackClient.isConfigured) {
    return null;
  }

  return (
    <>
      <button
        id="paralleax-feedback-button"
        className="product-feedback-button"
        type="button"
        aria-busy={opening}
        disabled={opening}
        onClick={open}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 5.75h14v9.5H9l-4 3v-12.5Z" />
          <path d="M8.5 9.5h7M8.5 12.5h4" />
        </svg>
        <span>{label}</span>
      </button>
      <span aria-live="polite" className="product-feedback-status">
        {announcement}
      </span>
    </>
  );
}
