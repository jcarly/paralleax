import { useState } from 'react';
import { ContextMenu, ContextMenuAction as BaseContextMenuAction } from './ContextMenu';
import { useTranslation } from 'react-i18next';
import { CanvasActionIcon, type CanvasActionIconName } from './StoryCanvasToolbar';

interface StoryCanvasContextMenuProps {
  position: { x: number; y: number };
  targetKind: 'canvas' | 'interaction' | 'trigger' | 'graphDecoration';
  canEdit: boolean;
  canComment: boolean;
  canOrganize: boolean;
  organizeSelectionCount: number;
  onCreateInteraction?: () => void;
  onAddComment?: () => void;
  onAddFrame?: () => void;
  onAddText?: () => void;
  onAddChild?: () => void;
  onDelete?: () => void;
  onOrganizeAll?: () => void;
  onOrganizeSelection?: () => void;
  onOrganizeTarget?: () => void;
  onClose: () => void;
}

const menuWidth = 220;
const menuHeight = 240;
const viewportMargin = 8;

export function StoryCanvasContextMenu({
  position,
  targetKind,
  canEdit,
  canComment,
  canOrganize,
  organizeSelectionCount,
  onCreateInteraction,
  onAddComment,
  onAddFrame,
  onAddText,
  onAddChild,
  onDelete,
  onOrganizeAll,
  onOrganizeSelection,
  onOrganizeTarget,
  onClose,
}: StoryCanvasContextMenuProps) {
  const { t } = useTranslation();
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const left = Math.max(
    viewportMargin,
    Math.min(position.x, window.innerWidth - menuWidth - viewportMargin),
  );
  const top = Math.max(
    viewportMargin,
    Math.min(position.y, window.innerHeight - menuHeight - viewportMargin),
  );
  const submenuOpensLeft = left + menuWidth * 2 + viewportMargin > window.innerWidth;

  function run(action: () => void) {
    onClose();
    action();
  }

  return (
    <ContextMenu
      position={{ x: left, y: top }}
      onClose={onClose}
      label={t(
        targetKind === 'canvas' ? 'editor.contextMenu.label' : 'editor.contextMenu.elementLabel',
      )}
    >
      {targetKind === 'canvas' && canEdit && onCreateInteraction ? (
        <ContextMenuAction
          icon="root"
          label={t('editor.contextMenu.addInteraction')}
          onClick={() => run(onCreateInteraction)}
        />
      ) : null}
      {targetKind !== 'graphDecoration' && canComment && onAddComment ? (
        <ContextMenuAction
          icon="postIt"
          label={t('editor.contextMenu.addComment')}
          onClick={() => run(onAddComment)}
        />
      ) : null}
      {targetKind === 'canvas' && canEdit && onAddFrame ? (
        <ContextMenuAction
          icon="frame"
          label={t('decoration.addFrame')}
          onClick={() => run(onAddFrame)}
        />
      ) : null}
      {targetKind === 'canvas' && canEdit && onAddText ? (
        <ContextMenuAction
          icon="text"
          label={t('decoration.addText')}
          onClick={() => run(onAddText)}
        />
      ) : null}
      {targetKind === 'interaction' && canEdit && onAddChild ? (
        <ContextMenuAction
          icon="child"
          label={t('editor.contextMenu.addChild')}
          onClick={() => run(onAddChild)}
        />
      ) : null}
      {(targetKind === 'interaction' || targetKind === 'trigger') && canEdit && onOrganizeTarget ? (
        <ContextMenuAction
          icon="organize"
          label={t('editor.contextMenu.organizeTarget')}
          disabled={!canOrganize}
          onClick={() => run(onOrganizeTarget)}
        />
      ) : null}
      {targetKind === 'canvas' && canEdit && onOrganizeAll && onOrganizeSelection ? (
        <div className="canvas-context-submenu-trigger">
          <ContextMenuAction
            icon="organize"
            label={t('editor.contextMenu.organize')}
            disabled={!canOrganize}
            suffix={<span aria-hidden="true">›</span>}
            ariaExpanded={organizeOpen}
            ariaHasPopup="menu"
            onClick={() => setOrganizeOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                setOrganizeOpen(true);
              }
            }}
          />
          {organizeOpen && canOrganize ? (
            <div
              className={`canvas-context-submenu ${submenuOpensLeft ? 'opens-left' : ''}`}
              role="menu"
              aria-label={t('editor.contextMenu.organize')}
            >
              <ContextMenuAction
                label={t('editor.contextMenu.organizeAll')}
                onClick={() => run(onOrganizeAll)}
              />
              <ContextMenuAction
                label={t('editor.contextMenu.organizeSelection')}
                disabled={organizeSelectionCount === 0}
                onClick={() => run(onOrganizeSelection)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {targetKind !== 'canvas' && canEdit && onDelete ? (
        <ContextMenuAction
          icon="delete"
          label={t(`editor.contextMenu.delete.${targetKind}`)}
          danger
          onClick={() => run(onDelete)}
        />
      ) : null}
    </ContextMenu>
  );
}

function ContextMenuAction({
  icon,
  ...props
}: Omit<Parameters<typeof BaseContextMenuAction>[0], 'icon'> & { icon?: CanvasActionIconName }) {
  return (
    <BaseContextMenuAction {...props} icon={icon ? <CanvasActionIcon name={icon} /> : undefined} />
  );
}
