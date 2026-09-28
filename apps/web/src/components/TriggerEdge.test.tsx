import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getSmoothStepPath, Position } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriggerEdge } from './TriggerEdge';

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  const { createPortal } = await import('react-dom');
  return {
    ...actual,
    BaseEdge: ({ id, path, markerEnd }: { id: string; path: string; markerEnd?: string }) => (
      <path
        data-testid="base-edge"
        data-edge-id={id}
        data-path={path}
        data-marker-end={markerEnd}
      />
    ),
    EdgeLabelRenderer: ({ children }: { children: ReactNode }) =>
      createPortal(children, document.body),
    getSmoothStepPath: vi.fn(() => ['M 0 0 L 40 60', 40, 60, 0, 0]),
  };
});

const baseProps = {
  id: 'edge-1',
  source: 'source-1',
  target: 'trigger-1',
  sourceX: 10,
  sourceY: 20,
  targetX: 70,
  targetY: 80,
  sourcePosition: Position.Bottom,
  targetPosition: Position.Top,
  markerEnd: 'url(#arrow)',
} as Parameters<typeof TriggerEdge>[0];

describe('TriggerEdge', () => {
  afterEach(cleanup);

  it('reveals its delete action on hover and removes every grouped trigger input', () => {
    const onDeleteTriggerInput = vi.fn();
    const { container } = render(
      <svg>
        <TriggerEdge
          {...baseProps}
          data={{
            interactionId: 'target-1',
            triggerId: 'trigger-1',
            triggerIds: ['trigger-1', 'trigger-2'],
            inputInteractionId: 'source-1',
            selected: false,
            conditionCount: 0,
            routingLaneIndex: 1,
            routingLaneCount: 3,
            onDeleteTriggerInput,
          }}
        />
      </svg>,
    );

    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-path', 'M 0 0 L 40 60');
    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-marker-end', 'url(#arrow)');
    expect(getSmoothStepPath).toHaveBeenCalledWith(
      expect.objectContaining({ borderRadius: 14, stepPosition: expect.any(Number) }),
    );

    const hitbox = container.querySelector('.trigger-edge-hitbox');
    expect(hitbox).not.toBeNull();
    const deleteButton = screen.getByRole('button', { name: 'Remove trigger input' });
    expect(deleteButton).not.toHaveClass('visible');

    fireEvent.mouseEnter(hitbox!);
    expect(deleteButton).toHaveClass('visible');
    fireEvent.mouseLeave(hitbox!);
    expect(deleteButton).not.toHaveClass('visible');
    fireEvent.mouseEnter(deleteButton);
    expect(deleteButton).toHaveClass('visible');
    fireEvent.mouseLeave(deleteButton);
    expect(deleteButton).not.toHaveClass('visible');
    fireEvent.click(deleteButton);

    expect(onDeleteTriggerInput).toHaveBeenNthCalledWith(1, 'target-1', 'trigger-1', 'source-1');
    expect(onDeleteTriggerInput).toHaveBeenNthCalledWith(2, 'target-1', 'trigger-2', 'source-1');
  });

  it('uses the ELK detour for the edge, hitbox, and delete action at half its travelled length', () => {
    const onDeleteTriggerInput = vi.fn();
    const data = {
      interactionId: 'target-1',
      triggerId: 'trigger-1',
      inputInteractionId: 'source-1',
      selected: false,
      conditionCount: 0,
      onDeleteTriggerInput,
    };
    const { container, rerender } = render(
      <svg>
        <TriggerEdge
          {...baseProps}
          data={{
            ...data,
            elkRoute: [
              { x: 10, y: 20 },
              { x: 10, y: 40 },
              { x: -90, y: 40 },
              { x: -90, y: -80 },
              { x: 70, y: -80 },
              { x: 70, y: 80 },
            ],
          }}
        />
      </svg>,
    );

    const expectedPath = 'M 10 20 L 10 40 L -90 40 L -90 -80 L 70 -80 L 70 80';
    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-path', expectedPath);
    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-marker-end', 'url(#arrow)');
    expect(container.querySelector('.trigger-edge-hitbox')).toHaveAttribute('d', expectedPath);

    const deleteButton = screen.getByRole('button', { name: 'Remove trigger input' });
    // The 560-unit route reaches its midpoint 40 units into the fourth segment.
    expect(deleteButton).toHaveStyle({
      transform: 'translate(-50%, -50%) translate(-50px, -80px)',
    });
    fireEvent.click(deleteButton);
    expect(onDeleteTriggerInput).toHaveBeenCalledExactlyOnceWith(
      'target-1',
      'trigger-1',
      'source-1',
    );

    rerender(
      <svg>
        <TriggerEdge {...baseProps} data={data} />
      </svg>,
    );

    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-path', 'M 0 0 L 40 60');
    expect(container.querySelector('.trigger-edge-hitbox')).toHaveAttribute('d', 'M 0 0 L 40 60');
    expect(deleteButton).toHaveStyle({
      transform: 'translate(-50%, -50%) translate(40px, 60px)',
    });
  });

  it('renders an ELK output route with its arrow and no input delete action', () => {
    const { container } = render(
      <svg>
        <TriggerEdge
          {...baseProps}
          data={{
            interactionId: 'target-1',
            triggerId: 'trigger-1',
            selected: false,
            conditionCount: 0,
            elkRoute: [
              { x: 10, y: 20 },
              { x: 10, y: 80 },
              { x: 70, y: 80 },
            ],
          }}
        />
      </svg>,
    );

    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-path', 'M 10 20 L 10 80 L 70 80');
    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-marker-end', 'url(#arrow)');
    expect(container.querySelector('.trigger-edge-hitbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove trigger input' })).not.toBeInTheDocument();
  });

  it('renders only the edge when no input interaction is attached', () => {
    const { container } = render(
      <svg>
        <TriggerEdge {...baseProps} data={undefined} />
      </svg>,
    );

    expect(screen.getByTestId('base-edge')).toBeInTheDocument();
    expect(container.querySelector('.trigger-edge-hitbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove trigger input' })).not.toBeInTheDocument();
  });
});
