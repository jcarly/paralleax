import { useTranslation } from 'react-i18next';
import type { Character, Interaction, StatValue, Story } from '@paralleax/shared';
import { getItemDefinitionIdForInstance, getItemOwnerIdForInstance } from '@paralleax/shared';

export function PlayerContextPanels({
  story,
  current,
  playedCharacter,
  playableCharacterCount,
  statValues,
  ownedItemIds,
  itemStatValues,
  isSimulationMode,
  forceUnavailableOptions,
  onForceUnavailableOptionsChange,
}: {
  story: Story;
  current?: Interaction;
  playedCharacter?: Character;
  playableCharacterCount: number;
  statValues: Record<string, StatValue>;
  ownedItemIds: string[];
  itemStatValues: Record<string, Record<string, StatValue>>;
  isSimulationMode: boolean;
  forceUnavailableOptions: boolean;
  onForceUnavailableOptionsChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {playedCharacter || playableCharacterCount === 0 ? (
        <aside
          className="player-inventory"
          aria-label={t(playedCharacter ? 'player.playedCharacter' : 'player.inventory')}
        >
          {playedCharacter ? (
            <>
              <div className="player-character-profile">
                {playedCharacter.imageUrl ? (
                  <img
                    className="player-character-image"
                    src={playedCharacter.imageUrl}
                    alt={playedCharacter.name}
                  />
                ) : (
                  <span className="player-character-placeholder" aria-hidden="true">
                    {playedCharacter.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <h2>{playedCharacter.name}</h2>
                {playedCharacter.description ? <p>{playedCharacter.description}</p> : null}
              </div>
              <h3>{t('player.stats')}</h3>
              {(playedCharacter.stats ?? []).length === 0 ? (
                <p className="hint">{t('player.noStats')}</p>
              ) : (
                <ul className="player-stat-list">
                  {(playedCharacter.stats ?? []).map((stat) => (
                    <li key={stat.id}>
                      <span className="player-stat-icon" aria-hidden="true">
                        ◇
                      </span>
                      <span>
                        {story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)
                          ?.name ?? t('player.unknownStat')}
                      </span>
                      <strong>: {statValues[stat.id] ?? stat.initialValue}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
          {isSimulationMode ? (
            <section className="simulation-controls">
              <span className="product-eyebrow">{t('player.authorTools')}</span>
              <label>
                <input
                  type="checkbox"
                  checked={forceUnavailableOptions}
                  onChange={(event) => onForceUnavailableOptionsChange(event.target.checked)}
                />
                <span>
                  <b>{t('player.forceUnavailable')}</b>
                  <small>{t('player.forceUnavailableHelp')}</small>
                </span>
              </label>
            </section>
          ) : null}
          {story.itemDefinitions?.length === 0 ? null : (
            <>
              <h2>{t('player.inventory')}</h2>
              {ownedItemIds.filter(
                (itemId) =>
                  !playedCharacter ||
                  getItemOwnerIdForInstance(story, itemId) === playedCharacter.id,
              ).length === 0 ? (
                <p className="hint">{t('player.noItems')}</p>
              ) : (
                <ul className="player-item-list">
                  {ownedItemIds
                    .filter(
                      (itemId) =>
                        !playedCharacter ||
                        getItemOwnerIdForInstance(story, itemId) === playedCharacter.id,
                    )
                    .map((itemId) => {
                      const ownerId = getItemOwnerIdForInstance(story, itemId);
                      const owner = (story.characters ?? []).find(
                        (character) => character.id === ownerId,
                      );
                      const itemDefinitionId = getItemDefinitionIdForInstance(story, itemId);
                      const definition = story.itemDefinitions?.find(
                        ({ id }) => id === itemDefinitionId,
                      );
                      return (
                        <li key={itemId}>
                          {definition?.imageUrl ? (
                            <img className="context-picto" src={definition.imageUrl} alt="" />
                          ) : null}
                          {definition?.name ?? t('player.unknownItem')}
                          {(definition?.stats ?? []).length > 0 ? (
                            <ul className="item-stat-list">
                              {(definition?.stats ?? []).map((stat) => (
                                <li key={stat.statDefinitionId}>
                                  {story.statDefinitions?.find(
                                    ({ id }) => id === stat.statDefinitionId,
                                  )?.name ?? t('player.unknownStat')}
                                  : {itemStatValues[itemId]?.[stat.id] ?? stat.initialValue}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {owner ? <small> — {owner.name}</small> : null}
                        </li>
                      );
                    })}
                </ul>
              )}
            </>
          )}
        </aside>
      ) : null}
      {playedCharacter &&
      current &&
      (current.characterIds ?? []).some((id) => id !== playedCharacter.id) ? (
        <aside className="encounter-panel" aria-label={t('player.encounteredCharacters')}>
          <span className="product-eyebrow">{t('player.currentScene')}</span>
          <h2>{t('player.encounter')}</h2>
          {(current.characterIds ?? [])
            .filter((id) => id !== playedCharacter?.id)
            .map((characterId) => {
              const character = story.characters?.find(({ id }) => id === characterId);
              return character ? (
                <section className="encounter-card" key={character.id}>
                  {character.imageUrl ? (
                    <img src={character.imageUrl} alt={character.name} />
                  ) : (
                    <span className="encounter-placeholder" aria-hidden="true">
                      {character.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <h3>{character.name}</h3>
                  {character.description ? <p>{character.description}</p> : null}
                </section>
              ) : null;
            })}
        </aside>
      ) : null}
    </>
  );
}
