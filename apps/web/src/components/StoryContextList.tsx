import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ContextThumbnail({ imageUrl, fallback }: { imageUrl?: string; fallback: string }) {
  return imageUrl ? (
    <img className="context-picto" src={imageUrl} alt="" />
  ) : (
    <span className="context-picto context-picto-placeholder" aria-hidden="true">
      {fallback}
    </span>
  );
}

function groupContextEntities<T extends { id: string; category?: string }>(
  items: T[],
  uncategorizedLabel: string,
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const category = item.category?.trim() || uncategorizedLabel;
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === uncategorizedLabel) return 1;
      if (right === uncategorizedLabel) return -1;
      return left.localeCompare(right);
    })
    .map(([category, groupedItems]) => ({ category, items: groupedItems }));
}

export function CategorizedContextList<T extends { id: string; category?: string }>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="context-category-list">
      {groupContextEntities(items, t('editor.uncategorized')).map(
        ({ category, items: groupedItems }) => (
          <section className="context-category-group" key={category}>
            <div className="context-category-heading">
              <span>{category}</span>
              <small>{groupedItems.length}</small>
            </div>
            <ul>{groupedItems.map(renderItem)}</ul>
          </section>
        ),
      )}
    </div>
  );
}
