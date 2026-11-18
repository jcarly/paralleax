import type { Character, Location } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { InteractionContext } from '../../story/InteractionContext';
import { InteractionMetadataIcon } from '../../story/InteractionMetadataIcon';

export function PlayerScene({
  location,
  characters,
  currentDateTime,
}: {
  location?: Pick<Location, 'name' | 'imageUrl'>;
  characters: Array<Pick<Character, 'id' | 'name' | 'imageUrl'>>;
  currentDateTime: string;
}) {
  const { t } = useTranslation();

  return (
    <div className={`player-scene-visual ${location?.imageUrl ? 'with-image' : ''}`}>
      {location?.imageUrl ? (
        <img src={location.imageUrl} alt={location.name} />
      ) : (
        <div className="player-scene-placeholder" aria-hidden="true">
          <span />
          <span />
          <i />
        </div>
      )}
      <div className="player-scene-meta">
        <InteractionContext location={location} characters={characters} variant="scene" />
        <span className="player-scene-time">
          <InteractionMetadataIcon kind="time" className="player-scene-time-icon" />
          <time
            aria-label={`${t('player.storyTime')}: ${currentDateTime.replace('T', ' ')}`}
            dateTime={currentDateTime}
          >
            {currentDateTime.replace('T', ' ')}
          </time>
        </span>
      </div>
    </div>
  );
}
