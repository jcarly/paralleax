import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import type { GraphDecoration, UpdateGraphDecorationInput } from '@paralleax/shared';

export interface GraphDecorationNodeData extends Record<string, unknown> {
  decoration: GraphDecoration;
  selected: boolean;
  editable: boolean;
  onResize?: (decorationId: string, patch: UpdateGraphDecorationInput) => void;
}

export type GraphDecorationFlowNode = Node<GraphDecorationNodeData, 'graphDecoration'>;

const fontFamilies = {
  sans: 'Inter, system-ui, sans-serif',
  serif: 'Georgia, Cambria, serif',
  monospace: '"Cascadia Code", Consolas, monospace',
  display: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
} as const;

export function GraphDecorationNode({ data }: NodeProps<GraphDecorationFlowNode>) {
  const { decoration } = data;

  if (decoration.kind === 'frame') {
    return (
      <div
        className={`graph-frame-decoration ${data.selected ? 'selected' : ''}`}
        style={{ borderColor: decoration.color, backgroundColor: `${decoration.color}12` }}
        data-testid={`graph-frame-${decoration.id}`}
      >
        <div className="graph-frame-hit graph-frame-hit-top" />
        <div className="graph-frame-hit graph-frame-hit-right" />
        <div className="graph-frame-hit graph-frame-hit-bottom" />
        <div className="graph-frame-hit graph-frame-hit-left" />
        <NodeResizer
          isVisible={data.selected && data.editable}
          minWidth={120}
          minHeight={80}
          lineClassName="graph-frame-resize-line nodrag"
          handleClassName="graph-frame-resize-handle nodrag"
          lineStyle={{ borderColor: decoration.color }}
          handleStyle={{ borderColor: decoration.color }}
          onResizeEnd={(_, size) =>
            data.onResize?.(decoration.id, {
              width: size.width,
              height: size.height,
            })
          }
        />
      </div>
    );
  }

  return (
    <div
      className={`graph-text-decoration ${data.selected ? 'selected' : ''}`}
      style={{
        color: decoration.color,
        fontFamily: fontFamilies[decoration.fontFamily],
        fontSize: decoration.fontSize,
        fontStyle: decoration.fontStyle,
        fontWeight: decoration.fontWeight,
      }}
      data-testid={`graph-text-${decoration.id}`}
    >
      {decoration.text || '\u00a0'}
    </div>
  );
}
