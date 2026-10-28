import type { Character, ItemDefinition, Location, StatDefinition } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import {
  CategorizedContextList,
  ContextCommentButton,
  ContextEntityRow,
} from '../../../components/StoryContextList';
import { StoryContextSectionHeader } from './StoryContextSectionHeader';

interface EntitySectionProps<T extends { id: string; category?: string }> {
  items: T[];
  count: number;
  open: boolean;
  selectedId?: string;
  referenceCounts: ReadonlyMap<string, number>;
  commentCounts: ReadonlyMap<string, number>;
  onToggle: () => void;
  onAdd?: () => void;
  onSelect: (id: string) => void;
  onOpenComments: (id: string) => void;
}

function countLabel(
  t: ReturnType<typeof useTranslation>['t'],
  count: number,
  entity: 'location' | 'character' | 'stat' | 'item' | 'interaction' | 'assignment' | 'instance',
) {
  return t(`editor.count.${entity}`, { count });
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase();
}

export function LocationContextSection(props: EntitySectionProps<Location>) {
  const { t } = useTranslation();

  return (
    <>
      <StoryContextSectionHeader
        title={t('editor.locations')}
        count={props.count}
        countLabel={countLabel(t, props.count, 'location')}
        expanded={props.open}
        onToggle={props.onToggle}
        add={
          props.onAdd
            ? { accessibleName: t('editor.addLocation'), onClick: props.onAdd }
            : undefined
        }
      />
      {!props.open ? null : props.items.length === 0 ? (
        <p className="hint">{t('editor.noLocations')}</p>
      ) : (
        <CategorizedContextList
          items={props.items}
          renderItem={(location) => (
            <ContextEntityRow
              key={location.id}
              name={location.name}
              imageUrl={location.imageUrl}
              fallback="⌖"
              selected={location.id === props.selectedId}
              metadata={countLabel(t, props.referenceCounts.get(location.id) ?? 0, 'interaction')}
              onSelect={() => props.onSelect(location.id)}
              action={
                <ContextCommentButton
                  count={props.commentCounts.get(`location:${location.id}`) ?? 0}
                  entityName={location.name}
                  onClick={() => props.onOpenComments(location.id)}
                />
              }
            />
          )}
        />
      )}
    </>
  );
}

export function CharacterContextSection(props: EntitySectionProps<Character>) {
  const { t } = useTranslation();

  return (
    <>
      <StoryContextSectionHeader
        title={t('editor.characters')}
        count={props.count}
        countLabel={countLabel(t, props.count, 'character')}
        expanded={props.open}
        onToggle={props.onToggle}
        add={
          props.onAdd
            ? { accessibleName: t('editor.addCharacter'), onClick: props.onAdd }
            : undefined
        }
      />
      {!props.open ? null : props.items.length === 0 ? (
        <p className="hint">{t('editor.noCharacters')}</p>
      ) : (
        <CategorizedContextList
          items={props.items}
          renderItem={(character) => (
            <ContextEntityRow
              key={character.id}
              name={character.name}
              imageUrl={character.imageUrl}
              fallback={getInitials(character.name)}
              selected={character.id === props.selectedId}
              metadata={
                <>
                  {character.isPlayable ? `${t('editor.playable')} · ` : ''}
                  {countLabel(t, props.referenceCounts.get(character.id) ?? 0, 'interaction')}
                </>
              }
              onSelect={() => props.onSelect(character.id)}
              action={
                <ContextCommentButton
                  count={props.commentCounts.get(`character:${character.id}`) ?? 0}
                  entityName={character.name}
                  onClick={() => props.onOpenComments(character.id)}
                />
              }
            />
          )}
        />
      )}
    </>
  );
}

export function StatDefinitionContextSection(props: EntitySectionProps<StatDefinition>) {
  const { t } = useTranslation();

  return (
    <>
      <StoryContextSectionHeader
        title={t('attributes.title')}
        count={props.count}
        countLabel={countLabel(t, props.count, 'stat')}
        expanded={props.open}
        onToggle={props.onToggle}
        add={
          props.onAdd
            ? { accessibleName: t('editor.addStatDefinition'), onClick: props.onAdd }
            : undefined
        }
      />
      {!props.open ? null : props.items.length === 0 ? (
        <p className="hint">{t('editor.noStats')}</p>
      ) : (
        <CategorizedContextList
          items={props.items}
          renderItem={(definition) => (
            <ContextEntityRow
              key={definition.id}
              name={definition.name}
              imageUrl={definition.imageUrl}
              fallback="↗"
              selected={definition.id === props.selectedId}
              metadata={
                <>
                  {t(`attributes.type.${definition.valueType ?? 'number'}`)} ·{' '}
                  {countLabel(t, props.referenceCounts.get(definition.id) ?? 0, 'assignment')}
                </>
              }
              onSelect={() => props.onSelect(definition.id)}
              action={
                <ContextCommentButton
                  count={props.commentCounts.get(`statDefinition:${definition.id}`) ?? 0}
                  entityName={definition.name}
                  onClick={() => props.onOpenComments(definition.id)}
                />
              }
            />
          )}
        />
      )}
    </>
  );
}

export function ItemDefinitionContextSection(props: EntitySectionProps<ItemDefinition>) {
  const { t } = useTranslation();

  return (
    <>
      <StoryContextSectionHeader
        title={t('editor.items')}
        count={props.count}
        countLabel={countLabel(t, props.count, 'item')}
        expanded={props.open}
        onToggle={props.onToggle}
        add={
          props.onAdd
            ? { accessibleName: t('editor.addItemDefinition'), onClick: props.onAdd }
            : undefined
        }
      />
      {!props.open ? null : props.items.length === 0 ? (
        <p className="hint">{t('editor.noItems')}</p>
      ) : (
        <CategorizedContextList
          items={props.items}
          renderItem={(definition) => (
            <ContextEntityRow
              key={definition.id}
              name={definition.name}
              imageUrl={definition.imageUrl}
              fallback="▣"
              selected={definition.id === props.selectedId}
              metadata={countLabel(t, props.referenceCounts.get(definition.id) ?? 0, 'instance')}
              onSelect={() => props.onSelect(definition.id)}
              action={
                <ContextCommentButton
                  count={props.commentCounts.get(`itemDefinition:${definition.id}`) ?? 0}
                  entityName={definition.name}
                  onClick={() => props.onOpenComments(definition.id)}
                />
              }
            />
          )}
        />
      )}
    </>
  );
}
