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
import { StoryGroupsPanel as StoryGroupsPanelWithoutTree } from './StoryGroupsPanel';
import { StoryGroupTreePanel } from './StoryGroupTreePanel';
import type { StoryGroupsPanelProps } from './storyGroupTypes';

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
function setup(
  input = story,
  readOnly = false,
  searchQuery = '',
  matchingInteractionIds: string[] = [],
) {
  const callbacks = {
    onToggle: vi.fn(),
    onAdd: vi.fn(),
    onSelect: vi.fn(),
    onSelectInteraction: vi.fn(),
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
      <StoryGroupTreePanel
        story={current}
        searchQuery={searchQuery}
        matchingInteractionIds={matchingInteractionIds}
        open
        selectedGroupId={selected}
        selectedInteractionId={undefined}
        editingGroupId={editing}
        onEditingChange={setEditing}
        selectionIds={['one']}
        readOnly={readOnly}
        {...callbacks}
        onSelect={(id) => {
          callbacks.onSelect(id);
          setSelected(id);
        }}
        onSelectInteraction={callbacks.onSelectInteraction}
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

function renderGroupsWithoutTree(searchQuery: string) {
  const props: StoryGroupsPanelProps = {
    story: { ...story, groups: undefined },
    searchQuery,
    matchingInteractionIds: [],
    open: true,
    onToggle: vi.fn(),
    onAdd: vi.fn(),
    selectionIds: [],
    readOnly: false,
    onSelect: vi.fn(),
    onSelectInteraction: vi.fn(),
    onFocus: vi.fn(),
    onSelectInteractions: vi.fn(),
    onEditingChange: vi.fn(),
    onCreate: async () => false,
    onUpdate: async () => true,
    onDelete: async () => true,
  };
  render(<StoryGroupsPanelWithoutTree {...props} />);
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
    await user.click(screen.getByRole('button', { name: 'Expand or collapse Child' }));
    const interaction = screen.getByRole('treeitem', { name: 'Opening scene' });
    expect(interaction).toBeVisible();
    await user.dblClick(screen.getByRole('button', { name: 'Opening 1 interaction' }));
    expect(onFocus).toHaveBeenCalledWith(['one']);
  });

  it('returns from an Interaction to its Group and opens the Group menu from the keyboard', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Expand or collapse Opening' }));
    await user.click(screen.getByRole('button', { name: 'Expand or collapse Child' }));

    const interaction = screen.getByRole('treeitem', { name: 'Opening scene' });
    interaction.focus();
    await user.keyboard('{ArrowLeft}');
    const child = screen.getByRole('treeitem', { name: /Child/ });
    expect(child).toHaveFocus();

    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menuitem', { name: 'Rename group' })).toBeVisible();
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
  it('finds groups under collapsed ancestors from the shared query', () => {
    setup(
      {
        ...story,
        groups: [
          ...story.groups!,
          ...Array.from({ length: 997 }, (_, index) => ({
            id: 'g' + index,
            title: 'Group ' + index,
            interactionIds: [],
          })),
        ],
      },
      false,
      'Child',
    );
    expect(screen.getAllByRole('treeitem')).toHaveLength(2);
    expect(screen.getByText('Child')).toBeVisible();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
  it('collapses search-forced groups and displays only the matching interactions', async () => {
    const input: Story = {
      ...story,
      interactions: [
        ...story.interactions,
        {
          id: 'other-scene',
          title: 'Another scene',
          body: '',
          triggers: [],
          position: { x: 0, y: 100 },
        },
      ],
      groups: [
        { id: 'parent', title: 'Opening', interactionIds: [] },
        {
          id: 'child',
          title: 'Child',
          interactionIds: ['one', 'other-scene'],
          parentGroupId: 'parent',
        },
      ],
    };
    const { user } = setup(input, false, 'Mira', ['one']);
    expect(screen.getByRole('button', { name: 'Expand or collapse Opening' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Expand or collapse Child' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('treeitem', { name: 'Opening scene' })).toBeVisible();
    expect(screen.queryByRole('treeitem', { name: 'Another scene' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand or collapse Child' }));
    expect(screen.queryByRole('treeitem', { name: 'Opening scene' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand or collapse Child' }));
    expect(screen.getByRole('treeitem', { name: 'Opening scene' })).toBeVisible();
  });
  it('shows searchable ungrouped interactions when a Story has no groups', async () => {
    const input: Story = { ...story, groups: undefined };
    const { onSelectInteraction, user } = setup(input, false, 'Mira', ['one']);
    expect(screen.getByRole('region', { name: 'Ungrouped interactions' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Opening scene' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Opening scene' }));
    expect(onSelectInteraction).toHaveBeenCalledWith('one');
  });
  it('hides mutations for readers and ignores the rename shortcut', async () => {
    const { user } = setup(story, true);
    await menu(user);
    expect(screen.queryByRole('menuitem', { name: 'Rename group' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Center on group' })).toBeVisible();
    await user.keyboard('{Escape}');
    screen.getByRole('treeitem', { name: /Opening/ }).focus();
    await user.keyboard('{F2}');
    expect(screen.queryByRole('textbox', { name: 'Group title' })).not.toBeInTheDocument();
  });
  it('shows the empty state when the group list has no entities', () => {
    renderGroupsWithoutTree('');
    expect(screen.getByText('No groups yet.')).toBeVisible();
  });
  it('shows distinct no-match wording when a search has no group results', () => {
    renderGroupsWithoutTree('missing');
    expect(screen.getByText('No matching groups or interactions.')).toBeVisible();
    expect(screen.queryByText('No groups yet.')).not.toBeInTheDocument();
  });
});
