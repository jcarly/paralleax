import {
  getItemDescendantIds,
  groupItemInstancesByParent,
  ITEM_RELATIONSHIP_TYPES,
  type ItemDefinition,
  type ItemInstance,
  type ItemRelationshipType,
  type MoveItemInstanceInput,
  type StatDefinition,
} from '@paralleax/shared';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { RemoveRowButton } from './RemoveRowButton';

export function ItemInstanceTree({
  items,
  itemDefinitions,
  statDefinitions,
  rootPlacement,
  onMove,
  onDelete,
}: {
  items: ItemInstance[];
  itemDefinitions: ItemDefinition[];
  statDefinitions?: StatDefinition[];
  rootPlacement: Pick<MoveItemInstanceInput, 'characterId' | 'locationId'>;
  onMove: (itemId: string, placement: MoveItemInstanceInput) => Promise<void>;
  onDelete?: (itemId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const childrenByParent = groupItemInstancesByParent(items);
  const itemIds = new Set(items.map(({ id }) => id));
  const roots = items.filter(({ parentItemId }) => !parentItemId || !itemIds.has(parentItemId));

  const renderItem = (item: ItemInstance, depth: number, ancestors: ReadonlySet<string>) => {
    const definition = itemDefinitions.find(({ id }) => id === item.itemDefinitionId);
    const nextAncestors = new Set([...ancestors, item.id]);
    const descendants = getItemDescendantIds(items, item.id);
    return (
      <li key={item.id} style={{ '--item-depth': depth } as CSSProperties}>
        <div className="item-tree-card">
          <div className="item-tree-title">
            {definition?.imageUrl ? (
              <img className="context-picto" src={definition.imageUrl} alt="" />
            ) : null}
            <strong>{definition?.name ?? t('inspector.unknownItem')}</strong>
            {item.relationshipType ? (
              <small>{t(`inspector.relationshipType.${item.relationshipType}`)}</small>
            ) : null}
          </div>
          {(definition?.stats ?? []).length > 0 ? (
            <ul className="item-stat-list">
              {definition!.stats!.map((stat) => (
                <li key={stat.statDefinitionId}>
                  {statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
                    t('inspector.unknownStat')}
                  : {stat.initialValue}
                </li>
              ))}
            </ul>
          ) : null}
          <label>
            {t('inspector.parent')}
            <select
              aria-label={t('inspector.parentFor', { name: definition?.name ?? item.id })}
              value={item.parentItemId ?? ''}
              onChange={(event) =>
                void onMove(
                  item.id,
                  event.target.value
                    ? {
                        parentItemId: event.target.value,
                        relationshipType: item.relationshipType ?? 'contained',
                        ...(item.slotKey ? { slotKey: item.slotKey } : {}),
                      }
                    : rootPlacement,
                )
              }
            >
              <option value="">{t('inspector.root')}</option>
              {items
                .filter(({ id }) => id !== item.id && !descendants.has(id))
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {itemDefinitions.find(({ id }) => id === candidate.itemDefinitionId)?.name ??
                      t('inspector.unknownItem')}
                  </option>
                ))}
            </select>
          </label>
          {item.parentItemId ? (
            <>
              <label>
                {t('inspector.relationship')}
                <select
                  aria-label={t('inspector.relationshipFor', {
                    name: definition?.name ?? item.id,
                  })}
                  value={item.relationshipType ?? 'contained'}
                  onChange={(event) =>
                    void onMove(item.id, {
                      parentItemId: item.parentItemId,
                      relationshipType: event.target.value as ItemRelationshipType,
                      ...(item.slotKey ? { slotKey: item.slotKey } : {}),
                    })
                  }
                >
                  {ITEM_RELATIONSHIP_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`inspector.relationshipType.${type}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('inspector.slot')}
                <input
                  aria-label={t('inspector.slotFor', { name: definition?.name ?? item.id })}
                  defaultValue={item.slotKey ?? ''}
                  onBlur={(event) =>
                    void onMove(item.id, {
                      parentItemId: item.parentItemId,
                      relationshipType: item.relationshipType ?? 'contained',
                      ...(event.target.value ? { slotKey: event.target.value } : {}),
                    })
                  }
                />
              </label>
            </>
          ) : null}
          {onDelete ? (
            <RemoveRowButton
              label={t('inspector.deleteItemInstance')}
              onRemove={() => void onDelete(item.id)}
            />
          ) : null}
        </div>
        {depth < 12 && (childrenByParent.get(item.id)?.length ?? 0) > 0 ? (
          <ul>
            {childrenByParent
              .get(item.id)!
              .filter(({ id }) => !nextAncestors.has(id))
              .map((child) => renderItem(child, depth + 1, nextAncestors))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul className="item-instance-tree">{roots.map((item) => renderItem(item, 0, new Set()))}</ul>
  );
}
