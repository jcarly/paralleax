import type { Character, Location } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { InteractionMetadataIcon } from './InteractionMetadataIcon';

function CharacterAvatar({ character }: { character: Pick<Character, 'name' | 'imageUrl'> }) {
  const initials = character.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase();

  return (
    <span className="interaction-context-avatar" title={character.name} aria-hidden="true">
      {character.imageUrl ? (
        <img className="interaction-context-avatar-image" src={character.imageUrl} alt="" />
      ) : (
        initials
      )}
    </span>
  );
}

function CharacterAvatars({
  characters,
  variant,
}: {
  characters: Array<Pick<Character, 'id' | 'name' | 'imageUrl'>>;
  variant: 'graph' | 'inspector' | 'scene';
}) {
  const { t } = useTranslation();
  const visibleCharacters = characters.slice(0, variant === 'graph' ? 3 : characters.length);

  return (
    <span
      className="interaction-context-characters"
      role="group"
      aria-label={t('graph.charactersPresent', {
        names: characters.map(({ name }) => name).join(', '),
      })}
    >
      {visibleCharacters.map((character) => (
        <span className="interaction-context-character" key={character.id}>
          <CharacterAvatar character={character} />
          {variant === 'inspector' ? (
            <span className="interaction-context-character-name">{character.name}</span>
          ) : null}
        </span>
      ))}
      {variant === 'graph' && characters.length > 3 ? (
        <span
          className="interaction-context-avatar interaction-context-avatar-overflow"
          title={t('graph.moreCharacters', { count: characters.length - 3 })}
          aria-hidden="true"
        >
          +{characters.length - 3}
        </span>
      ) : null}
    </span>
  );
}

export function InteractionContext({
  location,
  characters,
  variant,
}: {
  location?: Pick<Location, 'name'>;
  characters: Array<Pick<Character, 'id' | 'name' | 'imageUrl'>>;
  variant: 'graph' | 'inspector' | 'scene';
}) {
  const { t } = useTranslation();
  if (!location && characters.length === 0) {
    return null;
  }

  return (
    <div className={`interaction-context interaction-context--${variant}`}>
      {location ? (
        <span
          aria-label={`${t('player.location')}: ${location.name}`}
          className="interaction-context-location"
          role="group"
          title={location.name}
        >
          <InteractionMetadataIcon kind="location" className="interaction-context-location-icon" />
          <span>{location.name}</span>
        </span>
      ) : null}
      {characters.length > 0 ? (
        <span className="interaction-context-character-group">
          <InteractionMetadataIcon
            kind="characters"
            className="interaction-context-characters-icon"
          />
          <CharacterAvatars characters={characters} variant={variant} />
        </span>
      ) : null}
    </div>
  );
}
