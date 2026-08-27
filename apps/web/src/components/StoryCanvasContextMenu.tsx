import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CanvasActionIcon, type CanvasActionIconName } from './StoryCanvasToolbar';

interface StoryCanvasContextMenuProps {
  position: { x: number; y: number };
  canEdit: boolean;
  canComment: boolean;
  canOrganize: boolean;
  organizeSelectionCount: number;
  onCreateInteraction: () => void;
  onAddComment: () => void;
  onAddFrame: () => void;
  onAddText: () => void;
  onOrganizeAll: () => void;
  onOrganizeSelection: () => void;
  onClose: () => void;
}

const menuWidth = 220;
const menuHeight = 240;
const viewportMargin = 8;

export function StoryCanvasContextMenu({
  position,
  canEdit,
  canComment,
  canOrganize,
  organizeSelectionCount,
  onCreateInteraction,
  onAddComment,
  onAddFrame,
  onAddText,
  onOrganizeAll,
  onOrganizeSelection,
  onClose,
}: StoryCanvasContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  function run(action: () => void) {
    onClose();
    action();
  }

  return (
    <div
      className="canvas-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      ref={menuRef}
      role="menu"
      aria-label={t('editor.contextMenu.label')}
      style={{ left, top }}
    >
      {canEdit ? (
        <ContextMenuAction
          icon="root"
          label={t('editor.contextMenu.addInteraction')}
          onClick={() => run(onCreateInteraction)}
        />
      ) : null}
      {canComment ? (
        <ContextMenuAction
          icon="postIt"
          label={t('editor.contextMenu.addComment')}
          onClick={() => run(onAddComment)}
        />
      ) : null}
      {canEdit ? (
        <ContextMenuAction
          icon="frame"
          label={t('decoration.addFrame')}
          onClick={() => run(onAddFrame)}
        />
      ) : null}
      {canEdit ? (
        <ContextMenuAction
          icon="text"
          label={t('decoration.addText')}
          onClick={() => run(onAddText)}
        />
      ) : null}
      {canEdit ? (
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
    </div>
  );
}

function ContextMenuAction({
  icon,
  label,
  disabled = false,
  suffix,
  ariaExpanded,
  ariaHasPopup,
  onClick,
  onKeyDown,
}: {
  icon?: CanvasActionIconName;
  label: string;
  disabled?: boolean;
  suffix?: ReactNode;
  ariaExpanded?: boolean;
  ariaHasPopup?: 'menu';
  onClick: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {icon ? <CanvasActionIcon name={icon} /> : <span className="canvas-context-icon-spacer" />}
      <span>{label}</span>
      {suffix}
    </button>
  );
}
