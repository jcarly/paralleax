import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  moveStoryGroup,
  removeStoryGroup,
  setStoryGroupInteractions,
  type Story,
  type UpdateGroupInput,
} from '@paralleax/shared';
import { StoryGroupTreePanel as StoryGroupsPanel } from './StoryGroupTreePanel';

const story: Story = {
  createdAt: '2026-10-21T08:00:00.000Z',
  updatedAt: '2026-10-21T08:00:00.000Z',
  id: 'story',
  title: 'Story',
  interactions: [
    { id: 'one', title: 'Opening scene', body: '', triggers: [], position: { x: 0, y: 0 } },
  ],
  groups: [
    { id: 'parent', title: 'Opening', interactionIds: [] },
    { id: 'child', title: 'Child', interactionIds: ['one'], parentGroupId: 'parent' },
    { id: 'other', title: 'Other', interactionIds: [] },
  ],
};
function setup(input = story, readOnly = false) {
  const callbacks = {
    onSelect: vi.fn(),
    onFocus: vi.fn(),
    onSelectInteractions: vi.fn(),
    onUpdate: vi
      .fn<(id: string, input: UpdateGroupInput) => Promise<boolean>>()
      .mockResolvedValue(true),
    onDelete: vi.fn().mockResolvedValue(true),
    onCreate: vi.fn().mockResolvedValue('new'),
  };
  function Harness() {
    const [current, setStory] = useState(input);
    const [selected, setSelected] = useState<string>();
    const [editing, setEditing] = useState<string>();
    return (
      <StoryGroupsPanel
        story={current}
        selectedGroupId={selected}
        editingGroupId={editing}
        onEditingChange={setEditing}
        selectionIds={['one']}
        readOnly={readOnly}
        {...callbacks}
        onSelect={(id) => {
          callbacks.onSelect(id);
          setSelected(id);
        }}
        onUpdate={async (id, patch) => {
          if (!(await callbacks.onUpdate(id, patch))) return false;
          setStory((old) => {
            let next: Story = {
              ...old,
              groups: old.groups!.map((group) =>
                group.id === id
                  ? { ...group, ...(patch.title ? { title: patch.title } : {}) }
                  : group,
              ),
            };
            if (patch.interactionIds)
              next = setStoryGroupInteractions(next, id, patch.interactionIds);
            if (patch.beforeGroupId !== undefined)
              next = moveStoryGroup(next, id, patch.parentGroupId ?? null, patch.beforeGroupId);
            return next;
          });
          return true;
        }}
        onDelete={async (id) => {
          if (!(await callbacks.onDelete(id))) return false;
          setStory((old) => removeStoryGroup(old, id));
          return true;
        }}
        onCreate={async (title, ids, parentGroupId) => {
          const id = await callbacks.onCreate(title, ids, parentGroupId);
          setStory((old) => ({
            ...old,
            groups: [...old.groups!, { id, title, interactionIds: ids, parentGroupId }],
          }));
          setSelected(id);
          setEditing(id);
          return id;
        }}
      />
    );
  }
  render(<Harness />);
  return { ...callbacks, user: userEvent.setup() };
}
async function menu(user: ReturnType<typeof userEvent.setup>, title = 'Opening') {
  await user.click(screen.getByRole('button', { name: 'Actions for ' + title }));
  return screen.getByRole('menu');
}
describe('Groups navigation', () => {
  afterEach(cleanup);
  it('keeps rows compact, selects without centering, and expands without changing selection', async () => {
    const { user, onSelect, onFocus } = setup();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Opening 1 interaction' }));
    expect(onSelect).toHaveBeenCalledWith('parent');
    expect(onFocus).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Expand or collapse Opening' }));
    expect(screen.getByRole('button', { name: 'Child 1 interaction' })).toBeVisible();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Opening scene' })).not.toBeInTheDocument();
    await user.dblClick(screen.getByRole('button', { name: 'Opening 1 interaction' }));
    expect(onFocus).toHaveBeenCalledWith(['one']);
  });
  it('uses action menus to add members, select recursive members, create children and delete without losing interactions', async () => {
    const { user, onUpdate, onSelectInteractions, onCreate, onDelete } = setup();
    await menu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move selected interactions here' }));
    expect(onUpdate).toHaveBeenLastCalledWith('parent', { interactionIds: ['one'] });
    await menu(user);
    expect(
      screen.queryByRole('menuitem', { name: 'Move selected interactions here' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Select group interactions' }));
    expect(onSelectInteractions).toHaveBeenCalledWith(['one']);
    await menu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'Remove selected interactions from group' }),
    );
    expect(onUpdate).toHaveBeenLastCalledWith('parent', { interactionIds: [] });
    await menu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Create subgroup' }));
    expect(onCreate).toHaveBeenCalledWith('New group', [], 'parent');
    await user.keyboard('{Escape}');
    await menu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete group' }));
    expect(onDelete).toHaveBeenCalledWith('parent');
    expect(screen.getByRole('button', { name: 'Child 0 interactions' })).toBeVisible();
  });
  it('renames inline with F2, rejects blanks, cancels with Escape, and retries failed saves', async () => {
    const { user, onUpdate } = setup();
    await user.click(screen.getByRole('button', { name: 'Opening 1 interaction' }));
    await user.keyboard('{F2}');
    let input = screen.getByRole('textbox', { name: 'Group title' });
    await user.clear(input);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
    expect(onUpdate).not.toHaveBeenCalled();
    await user.type(input, 'Cancelled');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /Opening/ })).toHaveFocus();
    expect(onUpdate).not.toHaveBeenCalled();
    await user.keyboard('{F2}');
    input = screen.getByRole('textbox', { name: 'Group title' });
    await user.clear(input);
    await user.type(input, 'Renamed');
    onUpdate.mockResolvedValueOnce(false);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
    expect(input).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onUpdate).toHaveBeenLastCalledWith('parent', { title: 'Renamed' });
    expect(screen.getByRole('button', { name: 'Renamed 1 interaction' })).toBeVisible();
  });
  it('opens by right click and supports menu keyboard navigation and dismissal', async () => {
    const { user } = setup();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Opening 1 interaction' }));
    expect(screen.getByRole('menuitem', { name: 'Rename group' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete group' })).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(screen.getByRole('textbox', { name: 'Group title' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
  it('navigates and moves siblings, nests and returns to the root with the keyboard', async () => {
    const { user, onUpdate, onSelect } = setup();
    await user.click(screen.getByRole('button', { name: 'Other 0 interactions' }));
    await user.keyboard('{Control>}{ArrowUp}{/Control}');
    expect(onUpdate).toHaveBeenLastCalledWith('other', {
      parentGroupId: null,
      beforeGroupId: 'parent',
    });
    await user.keyboard('{Control>}{ArrowDown}{/Control}');
    expect(onUpdate).toHaveBeenLastCalledWith('other', {
      parentGroupId: null,
      beforeGroupId: null,
    });
    await user.keyboard('{Control>}{ArrowRight}{/Control}');
    expect(onUpdate).toHaveBeenLastCalledWith('other', {
      parentGroupId: 'parent',
      beforeGroupId: null,
    });
    await user.keyboard('{Control>}{ArrowLeft}{/Control}');
    expect(onUpdate).toHaveBeenLastCalledWith('other', {
      parentGroupId: null,
      beforeGroupId: null,
    });
    await user.keyboard('{Home}{Enter}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('child');
  });
  it('finds groups under collapsed ancestors and handles a large tree compactly', async () => {
    const { user } = setup({
      ...story,
      groups: [
        ...story.groups!,
        ...Array.from({ length: 997 }, (_, index) => ({
          id: 'g' + index,
          title: 'Group ' + index,
          interactionIds: [],
        })),
      ],
    });
    expect(screen.getAllByRole('treeitem')).toHaveLength(999);
    await user.type(screen.getByRole('searchbox'), 'Child');
    expect(screen.getAllByRole('treeitem')).toHaveLength(2);
    expect(screen.getByText('Child')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('hides mutations for readers and displays save failures without discarding the tree', async () => {
    const { user } = setup(story, true);
    await menu(user);
    expect(screen.queryByRole('menuitem', { name: 'Rename group' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Center on group' })).toBeVisible();
  });
  it('shows the legacy empty state', () => {
    setup({ ...story, groups: undefined });
    expect(screen.getByText('Select interactions on the graph to create a group.')).toBeVisible();
  });
});
