import { useTranslation } from 'react-i18next';

export interface StoryContextSectionHeaderProps {
  title: string;
  count: number;
  countLabel: string;
  expanded: boolean;
  onToggle: () => void;
  toggleDisabled?: boolean;
  divider?: boolean;
  add?: {
    accessibleName: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

export function StoryContextSectionHeader({
  title,
  count,
  countLabel,
  expanded,
  onToggle,
  toggleDisabled = false,
  divider = true,
  add,
}: StoryContextSectionHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className={`editor-context-header editor-heading-row${divider ? ' context-section' : ''}`}>
      <button
        className="ghost context-heading"
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        disabled={toggleDisabled}
      >
        <span className="context-heading-label">
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          {title}
        </span>
        <small aria-label={countLabel}>{count}</small>
      </button>
      {add ? (
        <button
          type="button"
          aria-label={add.accessibleName}
          onClick={add.onClick}
          disabled={add.disabled}
        >
          {t('editor.add')}
        </button>
      ) : null}
    </div>
  );
}
