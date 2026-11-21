import { useTranslation } from 'react-i18next';
import type { Interaction } from '@paralleax/shared';
import { ChoiceLabelErrorIcon } from '../../story/ChoiceLabelError';
import { InteractionLabel } from '../../story/InteractionLabel';
import { simulationTitleHint } from '../../story/interactionTitlePresentation';
import type { SimulationArrival } from '../simulation/useSimulationArrivals';

/** The current Interaction's title, edited in place during Simulation. */
export function SimulationInteractionTitle({
  interaction,
  arrival,
  onChange,
  onSave,
}: {
  interaction: Interaction;
  arrival: SimulationArrival | undefined;
  onChange: (title: string) => void;
  onSave: (title: string) => void;
}) {
  const { t } = useTranslation();
  const { hint, needsLabel } = simulationTitleHint(arrival, t);
  const showError = needsLabel && !interaction.title.trim();
  const title = (
    <InteractionLabel
      label={interaction.title}
      className={`player-interaction-label simulation-title-input${
        showError ? ' choice-label-error' : ''
      }`}
      editable={{
        'aria-label': t('player.currentInteractionTitle'),
        'aria-invalid': showError ? true : undefined,
        placeholder: hint,
        value: interaction.title,
        onChange: (event) => {
          onChange(event.target.value);
        },
        onBlur: (event) => {
          onSave(event.currentTarget.value);
        },
      }}
    />
  );
  // The error icon needs a row beside the input; without it, the input stays a
  // direct child of the player card like the Reader's label.
  return showError ? (
    <div className="simulation-title-error">
      {title}
      <ChoiceLabelErrorIcon />
    </div>
  ) : (
    title
  );
}
