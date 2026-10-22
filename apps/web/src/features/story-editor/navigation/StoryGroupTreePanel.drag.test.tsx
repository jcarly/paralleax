import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import type { DndContext, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { StoryGroupTreePanel } from './StoryGroupTreePanel';

const captured = vi.hoisted(() => ({
  props: undefined as ComponentProps<typeof DndContext> | undefined,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const module = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...module,
    DndContext: (props: ComponentProps<typeof module.DndContext>) => {
      captured.props = props;
      return <module.DndContext {...props} />;
    },
  };
});

afterEach(cleanup);

function setup() {
  const story: Story = {
    id: 'story',
    title: 'Story',
    createdAt: '2026-10-21',
    updatedAt: '2026-10-21',
    interactions: [
      { id: 'scene', title: 'Scene', body: '', triggers: [], position: { x: 0, y: 0 } },
    ],
    groups: [
      { id: 'parent', title: 'Parent', interactionIds: ['scene'] },
      { id: 'child', title: 'Child', parentGroupId: 'parent', interactionIds: [] },
      { id: 'other', title: 'Other', interactionIds: [] },
    ],
  };
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onSelect = vi.fn();
  const onFocus = vi.fn();
  render(
    <StoryGroupTreePanel
      story={story}
      selectionIds={[]}
      readOnly={false}
      onSelect={onSelect}
      onFocus={onFocus}
      onSelectInteractions={vi.fn()}
      onEditingChange={vi.fn()}
      onCreate={vi.fn()}
      onDelete={vi.fn()}
      onUpdate={onUpdate}
    />,
  );
  return { onUpdate, onSelect, onFocus };
}

function drag(groupId: string, position: 'inside' | 'root' = 'inside') {
  return {
    active: { id: 'child' },
    over: { id: groupId, data: { current: { groupId, position } }, rect: { top: 0, height: 100 } },
  } as unknown as DragEndEvent & DragOverEvent;
}

describe('Group tree gestures', () => {
  it('offers equivalent context actions and reports a rejected move without losing the tree', async () => {
    const { onUpdate, onFocus } = setup();
    const user = userEvent.setup();
    onUpdate.mockRejectedValueOnce(new Error('offline'));
    await act(async () => captured.props?.onDragEnd?.(drag('', 'root')));
    expect(screen.getByText(/Group could not be saved/)).toBeVisible();
    expect(screen.getByRole('treeitem', { name: /Parent/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Actions for Parent' }));
    await user.click(screen.getByRole('menuitem', { name: 'Center on group' }));
    expect(onFocus).toHaveBeenCalledWith(['scene']);
    await user.click(screen.getByRole('button', { name: 'Expand or collapse Parent' }));
    for (const [title, action, patch] of [
      ['Parent', 'Move down', { parentGroupId: null, beforeGroupId: null }],
      ['Other', 'Move up', { parentGroupId: null, beforeGroupId: 'parent' }],
      ['Other', 'Move into previous group', { parentGroupId: 'parent', beforeGroupId: null }],
      ['Child', 'Move to parent level', { parentGroupId: null, beforeGroupId: 'other' }],
      ['Child', 'Move to root', { parentGroupId: null, beforeGroupId: null }],
    ] as const) {
      await user.click(screen.getByRole('button', { name: `Actions for ${title}` }));
      await user.click(screen.getByRole('menuitem', { name: action }));
      expect(onUpdate).toHaveBeenLastCalledWith(title.toLowerCase(), patch);
    }
  });
  it('previews a move and persists nesting, sibling placement and a return to the root', async () => {
    const { onUpdate } = setup();
    const panel = screen.getByRole('region', { name: 'Groups' });
    for (const [y, beforeGroupId, parentGroupId] of [
      [50, null, 'other'],
      [10, 'other', null],
      [90, null, null],
    ] as const) {
      act(() => captured.props?.onDragStart?.({ active: { id: 'child' } } as never));
      fireEvent(panel, new MouseEvent('pointermove', { bubbles: true, clientY: y }));
      act(() => captured.props?.onDragOver?.(drag('other')));
      act(() => captured.props?.onDragOver?.(drag('other')));
      await act(async () => captured.props?.onDragEnd?.(drag('other')));
      expect(onUpdate).toHaveBeenLastCalledWith('child', { parentGroupId, beforeGroupId });
    }
    act(() => captured.props?.onDragStart?.({ active: { id: 'child' } } as never));
    await act(async () => captured.props?.onDragEnd?.(drag('', 'root')));
    expect(onUpdate).toHaveBeenLastCalledWith('child', {
      parentGroupId: null,
      beforeGroupId: null,
    });
  });

  it('cancels a gesture and ignores drops without a valid destination', async () => {
    const { onUpdate } = setup();
    act(() => captured.props?.onDragStart?.({ active: { id: 'child' } } as never));
    expect(document.querySelector('.story-group-root-drop')).toBeInTheDocument();
    act(() => captured.props?.onDragCancel?.({} as never));
    expect(document.querySelector('.story-group-root-drop')).not.toBeInTheDocument();
    const outside = { active: { id: 'child' }, over: null } as unknown as DragEndEvent;
    await act(async () => captured.props?.onDragEnd?.(outside));
    await act(async () => captured.props?.onDragEnd?.(drag('child')));
    expect(onUpdate).not.toHaveBeenCalled();
    const announcements = captured.props?.accessibility?.announcements;
    expect(announcements?.onDragStart?.({} as never)).toBeTruthy();
    expect(announcements?.onDragOver?.({ over: null } as never)).toBeUndefined();
    expect(announcements?.onDragOver?.({ over: { id: 'other' } } as never)).toBeTruthy();
    expect(announcements?.onDragEnd?.({} as never)).toBeTruthy();
    expect(announcements?.onDragCancel?.({} as never)).toBeTruthy();
  });

  it('navigates visible rows, expands children and selects with the keyboard', async () => {
    const { onSelect } = setup();
    const user = userEvent.setup();
    screen.getByRole('tree', { name: 'Groups' }).focus();
    await user.keyboard('{Home}{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: /Child/ })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('treeitem', { name: /Parent/ })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{End}{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('other');
    await user.keyboard('{Home}{ArrowDown}{ArrowUp} ');
    expect(onSelect).toHaveBeenLastCalledWith('parent');
  });
});
