import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  commentSemanticSlotKey,
  type CommentSemanticSlot,
  type CommentTextField,
} from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { commentBadgeOwner, useCommentBadgeOwner } from './commentBadgeOwner';

function useCommentBadgePosition() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>();

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
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
  position,
  label,
  count,
  onClick,
}: {
  position?: CSSProperties;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  if (!position) {
    return null;
  }
  // Rendered inside its field so it follows the field in the tab order and
  // counts as part of the field for pointer events; fixed positioning places it
  // in the inspector gutter.
  return (
    <button
      className="inspector-field-comment-badge inspector-comment-toggle"
      style={position}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span aria-hidden="true">◆</span>
      <small>{count || '+'}</small>
    </button>
  );
}

function isInnermostCommentableField(target: EventTarget | null, field: Element) {
  return target instanceof Element && target.closest('.inspector-commentable-field') === field;
}

const commentGutterWidth = 24;

function useCommentBadgeVisibility(fieldRef: RefObject<HTMLDivElement | null>) {
  const badgeId = useId();
  // The area between the field and its badge in the inspector gutter.
  const corridor = () => {
    const field = fieldRef.current;
    if (!field) {
      return undefined;
    }
    const bounds = field.getBoundingClientRect();
    const left =
      (field.closest('.inspector')?.getBoundingClientRect().left ?? bounds.left) -
      commentGutterWidth;
    return new DOMRect(left, bounds.top, bounds.right - left, Math.max(bounds.height, 32));
  };
  const visible = useCommentBadgeOwner(badgeId);

  useEffect(
    () => () => {
      commentBadgeOwner.release(badgeId);
    },
    [badgeId],
  );

  return {
    visible,
    fieldHandlers: {
      onPointerOver: (event: PointerEvent<HTMLDivElement>) => {
        if (isInnermostCommentableField(event.target, event.currentTarget)) {
          commentBadgeOwner.hover(badgeId, corridor);
        }
      },
      onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
        commentBadgeOwner.leave(badgeId, event);
      },
      onFocus: (event: FocusEvent<HTMLDivElement>) => {
        if (isInnermostCommentableField(event.target, event.currentTarget)) {
          commentBadgeOwner.focus(badgeId, corridor);
        }
      },
      onBlur: (event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          commentBadgeOwner.leave(badgeId);
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
  const visibility = useCommentBadgeVisibility(fieldRef);

  return (
    <div
      className={`inspector-commentable-field ${count > 0 ? 'has-comments' : ''}`}
      ref={fieldRef}
      {...visibility.fieldHandlers}
    >
      {children}
      {count > 0 && onOpenTextComments && visibility.visible ? (
        <CommentBadge
          position={position}
          label={t('comments.openForField', { field: label })}
          count={count}
          onClick={() => {
            onOpenTextComments(field);
          }}
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
  const visibility = useCommentBadgeVisibility(fieldRef);

  return (
    <div
      className={`inspector-commentable-field inspector-commentable-slot ${
        count > 0 ? 'has-comments' : ''
      }`}
      ref={fieldRef}
      {...visibility.fieldHandlers}
    >
      {children}
      {onOpenSemanticComments && visibility.visible ? (
        <CommentBadge
          position={position}
          label={t(count > 0 ? 'comments.openForField' : 'comments.commentField', { field: label })}
          count={count}
          onClick={() => {
            onOpenSemanticComments(slot);
          }}
        />
      ) : null}
    </div>
  );
}
