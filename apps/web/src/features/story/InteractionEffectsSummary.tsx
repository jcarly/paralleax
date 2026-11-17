import { useTranslation } from 'react-i18next';
import type { Interaction, Story } from '@paralleax/shared';
import { getInteractionEffectSummaries } from './interactionEffectSummaries';

export function InteractionEffectsSummary({
  story,
  interaction,
  className = '',
}: {
  story: Story;
  interaction: Interaction;
  className?: string;
}) {
  const { t } = useTranslation();
  const effects = getInteractionEffectSummaries(story, interaction, t);
  if (effects.length === 0) {
    return null;
  }

  return (
    <ul
      className={`interaction-effects-summary ${className}`.trim()}
      aria-label={t('interactionInspector.effects')}
    >
      {effects.map((effect) => (
        <li key={effect.id}>
          <i className="interaction-effects-summary-icon" aria-hidden="true">
            {effect.kind === 'stat' ? 'Δ' : '◇'}
          </i>
          {effect.label}
        </li>
      ))}
    </ul>
  );
}
