import { useCallback, useEffect, useState } from 'react';

const MIN_INSPECTOR_WIDTH = 280;
const DEFAULT_INSPECTOR_WIDTH = 340;
const MAX_INSPECTOR_WIDTH = 720;

export type StoryEditorInspectorLayout = {
  width: number;
  minimum: number;
  maximum: number;
  maximized: boolean;
  onResize: (width: number) => void;
  onResizePreview: (width: number) => void;
  onToggleMaximized: () => void;
};

function inspectorWidthBounds(viewportWidth: number, locationPanelOpen: boolean) {
  const minimum =
    viewportWidth <= 800
      ? Math.min(MIN_INSPECTOR_WIDTH, Math.floor(viewportWidth * 0.75))
      : MIN_INSPECTOR_WIDTH;
  const maximum = Math.max(
    minimum,
    Math.min(
      MAX_INSPECTOR_WIDTH,
      viewportWidth <= 800
        ? Math.floor(viewportWidth * 0.9)
        : Math.floor(viewportWidth - (locationPanelOpen ? 260 : 0) - 280),
    ),
  );
  return { minimum, maximum };
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
  const { minimum, maximum } = inspectorWidthBounds(viewportWidth, locationPanelOpen);
  const width = Math.max(minimum, Math.min(maximum, inspectorWidth));
  const onResize = useCallback(
    (nextWidth: number) => {
      setInspectorWidth(Math.max(minimum, Math.min(maximum, nextWidth)));
    },
    [maximum, minimum],
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
