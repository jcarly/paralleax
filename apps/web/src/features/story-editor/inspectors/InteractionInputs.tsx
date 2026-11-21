import { useTranslation } from 'react-i18next';
import type { Interaction, Story } from '@paralleax/shared';
import { getInteractionSources } from './interactionSources';

/**
 * The incoming Interactions, shown above the title so the Inspector reads in
 * story order: where the author comes from, the scene, then the options.
 */
export function InteractionInputs({
  story,
  interaction,
  onSelectInteraction,
}: {
  story: Pick<Story, 'interactions'>;
  interaction: Pick<Interaction, 'triggers'>;
  onSelectInteraction?: (interactionId: string) => void;
}) {
  const { t } = useTranslation();
  const { isStart, sources } = getInteractionSources(story, interaction);
  if (!isStart && sources.length === 0) {
    return null;
  }
  return (
    <ul className="interaction-inspector-inputs" aria-label={t('interactionInspector.inputs')}>
      <li aria-hidden="true" className="interaction-inspector-inputs-arrow">
        ←
      </li>
      {isStart ? (
        <li className="interaction-inspector-input interaction-inspector-input-start">
          {t('interactionInspector.startInput')}
        </li>
      ) : null}
      {sources.map((source) => {
        const title = source.title.trim();
        return (
          <li key={source.id}>
            <button
              className={`interaction-inspector-input${title ? '' : ' interaction-label-fallback'}`}
              type="button"
              onClick={() => onSelectInteraction?.(source.id)}
            >
              {title || t('player.untitledInteraction')}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
