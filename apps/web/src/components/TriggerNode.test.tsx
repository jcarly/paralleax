import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriggerNode, type TriggerNodeData } from './TriggerNode';

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    Handle: ({ id }: { id?: string }) => <span data-handle-id={id} />,
  };
});

describe('TriggerNode', () => {
  afterEach(cleanup);

  it('opens the trigger discussion associated with its comment badge', () => {
    const onSelectTrigger = vi.fn();
    const onOpenComments = vi.fn();
    const data: TriggerNodeData = {
      interactionId: 'interaction-1',
      triggerId: 'trigger-1',
      triggerIds: ['trigger-1'],
      conditionCount: 2,
      conditionSummary: '"Start" has been visited AND Owns "Key"',
      inputCount: 1,
      orGroupCount: 1,
      selected: true,
      commentCount: 3,
      commentTargetId: 'comment-target-1',
      onSelectTrigger,
      onOpenComments,
    };
    const props = { data } as unknown as Parameters<typeof TriggerNode>[0];

    const { container } = render(<TriggerNode {...props} />);
    expect(screen.getByTestId('flow-trigger-interaction-1-trigger-1')).toHaveAttribute(
      'title',
      '1 input, "Start" has been visited AND Owns "Key", 1 trigger variant',
    );
    fireEvent.click(screen.getByTestId('flow-trigger-interaction-1-trigger-1'));
    fireEvent.click(container.querySelector('.trigger-comment-badge')!);

    expect(onSelectTrigger).toHaveBeenCalledWith('interaction-1', 'trigger-1');
    expect(onOpenComments).toHaveBeenCalledWith('trigger', 'comment-target-1');
  });
});
