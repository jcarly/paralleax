import { StorySettingsIcon } from './StorySettingsIcon';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldHelpTooltip } from '../../components/FieldHelpTooltip';
import { handleModalDialogKeyDown } from '../../components/modalDialogKeyboard';
import { ModalPortal } from '../../components/ModalPortal';
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
    if (propertiesStatus === 'saving' || draftStartDateTime === startDateTime) {
      return;
    }
    setPropertiesStatus('saving');
    setPropertiesStatus((await onSaveStartDateTime(draftStartDateTime)) ? 'saved' : 'error');
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop product-page" role="presentation">
        <section
          className="new-story-dialog story-settings-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="story-settings-title"
          onKeyDown={(event) => {
            handleModalDialogKeyDown(event, onClose);
          }}
        >
          <header className="story-settings-header">
            <span className="story-settings-heading-icon" aria-hidden="true">
              <StorySettingsIcon />
            </span>
            <div>
              <h2 id="story-settings-title">{t('storySettings.title')}</h2>
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
                data-modal-autofocus={initialTab === 'access' && tab === 'access' ? '' : undefined}
                onClick={() => {
                  setActiveTab(tab);
                }}
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
                  <div className="form-field form-field--standard">
                    <div className="field-label-with-help">
                      <label htmlFor="story-settings-start-date-time">
                        {t('editor.storyStartDateTime')}
                      </label>
                      <FieldHelpTooltip
                        label={t('editor.storyStartDateTime')}
                        help={t('storySettings.startDateTimeHelp')}
                      />
                    </div>
                    <input
                      className="form-control form-control--standard"
                      id="story-settings-start-date-time"
                      autoFocus
                      data-modal-autofocus
                      type="datetime-local"
                      value={draftStartDateTime}
                      disabled={propertiesStatus === 'saving'}
                      onChange={(event) => {
                        setDraftStartDateTime(event.target.value);
                        setPropertiesStatus('idle');
                      }}
                      onBlur={() => void saveProperties()}
                    />
                  </div>
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
    </ModalPortal>
  );
}
