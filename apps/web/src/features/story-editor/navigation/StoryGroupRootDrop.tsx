import { GroupDropZone } from './StoryGroupRow';

export function StoryGroupRootDrop({
  active,
  highlighted,
  label,
}: {
  active: boolean;
  highlighted: boolean;
  label: string;
}) {
  return (
    <div
      aria-hidden={!active}
      className={`story-group-root-drop ${active ? 'drag-active' : ''} ${highlighted ? 'active' : ''}`}
    >
      {active ? label : null}
      <GroupDropZone target={{ position: 'root' }} />
    </div>
  );
}
