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
    ...(decoration.kind === 'frame'
      ? { style: { width: decoration.width, height: decoration.height } }
      : {}),
    data: {
      decoration,
      selected: decoration.id === selectedDecorationId,
      editable,
      ...(onResize ? { onResize } : {}),
    },
  }));
}
