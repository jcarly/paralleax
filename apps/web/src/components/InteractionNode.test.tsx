import { cleanup, render, screen } from '@testing-library/react';
import { ReactFlowProvider, type Node, type NodeProps } from '@xyflow/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InteractionNode, type InteractionNodeData } from './InteractionNode';

function renderNode(data: Partial<InteractionNodeData>) {
  const props: NodeProps<Node<InteractionNodeData>> = {
    id: 'node-1',
    type: 'interaction',
    data: { title: '', body: '', selected: false, ...data },
    selected: false,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
  render(
    <ReactFlowProvider>
      <InteractionNode {...props} />
    </ReactFlowProvider>,
  );
}

afterEach(cleanup);

describe('InteractionNode choice label', () => {
  it('leaves an unlabelled option empty and flags it as an error', () => {
    renderNode({ needsChoiceLabel: true });

    const error = screen.getByRole('img', { name: /Label required/ });
    const label = error.closest('.interaction-label-bubble');
    expect(label).toHaveClass('choice-label-error');
    expect(label).toHaveTextContent(/^→!$/);
    expect(screen.queryByText('New interaction')).not.toBeInTheDocument();
  });

  it('shows no error once the option has a title', () => {
    renderNode({ title: 'Leave', needsChoiceLabel: true });

    expect(screen.getByText('Leave')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Label required/ })).not.toBeInTheDocument();
  });
});
