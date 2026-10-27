import { useTranslation } from 'react-i18next';
import type { Character, Location } from '@paralleax/shared';

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
        <span>
          {location?.name ? (
            <>
              <small>{t('player.location')}</small>
              <b>{location?.name ?? t('player.unknownLocation')}</b>
            </>
          ) : null}
        </span>
        <time dateTime={currentDateTime}>{currentDateTime.replace('T', ' ')}</time>
        {characters.length > 0 ? (
          <span className="scene-character-list" aria-label={t('player.charactersPresent')}>
            {characters.map((character) =>
              character.imageUrl ? (
                <img key={character.id} src={character.imageUrl} alt={character.name} />
              ) : (
                <i key={character.id} title={character.name}>
                  {character.name.slice(0, 2).toUpperCase()}
                </i>
              ),
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
