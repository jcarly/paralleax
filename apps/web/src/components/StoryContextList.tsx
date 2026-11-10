import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ContextThumbnail({
  imageUrl,
  fallback,
  className = '',
}: {
  imageUrl?: string;
  fallback: string;
  className?: string;
}) {
  const classes = `context-picto ${className}`.trim();
  return imageUrl ? (
    <img className={classes} src={imageUrl} alt="" />
  ) : (
    <span className={`${classes} context-picto-placeholder`} aria-hidden="true">
      {fallback}
    </span>
  );
}

export function ContextEntityRow({
  name,
  metadata,
  imageUrl,
  fallback,
  selected,
  onSelect,
  action,
}: {
  name: string;
  metadata: ReactNode;
  imageUrl?: string;
  fallback: string;
  selected: boolean;
  onSelect: () => void;
  action?: ReactNode;
}) {
  return (
    <li className="context-entity-row">
      <button
        type="button"
        aria-label={name}
        className={`context-entity-select ${selected ? 'selected' : 'ghost'}`}
        onClick={onSelect}
      >
        <ContextThumbnail imageUrl={imageUrl} fallback={fallback} />
        <span className="context-row-copy">
          <strong>{name}</strong>
          <small>{metadata}</small>
        </span>
      </button>
      {action}
    </li>
  );
}

export function ContextCommentButton({
  count,
  entityName,
  onClick,
}: {
  count: number;
  entityName: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (count < 1) {
    return null;
  }
  return (
    <button
      className="context-comment-badge"
      type="button"
      aria-label={`${t('comments.openForEntity')}: ${entityName}`}
      onClick={onClick}
    >
      <span aria-hidden="true">◆</span>
      {count}
    </button>
  );
}

function groupContextEntities<T extends { id: string; category?: string }>(items: T[]) {
  const groups = new Map<string | undefined, T[]>();
  for (const item of items) {
    const category = item.category?.trim() || undefined;
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === uncategorizedLabel) {
        return 1;
      }
      if (right === uncategorizedLabel) {
        return -1;
      }
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
  const groups = groupContextEntities(items);
  const hasNamedCategories = groups.some(({ category }) => category !== undefined);
  return (
    <div className="context-category-list">
      {groups.map(({ category, items: groupedItems }) => {
        const showHeading = category !== undefined || hasNamedCategories;
        const groupKey = category === undefined ? 'uncategorized-group' : `category:${category}`;
        const listClassName = showHeading
          ? 'context-entity-list'
          : 'context-entity-list context-entity-list--without-category';
        return (
          <section className="context-category-group" key={groupKey}>
            {showHeading ? (
              <div className="context-category-heading">
                <span>{category ?? t('editor.uncategorized')}</span>
                <small>{groupedItems.length}</small>
              </div>
            ) : null}
            <ul className={listClassName}>{groupedItems.map(renderItem)}</ul>
          </section>
        );
      })}
    </div>
  );
}
