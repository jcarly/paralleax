import type { Story, UpdateGraphDecorationInput } from '@paralleax/shared';
import type { GraphDecorationFlowNode } from './GraphDecorationNode';

export function buildGraphDecorationNodes(
  story: Story | undefined,
  selectedDecorationId: string | undefined,
  editable: boolean,
  onResize?: (decorationId: string, patch: UpdateGraphDecorationInput) => void,
): GraphDecorationFlowNode[] {
  return (story?.graphDecorations ?? []).map((decoration) => ({
    id: decoration.id,
    type: 'graphDecoration',
    position: decoration.position,
    draggable: editable,
    selectable: false,
    zIndex: -1_000,
    className: decoration.kind === 'frame' ? 'graph-frame-flow-node' : 'graph-text-flow-node',
    ...(decoration.kind === 'frame'
      ? {
          style: {
            width: decoration.width,
            height: decoration.height,
          },
          dragHandle: '.graph-frame-hit',
        }
      : {}),
    data: {
      decoration,
      selected: decoration.id === selectedDecorationId,
      editable,
      ...(onResize ? { onResize } : {}),
    },
  }));
}
