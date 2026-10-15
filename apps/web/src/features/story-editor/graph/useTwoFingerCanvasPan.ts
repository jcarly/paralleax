import { useEffect, type RefObject } from 'react';

/**
 * Keeps React Flow's mouse panning intact while reserving one-finger gestures
 * on the editor canvas for rectangular selection. React Flow listens for touch
 * gestures on its renderer; stopping a one-finger `touchstart` there leaves its
 * Pointer Event selection handling available, while a two-finger gesture still
 * reaches its native pan and pinch handling.
 */
export function useTwoFingerCanvasPan(
  canvasRef: RefObject<HTMLElement | null>,
  canvasVersion: string | undefined,
) {
  useEffect(() => {
    const renderer = canvasRef.current?.querySelector<HTMLElement>('.react-flow__renderer');
    if (!renderer) return;

    const preventSingleFingerPan = (event: TouchEvent) => {
      if (event.touches.length < 2) event.stopImmediatePropagation();
    };

    renderer.addEventListener('touchstart', preventSingleFingerPan, { capture: true });
    return () => renderer.removeEventListener('touchstart', preventSingleFingerPan, { capture: true });
  }, [canvasRef, canvasVersion]);
}
