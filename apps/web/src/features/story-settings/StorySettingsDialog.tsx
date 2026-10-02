import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { handleModalDialogKeyDown } from '../../components/modalDialogKeyboard';
import { StoryAccessSettings } from './StoryAccessSettings';
import '../../pages/ProductPages.css';
import './storySettings.css';

export type StorySettingsTab = 'properties' | 'access';

interface StorySettingsDialogProps {
  storyId: string;
  startDateTime: string;
  initialTab: StorySettingsTab;
  canManageAccess: boolean;
  onSaveStartDateTime: (startDateTime: string) => Promise<boolean>;
  onClose: () => void;
}

export function StorySettingsDialog({
  storyId,
  startDateTime,
  initialTab,
  canManageAccess,
  onSaveStartDateTime,
  onClose,
}: StorySettingsDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [draftStartDateTime, setDraftStartDateTime] = useState(startDateTime);
  const [propertiesStatus, setPropertiesStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const tabs: StorySettingsTab[] = canManageAccess ? ['properties', 'access'] : ['properties'];

  async function saveProperties() {
    if (propertiesStatus === 'saving' || draftStartDateTime === startDateTime) return;
    setPropertiesStatus('saving');
    setPropertiesStatus((await onSaveStartDateTime(draftStartDateTime)) ? 'saved' : 'error');
  }

  return (
    <div className="modal-backdrop product-page" role="presentation">
      <section
        className="new-story-dialog story-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-settings-title"
        onKeyDown={(event) => handleModalDialogKeyDown(event, onClose)}
      >
        <header className="story-settings-header">
          <span className="story-settings-heading-icon" aria-hidden="true">
            <StorySettingsIcon />
          </span>
          <div>
            <span className="product-eyebrow">{t('storySettings.eyebrow')}</span>
            <h2 id="story-settings-title">{t('storySettings.title')}</h2>
            <p>{t('storySettings.description')}</p>
          </div>
          <button
            className="product-ghost compact story-settings-close"
            type="button"
            aria-label={t('storySettings.close')}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="story-settings-tabs" role="tablist" aria-label={t('storySettings.tabs')}>
          {tabs.map((tab) => (
            <button
              key={tab}
              id={`story-settings-${tab}-tab`}
              type="button"
              role="tab"
              aria-controls={`story-settings-${tab}-panel`}
              aria-selected={activeTab === tab}
              className={activeTab === tab ? 'active' : ''}
              autoFocus={initialTab === 'access' && tab === 'access'}
              onClick={() => setActiveTab(tab)}
            >
              {t(`storySettings.${tab}`)}
            </button>
          ))}
        </div>
        <div className="story-settings-content">
          {activeTab === 'properties' ? (
            <section
              id="story-settings-properties-panel"
              role="tabpanel"
              aria-labelledby="story-settings-properties-tab"
              className="story-settings-properties"
            >
              <h3>{t('storySettings.properties')}</h3>
              <p>{t('storySettings.propertiesDescription')}</p>
              <div className="story-settings-properties-fields">
                <label className="product-field">
                  <span>{t('editor.storyStartDateTime')}</span>
                  <input
                    autoFocus
                    type="datetime-local"
                    aria-describedby="story-settings-start-date-time-help"
                    value={draftStartDateTime}
                    disabled={propertiesStatus === 'saving'}
                    onChange={(event) => {
                      setDraftStartDateTime(event.target.value);
                      setPropertiesStatus('idle');
                    }}
                    onBlur={() => void saveProperties()}
                  />
                </label>
                <small id="story-settings-start-date-time-help">
                  {t('storySettings.startDateTimeHelp')}
                </small>
                {propertiesStatus === 'saving' ? (
                  <p className="product-help" role="status">
                    {t('storySettings.saving')}
                  </p>
                ) : null}
                {propertiesStatus === 'error' ? (
                  <p className="form-error" role="alert">
                    {t('storySettings.saveFailed')}
                  </p>
                ) : null}
                {propertiesStatus === 'saved' ? (
                  <p className="form-success" role="status">
                    {t('storySettings.saved')}
                  </p>
                ) : null}
              </div>
            </section>
          ) : canManageAccess ? (
            <section
              id="story-settings-access-panel"
              role="tabpanel"
              aria-labelledby="story-settings-access-tab"
            >
              <StoryAccessSettings storyId={storyId} />
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function StorySettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.08A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1A1.7 1.7 0 0 0 2.4 13H2V9h.08A1.7 1.7 0 0 0 3.6 7.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.06 2.7l.06.06A1.7 1.7 0 0 0 8 3.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V1h4v.08A1.7 1.7 0 0 0 14.9 2.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.3 7a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4H21a1.7 1.7 0 0 0-1.6 1.05A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}
