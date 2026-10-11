import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StoryGraphSelectionInspector } from './StoryGraphSelectionInspector';

describe('StoryGraphSelectionInspector', () => {
  it('creates a Group from selected Interactions and excludes selected Triggers', async () => {
    const onCreateGroup = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <StoryGraphSelectionInspector
        selection={{
          interactionIds: ['interaction-1', 'interaction-2'],
          triggers: [
            {
              nodeId: 'trigger-node',
              interactionId: 'interaction-2',
              triggerId: 'trigger-1',
              triggerIds: ['trigger-1'],
            },
          ],
        }}
        onCreateGroup={onCreateGroup}
      />,
    );

    const title = screen.getByLabelText('Group title');
    await user.clear(title);
    await user.type(title, 'Opening');
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    expect(onCreateGroup).toHaveBeenCalledWith('Opening', ['interaction-1', 'interaction-2']);
  });

  it('does not allow a Trigger-only selection to create a Group', () => {
    const { container } = render(
      <StoryGraphSelectionInspector
        selection={{
          interactionIds: [],
          triggers: [
            {
              nodeId: 'trigger-node',
              interactionId: 'interaction-2',
              triggerId: 'trigger-1',
              triggerIds: ['trigger-1'],
            },
          ],
        }}
        onCreateGroup={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(within(container).getByRole('button', { name: 'Create group' })).toBeDisabled();
    expect(
      within(container).getByText('Select at least one interaction to create a group.'),
    ).toBeVisible();
  });
});
