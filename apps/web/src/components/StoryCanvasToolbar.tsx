import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type CanvasActionIconName =
  'undo' | 'redo' | 'history' | 'root' | 'frame' | 'text' | 'organize' | 'postIt';

interface StoryCanvasToolbarProps {
  canEdit: boolean;
  canComment: boolean;
  canOrganize: boolean;
  organizeSelectionCount: number;
  placingComment: boolean;
  canUndo: boolean;
  canRedo: boolean;
  historyBusy: boolean;
  historyOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleHistory: () => void;
  onCreateRoot: () => void;
  onAddFrame: () => void;
  onAddText: () => void;
  onOrganize: () => void;
  onToggleCommentPlacement: () => void;
}

export function StoryCanvasToolbar({
  canEdit,
  canComment,
  canOrganize,
  organizeSelectionCount,
  placingComment,
  canUndo,
  canRedo,
  historyBusy,
  historyOpen,
  onUndo,
  onRedo,
  onToggleHistory,
  onCreateRoot,
  onAddFrame,
  onAddText,
  onOrganize,
  onToggleCommentPlacement,
}: StoryCanvasToolbarProps) {
  const { t } = useTranslation();
  const organizeLabel = organizeSelectionCount
    ? t('editor.organizeSelected', { count: organizeSelectionCount })
    : t('editor.organizeGraph');
  const postItLabel = t(placingComment ? 'comments.clickCanvas' : 'comments.placeOnCanvas');

  return (
    <div className="canvas-tools" role="toolbar" aria-label={t('editor.canvasTools')}>
      {canEdit ? (
        <>
          <CanvasToolButton
            label={t('editor.undo')}
            icon="undo"
            disabled={!canUndo || historyBusy}
            onClick={onUndo}
          />
          <CanvasToolButton
            label={t('editor.redo')}
            icon="redo"
            disabled={!canRedo || historyBusy}
            onClick={onRedo}
          />
          <CanvasToolButton
            label={t('editor.history.open')}
            icon="history"
            active={historyOpen}
            pressed={historyOpen}
            onClick={onToggleHistory}
          />
          <CanvasToolButton label={t('editor.addRoot')} icon="root" onClick={onCreateRoot} />
          <CanvasToolButton label={t('decoration.addFrame')} icon="frame" onClick={onAddFrame} />
          <CanvasToolButton label={t('decoration.addText')} icon="text" onClick={onAddText} />
          <CanvasToolButton
            label={organizeLabel}
            icon="organize"
            disabled={!canOrganize}
            onClick={onOrganize}
          />
        </>
      ) : null}
      {canComment ? (
        <CanvasToolButton
          label={postItLabel}
          icon="postIt"
          active={placingComment}
          pressed={placingComment}
          onClick={onToggleCommentPlacement}
        />
      ) : null}
    </div>
  );
}

function CanvasToolButton({
  label,
  icon,
  active = false,
  disabled = false,
  pressed,
  onClick,
}: {
  label: string;
  icon: CanvasActionIconName;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`canvas-tool-action ${active ? 'active' : ''}`}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={label}
      disabled={disabled}
      onClick={onClick}
    >
      <CanvasActionIcon name={icon} />
    </button>
  );
}

export function CanvasActionIcon({ name }: { name: CanvasActionIconName }) {
  const paths = {
    undo: (
      <>
        <path d="M9 7 4 12l5 5" />
        <path d="M5 12h8a6 6 0 0 1 6 6" />
      </>
    ),
    redo: (
      <>
        <path d="m15 7 5 5-5 5" />
        <path d="M19 12h-8a6 6 0 0 0-6 6" />
      </>
    ),
    history: (
      <>
        <path d="M5 6h14M5 12h14M5 18h14" />
        <circle cx="3" cy="6" r="0.7" />
        <circle cx="3" cy="12" r="0.7" />
        <circle cx="3" cy="18" r="0.7" />
      </>
    ),
    root: (
      <>
        <path d="M12 3v7M8.5 6.5h7" />
        <path d="M12 10v4" />
        <rect x="5" y="14" width="14" height="7" rx="2" />
      </>
    ),
    frame: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 4v3M4 8h3M16 4v3M17 8h3M8 20v-3M4 16h3M16 20v-3M17 16h3" />
      </>
    ),
    text: <path d="M5 7V4h14v3M12 4v16M8.5 20h7" />,
    organize: (
      <>
        <rect x="9" y="3" width="6" height="5" rx="1.5" />
        <rect x="3" y="16" width="6" height="5" rx="1.5" />
        <rect x="15" y="16" width="6" height="5" rx="1.5" />
        <path d="M12 8v4M6 16v-4h12v4" />
      </>
    ),
    postIt: (
      <>
        <path d="M5 3h10l4 4v14H5V3Z" />
        <path d="M15 3v5h4M8 12h8M8 16h5" />
      </>
    ),
  } satisfies Record<CanvasActionIconName, ReactNode>;

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}
