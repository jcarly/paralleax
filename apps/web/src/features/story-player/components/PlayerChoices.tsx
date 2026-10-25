import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { Interaction, Story, TriggerTimerResult } from '@paralleax/shared';
import { ChoiceTimerBar } from '../ChoiceTimerBar';
import { getConditionSummary } from '../storyPlayerPresentation';

type VisibleChoice = {
  interaction: Interaction;
  available: boolean;
  timerState: TriggerTimerResult | null;
  unavailableReason?: string;
};

type InteractionTitlePatch = Pick<Interaction, 'title'>;

export function PlayerChoices({
  choices,
  editingChoiceId,
  editingChoiceInputRef,
  isSimulationMode,
  forceUnavailableOptions,
  journeyLength,
  currentStepStartedAt,
  story,
  currentInteractionId,
  showEnding,
  onChoose,
  onPatchInteraction,
  onSaveChoiceTitle,
  onAddOption,
}: {
  choices: VisibleChoice[];
  editingChoiceId?: string;
  editingChoiceInputRef: Ref<HTMLInputElement>;
  isSimulationMode: boolean;
  forceUnavailableOptions: boolean;
  journeyLength: number;
  currentStepStartedAt?: string;
  story: Story;
  currentInteractionId?: string;
  showEnding: boolean;
  onChoose: (interaction: Interaction) => void;
  onPatchInteraction: (interactionId: string, patch: InteractionTitlePatch) => void;
  onSaveChoiceTitle: (interaction: Interaction, title: string) => void | Promise<void>;
  onAddOption: () => void | Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <div className="choices">
      {choices.map(({ interaction, available, timerState, unavailableReason }) => (
        <div className="choice-row" key={interaction.id}>
          {timerState ? (
            <ChoiceTimerBar
              key={`${journeyLength}:${interaction.id}:${timerState.triggerId}:${currentStepStartedAt ?? ''}`}
              timer={timerState}
            />
          ) : null}
          {editingChoiceId === interaction.id ? (
            <input
              ref={editingChoiceInputRef}
              className="choice-title-input"
              aria-label={t('player.newOptionTitle')}
              value={interaction.title}
              onChange={(event) =>
                onPatchInteraction(interaction.id, { title: event.target.value })
              }
              onBlur={(event) => void onSaveChoiceTitle(interaction, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button
              className={`choice ${available ? 'available' : 'unavailable'} ${isSimulationMode && !available && forceUnavailableOptions ? 'forced' : ''}`}
              disabled={isSimulationMode && !available && !forceUnavailableOptions}
              onClick={() => onChoose(interaction)}
              title={
                available
                  ? getConditionSummary(story, interaction, currentInteractionId ?? null, t)
                  : (unavailableReason ?? t('player.unavailable'))
              }
            >
              <span className="choice-copy">
                <strong>{interaction.title}</strong>
                {isSimulationMode && !available ? (
                  <small>
                    {unavailableReason ?? t('player.unavailable')}
                    {forceUnavailableOptions ? t('player.forced') : ''}
                  </small>
                ) : null}
              </span>
              <span className="choice-arrow" aria-hidden="true">
                →
              </span>
            </button>
          )}
        </div>
      ))}
      {isSimulationMode ? (
        <button
          className="choice add-option"
          aria-label={t('player.addOption')}
          onClick={() => void onAddOption()}
        >
          <span className="choice-copy">
            <strong>{t('player.addOption')}</strong>
            <small>{t('player.addOptionHelp')}</small>
          </span>
          <span className="choice-arrow" aria-hidden="true">
            ＋
          </span>
        </button>
      ) : null}
      {showEnding ? (
        <div className="ending">
          <span aria-hidden="true">◇</span>
          <div>
            <b>{t('player.branchEnd')}</b>
            <p>{t('player.branchEndHelp')}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
