import {
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from 'react';

interface InspectorResizeHandleProps {
  label: string;
  controls: string;
  value: number;
  minimum: number;
  maximum: number;
  onResize: (width: number) => void;
  onResizePreview: (width: number) => void;
}

interface ResizeSession {
  pointerId: number;
  startX: number;
  startWidth: number;
  currentWidth: number;
}

interface ResizeBounds {
  minimum: number;
  maximum: number;
  onResize: (width: number) => void;
  onResizePreview: (width: number) => void;
}

function resizeTo(width: number, bounds: ResizeBounds) {
  bounds.onResize(Math.max(bounds.minimum, Math.min(bounds.maximum, width)));
}

function beginResize(
  event: PointerEvent<HTMLDivElement>,
  resizeSession: MutableRefObject<ResizeSession | undefined>,
  value: number,
) {
  if (event.button !== 0) {
    return;
  }
  event.currentTarget.setPointerCapture(event.pointerId);
  resizeSession.current = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startWidth: value,
    currentWidth: value,
  };
}

function moveResize(
  event: PointerEvent<HTMLDivElement>,
  resizeSession: MutableRefObject<ResizeSession | undefined>,
  bounds: ResizeBounds,
): number | undefined {
  const session = resizeSession.current;
  if (!session || session.pointerId !== event.pointerId) {
    return undefined;
  }
  const width = Math.max(
    bounds.minimum,
    Math.min(bounds.maximum, session.startWidth + session.startX - event.clientX),
  );
  session.currentWidth = width;
  bounds.onResizePreview(width);
  return width;
}

function finishResize(
  event: PointerEvent<HTMLDivElement>,
  resizeSession: MutableRefObject<ResizeSession | undefined>,
): number | undefined {
  if (resizeSession.current?.pointerId !== event.pointerId) {
    return undefined;
  }
  const width = resizeSession.current.currentWidth;
  resizeSession.current = undefined;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return width;
}

function commitResize(
  width: number | undefined,
  onResize: (width: number) => void,
  resetPreview: () => void,
) {
  if (width !== undefined) {
    onResize(width);
    resetPreview();
  }
}

function finishPointerResize(
  event: PointerEvent<HTMLDivElement>,
  resizeSession: MutableRefObject<ResizeSession | undefined>,
  onResize: (width: number) => void,
  resetPreview: () => void,
) {
  commitResize(finishResize(event, resizeSession), onResize, resetPreview);
}

function finishLostPointerResize(
  resizeSession: MutableRefObject<ResizeSession | undefined>,
  onResize: (width: number) => void,
  resetPreview: () => void,
) {
  const width = resizeSession.current?.currentWidth;
  resizeSession.current = undefined;
  commitResize(width, onResize, resetPreview);
}

function resizeFromKeyboard(
  event: KeyboardEvent<HTMLDivElement>,
  value: number,
  bounds: ResizeBounds,
) {
  const step = event.shiftKey ? 48 : 16;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    resizeTo(value + step, bounds);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    resizeTo(value - step, bounds);
  } else if (event.key === 'Home') {
    event.preventDefault();
    resizeTo(bounds.minimum, bounds);
  } else if (event.key === 'End') {
    event.preventDefault();
    resizeTo(bounds.maximum, bounds);
  }
}

export function InspectorResizeHandle({
  label,
  controls,
  value,
  minimum,
  maximum,
  onResize,
  onResizePreview,
}: InspectorResizeHandleProps) {
  const resizeSession = useRef<ResizeSession | undefined>(undefined);
  const [previewValue, setPreviewValue] = useState<number | undefined>(undefined);
  const bounds = { minimum, maximum, onResize, onResizePreview };

  return (
    <div
      className="inspector-resize-handle"
      role="separator"
      aria-label={label}
      title={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={Math.round(previewValue ?? value)}
      tabIndex={0}
      onPointerDown={(event) => beginResize(event, resizeSession, value)}
      onPointerMove={(event) => {
        const width = moveResize(event, resizeSession, bounds);
        if (width !== undefined) {
          setPreviewValue(width);
        }
      }}
      onPointerUp={(event) =>
        finishPointerResize(event, resizeSession, onResize, () => setPreviewValue(undefined))
      }
      onPointerCancel={(event) =>
        finishPointerResize(event, resizeSession, onResize, () => setPreviewValue(undefined))
      }
      onLostPointerCapture={() =>
        finishLostPointerResize(resizeSession, onResize, () => setPreviewValue(undefined))
      }
      onKeyDown={(event) => resizeFromKeyboard(event, value, bounds)}
    />
  );
}
