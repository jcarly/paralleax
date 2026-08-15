import { describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { buildGraphDecorationNodes } from './graphDecorationNodes';

const story: Story = {
  id: 'story-1',
  title: 'Decorated story',
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T10:00:00.000Z',
  interactions: [],
  graphDecorations: [
    {
      id: 'frame-1',
      kind: 'frame',
      position: { x: 20, y: 30 },
      color: '#5b6ee1',
      width: 420,
      height: 240,
    },
    {
      id: 'text-1',
      kind: 'text',
      position: { x: 60, y: 70 },
      color: '#273043',
      text: 'Act one',
      fontSize: 32,
      fontFamily: 'serif',
      fontWeight: 'bold',
      fontStyle: 'italic',
    },
  ],
};

describe('graph decoration projection', () => {
  it('projects decorations behind narrative nodes with frame dimensions', () => {
    const onResize = vi.fn();
    const nodes = buildGraphDecorationNodes(story, 'frame-1', true, onResize);

    expect(nodes).toEqual([
      expect.objectContaining({
        id: 'frame-1',
        type: 'graphDecoration',
        position: { x: 20, y: 30 },
        draggable: true,
        selectable: false,
        zIndex: -1000,
        style: { width: 420, height: 240 },
        data: expect.objectContaining({ selected: true, editable: true, onResize }),
      }),
      expect.objectContaining({
        id: 'text-1',
        type: 'graphDecoration',
        position: { x: 60, y: 70 },
        draggable: true,
        selectable: false,
        zIndex: -1000,
        data: expect.objectContaining({ selected: false, editable: true }),
      }),
    ]);
    expect(nodes[1]).not.toHaveProperty('style');
  });
});
