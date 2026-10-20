import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { StoryGroupsPanel } from './StoryGroupsPanel';

const story: Story = {
  id: 'story',
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
  title: 'Story',
  interactions: [
    { id: 'one', title: 'Opening scene', body: '', triggers: [], position: { x: 0, y: 0 } },
  ],
  groups: [
    { id: 'parent', title: 'Opening', interactionIds: [] },
    { id: 'child', title: 'Child', interactionIds: ['one', 'missing'], parentGroupId: 'parent' },
  ],
};

function setup(input: Story = story) {
  const props = {
    story: input,
    selectionIds: ['one'],
    readOnly: false,
    onSelect: vi.fn(),
    onFocus: vi.fn(),
    onInteraction: vi.fn(),
    onUpdate: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn().mockResolvedValue(true),
  };
  render(<StoryGroupsPanel {...props} />);
  return { ...props, user: userEvent.setup() };
}

describe('Groups navigation', () => {
  afterEach(cleanup);
  it('selects without centering and expands nested groups with live interaction counts', async () => {
    const { user, onSelect, onFocus, onInteraction } = setup();
    await user.click(screen.getByRole('button', { name: 'Opening 1 interaction' }));
    expect(onSelect).toHaveBeenCalledWith('parent');
    expect(onFocus).not.toHaveBeenCalled();
    const parent = screen.getByText('Opening', { selector: 'strong' }).closest('li')!;
    await user.click(parent.querySelector('[aria-expanded]')!);
    await user.click(within(parent).getAllByRole('button', { name: 'Center on group' })[0]);
    expect(onFocus).toHaveBeenCalledWith(['one']);
    const child = screen.getByText('Child').closest('li')!;
    await user.click(child.querySelector('[aria-expanded]')!);
    await user.click(screen.getByRole('button', { name: 'Opening scene' }));
    expect(onInteraction).toHaveBeenCalledWith('one');
    expect(screen.queryByText('missing')).not.toBeInTheDocument();
    expect(within(parent).getAllByLabelText('Parent group')[0]).not.toHaveTextContent('Child');
  });

  it('renames, adds selected members, moves, removes members and deletes through existing mutations', async () => {
    const { user, onUpdate, onDelete } = setup();
    const parent = screen.getByText('Opening', { selector: 'strong' }).closest('li')!;
    await user.click(parent.querySelector('[aria-expanded]')!);
    const title = within(parent).getAllByLabelText('Group title')[0];
    await user.clear(title);
    await user.type(title, 'New name');
    await user.click(within(parent).getAllByRole('button', { name: 'Rename group' })[0]);
    expect(onUpdate).toHaveBeenLastCalledWith('parent', { title: 'New name' });
    await user.click(
      within(parent).getAllByRole('button', { name: 'Move selected interactions here' })[0],
    );
    expect(onUpdate).toHaveBeenLastCalledWith('parent', { interactionIds: ['one'] });
    const child = screen.getByText('Child').closest('li')!;
    await user.click(child.querySelector('[aria-expanded]')!);
    await user.selectOptions(within(child).getByLabelText('Parent group'), '');
    expect(onUpdate).toHaveBeenLastCalledWith('child', { parentGroupId: null });
    await user.click(
      within(child).getByRole('button', { name: 'Remove Opening scene from group' }),
    );
    expect(onUpdate).toHaveBeenLastCalledWith('child', { interactionIds: ['missing'] });
    await user.click(within(child).getByRole('button', { name: 'Delete group' }));
    expect(onDelete).toHaveBeenCalledWith('child');
  });

  it('shows an empty state for existing Stories without groups', () => {
    setup({ ...story, groups: undefined });
    expect(screen.getByText('Select interactions on the graph to create a group.')).toBeVisible();
  });

  it('shows failed saves and permits retry', async () => {
    const { user, onDelete } = setup();
    onDelete.mockResolvedValue(false);
    const parent = screen.getByText('Opening', { selector: 'strong' }).closest('li')!;
    await user.click(parent.querySelector('[aria-expanded]')!);
    await user.click(within(parent).getAllByRole('button', { name: 'Delete group' })[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Group could not be saved');
    expect(within(parent).getAllByRole('button', { name: 'Delete group' })[0]).toBeEnabled();
  });
});
