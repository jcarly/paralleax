import type { Interaction } from '@paralleax/shared';

export function StoryInteractionRow({
  interaction,
  depth,
  selected,
  inTree = false,
  onKeyDown,
  onSelect,
}: {
  interaction: Interaction;
  depth: number;
  selected: boolean;
  inTree?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role={inTree ? 'treeitem' : undefined}
      aria-level={inTree ? depth + 1 : undefined}
      aria-selected={inTree ? selected : undefined}
      aria-pressed={!inTree ? selected : undefined}
      tabIndex={inTree ? (selected ? 0 : -1) : undefined}
      id={inTree ? `story-interaction-${interaction.id}` : undefined}
      className={`ghost story-interaction-row ${selected ? 'selected' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 6}px` }}
      title={interaction.title}
      onKeyDown={onKeyDown}
      onClick={onSelect}
    >
      <span className="story-interaction-mark" aria-hidden="true">
        ◦
      </span>
      <span className="story-interaction-title">{interaction.title}</span>
    </button>
  );
}
