import type {
  ItemDefinition,
  ItemInstance,
  ItemRelationshipType,
  MoveItemInstanceInput,
  StatDefinition,
} from '@paralleax/shared';
import type { CSSProperties } from 'react';
import { RemoveRowButton } from './RemoveRowButton';

const relationshipTypes: ItemRelationshipType[] = [
  'contained',
  'equipped',
  'attached',
  'part_of',
  'installed',
  'worn',
  'held',
];

export function ItemInstanceTree({
  items,
  itemDefinitions,
  statDefinitions,
  rootCharacterId,
  onMove,
  onDelete,
}: {
  items: ItemInstance[];
  itemDefinitions: ItemDefinition[];
  statDefinitions?: StatDefinition[];
  rootCharacterId: string;
  onMove: (itemId: string, placement: MoveItemInstanceInput) => Promise<void>;
  onDelete?: (itemId: string) => Promise<void>;
}) {
  const childrenByParent = new Map<string, ItemInstance[]>();
  for (const item of items) {
    if (!item.parentItemId) continue;
    childrenByParent.set(item.parentItemId, [
      ...(childrenByParent.get(item.parentItemId) ?? []),
      item,
    ]);
  }
  const itemIds = new Set(items.map(({ id }) => id));
  const roots = items.filter(({ parentItemId }) => !parentItemId || !itemIds.has(parentItemId));

  const renderItem = (item: ItemInstance, depth: number, ancestors: ReadonlySet<string>) => {
    const definition = itemDefinitions.find(({ id }) => id === item.itemDefinitionId);
    const nextAncestors = new Set([...ancestors, item.id]);
    const descendants = collectDescendants(item.id, childrenByParent);
    return (
      <li key={item.id} style={{ '--item-depth': depth } as CSSProperties}>
        <div className="item-tree-card">
          <div className="item-tree-title">
            {definition?.imageUrl ? (
              <img className="context-picto" src={definition.imageUrl} alt="" />
            ) : null}
            <strong>{definition?.name ?? 'Unknown item'}</strong>
            {item.relationshipType ? <small>{item.relationshipType}</small> : null}
          </div>
          {(definition?.stats ?? []).length > 0 ? (
            <ul className="item-stat-list">
              {definition!.stats!.map((stat) => (
                <li key={stat.statDefinitionId}>
                  {statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
                    'Unknown stat'}
                  : {stat.initialValue}
                </li>
              ))}
            </ul>
          ) : null}
          <label>
            Parent
            <select
              aria-label={`Parent for ${definition?.name ?? item.id}`}
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
                    : { characterId: rootCharacterId },
                )
              }
            >
              <option value="">Root</option>
              {items
                .filter(({ id }) => id !== item.id && !descendants.has(id))
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {itemDefinitions.find(({ id }) => id === candidate.itemDefinitionId)?.name ??
                      'Unknown item'}
                  </option>
                ))}
            </select>
          </label>
          {item.parentItemId ? (
            <>
              <label>
                Relationship
                <select
                  aria-label={`Relationship for ${definition?.name ?? item.id}`}
                  value={item.relationshipType ?? 'contained'}
                  onChange={(event) =>
                    void onMove(item.id, {
                      parentItemId: item.parentItemId,
                      relationshipType: event.target.value as ItemRelationshipType,
                      ...(item.slotKey ? { slotKey: item.slotKey } : {}),
                    })
                  }
                >
                  {relationshipTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Slot
                <input
                  aria-label={`Slot for ${definition?.name ?? item.id}`}
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
            <RemoveRowButton label="Delete item instance" onRemove={() => void onDelete(item.id)} />
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

function collectDescendants(itemId: string, childrenByParent: ReadonlyMap<string, ItemInstance[]>) {
  const descendants = new Set<string>();
  const pending = [...(childrenByParent.get(itemId) ?? [])];
  while (pending.length > 0) {
    const child = pending.pop()!;
    if (descendants.has(child.id)) continue;
    descendants.add(child.id);
    pending.push(...(childrenByParent.get(child.id) ?? []));
  }
  return descendants;
}
