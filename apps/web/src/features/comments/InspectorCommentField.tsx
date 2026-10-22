import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
  type FocusEvent,
  type MouseEvent,
} from 'react';
import {
  commentSemanticSlotKey,
  type CommentSemanticSlot,
  type CommentTextField,
} from '@paralleax/shared';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

function useCommentBadgePosition() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>();

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const update = () => {
      const fieldBounds = field.getBoundingClientRect();
      const inspectorBounds = field.closest('.inspector')?.getBoundingClientRect();
      setPosition({
        position: 'fixed',
        left: inspectorBounds?.left ?? fieldBounds.left,
        top: fieldBounds.top,
        transform: 'translate(-50%, 0)',
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    observer?.observe(field);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, []);

  return { fieldRef, position };
}

function CommentBadge({
  badgeId,
  position,
  label,
  count,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  badgeId: string;
  position?: CSSProperties;
  label: string;
  count?: number;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  if (!position) return null;
  return createPortal(
    <button
      className="inspector-field-comment-badge inspector-comment-toggle"
      data-comment-badge={badgeId}
      style={position}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span aria-hidden="true">◆</span>
      <small>{count || '+'}</small>
    </button>,
    document.body,
  );
}

function useCommentBadgeVisibility() {
  const badgeId = useId();
  const [hovered, setHovered] = useState(false);
  const isCommentBadgeTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest(`[data-comment-badge="${badgeId}"]`));

  return {
    badgeId,
    hovered,
    setHovered,
    fieldHandlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: (event: MouseEvent<HTMLDivElement>) => {
        if (!isCommentBadgeTarget(event.relatedTarget)) setHovered(false);
      },
      onFocus: () => setHovered(true),
      onBlur: (event: FocusEvent<HTMLDivElement>) => {
        const target = event.relatedTarget;
        if (
          !event.currentTarget.contains(target as Node | null) &&
          !isCommentBadgeTarget(target)
        ) {
          setHovered(false);
        }
      },
    },
  };
}

export interface InspectorTextCommentProps {
  textCommentCounts?: Partial<Record<CommentTextField, number>>;
  onOpenTextComments?: (field: CommentTextField) => void;
}

export interface InspectorSemanticCommentProps {
  semanticCommentCounts?: Partial<Record<string, number>>;
  onOpenSemanticComments?: (slot: CommentSemanticSlot) => void;
}

export function InspectorCommentField({
  field,
  label,
  textCommentCounts,
  onOpenTextComments,
  children,
}: PropsWithChildren<
  InspectorTextCommentProps & {
    field: CommentTextField;
    label: string;
  }
>) {
  const { t } = useTranslation();
  const count = textCommentCounts?.[field] ?? 0;
  const { fieldRef, position } = useCommentBadgePosition();
  const visibility = useCommentBadgeVisibility();

  return (
    <div
      className={`inspector-commentable-field ${count > 0 ? 'has-comments' : ''}`}
      ref={fieldRef}
      {...visibility.fieldHandlers}
    >
      {children}
      {count > 0 && onOpenTextComments && visibility.hovered ? (
        <CommentBadge
          badgeId={visibility.badgeId}
          position={position}
          label={t('comments.openForField', { field: label })}
          count={count}
          onClick={() => onOpenTextComments(field)}
          onMouseEnter={() => visibility.setHovered(true)}
          onMouseLeave={() => visibility.setHovered(false)}
        />
      ) : null}
    </div>
  );
}

export function InspectorCommentSlot({
  slot,
  label,
  semanticCommentCounts,
  onOpenSemanticComments,
  children,
}: PropsWithChildren<
  InspectorSemanticCommentProps & {
    slot: CommentSemanticSlot;
    label: string;
  }
>) {
  const { t } = useTranslation();
  const count = semanticCommentCounts?.[commentSemanticSlotKey(slot)] ?? 0;
  const { fieldRef, position } = useCommentBadgePosition();
  const visibility = useCommentBadgeVisibility();

  return (
    <div
      className={`inspector-commentable-field inspector-commentable-slot ${
        count > 0 ? 'has-comments' : ''
      }`}
      ref={fieldRef}
      {...visibility.fieldHandlers}
    >
      {children}
      {onOpenSemanticComments && visibility.hovered ? (
        <CommentBadge
          badgeId={visibility.badgeId}
          position={position}
          label={t(count > 0 ? 'comments.openForField' : 'comments.commentField', { field: label })}
          count={count}
          onClick={() => onOpenSemanticComments(slot)}
          onMouseEnter={() => visibility.setHovered(true)}
          onMouseLeave={() => visibility.setHovered(false)}
        />
      ) : null}
    </div>
  );
}
