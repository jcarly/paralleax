import { useCallback, useEffect, useState } from 'react';

const MIN_INSPECTOR_WIDTH = 280;
const DEFAULT_INSPECTOR_WIDTH = 340;

export type StoryEditorInspectorLayout = {
  width: number;
  minimum: number;
  maximum: number;
  maximized: boolean;
  onResize: (width: number) => void;
  onResizePreview: (width: number) => void;
  onToggleMaximized: () => void;
};

const NAVIGATION_WIDTH = 260;
const MIN_GRAPH_WIDTH = 280;
/** Widening the Inspector past this share of the editor maximizes it instead. */
export const AUTO_MAXIMIZE_RATIO = 0.7;

function inspectorWidthBounds(viewportWidth: number, locationPanelOpen: boolean) {
  const narrow = viewportWidth <= 800;
  const minimum = narrow
    ? Math.min(MIN_INSPECTOR_WIDTH, Math.floor(viewportWidth * 0.75))
    : MIN_INSPECTOR_WIDTH;
  const editorWidth = viewportWidth - (locationPanelOpen ? NAVIGATION_WIDTH : 0);
  // No fixed cap on wide screens: only the graph keeps a minimum width.
  const maximum = Math.max(
    minimum,
    narrow ? Math.floor(viewportWidth * 0.9) : Math.floor(editorWidth - MIN_GRAPH_WIDTH),
  );
  const autoMaximizeWidth = narrow
    ? undefined
    : Math.max(minimum, Math.min(maximum, Math.floor(editorWidth * AUTO_MAXIMIZE_RATIO)));
  return { minimum, maximum, autoMaximizeWidth };
}

export function useStoryEditorInspectorLayout(
  locationPanelOpen: boolean,
  onResizePreview: (width: number) => void,
): StoryEditorInspectorLayout {
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const [inspectorMaximized, setInspectorMaximized] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  const { minimum, maximum, autoMaximizeWidth } = inspectorWidthBounds(
    viewportWidth,
    locationPanelOpen,
  );
  const width = Math.max(minimum, Math.min(maximum, inspectorWidth));
  const onResize = useCallback(
    (nextWidth: number) => {
      if (autoMaximizeWidth !== undefined && nextWidth >= autoMaximizeWidth) {
        // Keep the width from before the gesture, so Restore returns to it.
        onResizePreview(width);
        setInspectorMaximized(true);
        return;
      }
      setInspectorWidth(Math.max(minimum, Math.min(maximum, nextWidth)));
    },
    [autoMaximizeWidth, maximum, minimum, onResizePreview, width],
  );
  const onToggleMaximized = useCallback(() => {
    setInspectorMaximized((maximized) => !maximized);
  }, []);

  useEffect(() => {
    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', updateViewportWidth);
    return () => {
      window.removeEventListener('resize', updateViewportWidth);
    };
  }, []);

  return {
    width,
    minimum,
    maximum,
    maximized: inspectorMaximized,
    onResize,
    onResizePreview,
    onToggleMaximized,
  };
}
