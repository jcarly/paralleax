import { useEffect, useState, type RefObject } from 'react';
import { captureActiveTextSelection } from './textAnchors';

export type TextCommentSelection = NonNullable<ReturnType<typeof captureActiveTextSelection>>;

function sameSelection(current: TextCommentSelection | undefined, next: TextCommentSelection) {
  return (
    current?.field === next.field &&
    current.selector.start === next.selector.start &&
    current.selector.end === next.selector.end &&
    current.selector.sourceHash === next.selector.sourceHash
  );
}

/**
 * Tracks the commentable text the author has selected, so the text-comment action
 * appears only while a selection exists. The selection is kept while focus moves
 * to the action itself (keyboard Tab), where the browser no longer reports it.
 */
export function useTextCommentSelection(actionRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextCommentSelection>();

  useEffect(() => {
    const update = () => {
      const captured = captureActiveTextSelection();
      if (captured) {
        setSelection((current) => (sameSelection(current, captured) ? current : captured));
      } else if (document.activeElement !== actionRef.current) {
        setSelection(undefined);
      }
    };
    document.addEventListener('selectionchange', update);
    // Inputs and text areas do not always report selectionchange to the document.
    document.addEventListener('select', update, true);
    document.addEventListener('focusin', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('select', update, true);
      document.removeEventListener('focusin', update);
    };
  }, [actionRef]);

  return [
    selection,
    () => {
      setSelection(undefined);
    },
  ] as const;
}
