import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getStoryGraphClickCreationPosition } from '../storyGraphCreationLayout';
import {
  api,
  renderPlayer,
  setupStoryPlayerTestSuite,
  story,
} from '../test/storyPlayerTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

describe('StoryPlayer simulation authoring', () => {
  setupStoryPlayerTestSuite();

  it('shows unavailable interactions in simulation mode and lets authors force them', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');

    expect(screen.getByText('Simulation')).toBeInTheDocument();
    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Next');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    const unavailableOption = screen.getByRole('button', { name: /Secret/ });
    expect(unavailableOption).toHaveClass('unavailable');
    expect(unavailableOption).toBeDisabled();
    expect(screen.getByText(/Requires "Start" to be visited/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Force unavailable options/ }));
    expect(unavailableOption).toBeEnabled();
    expect(unavailableOption).toHaveClass('forced');
    await user.click(unavailableOption);

    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Secret');
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByText('End of this branch.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Next');
    expect(screen.getByRole('button', { name: /Secret/ })).toHaveClass('unavailable');
    expect(screen.getByText(/Requires "Start" to be visited/)).toBeInTheDocument();
  });

  it('edits the current title and content inline in simulation mode', async () => {
    const user = userEvent.setup();
    const renamed = structuredClone(story);
    renamed.interactions[1].title = 'Renamed step';
    const rewritten = structuredClone(renamed);
    rewritten.interactions[1].body = 'Rewritten content.';
    vi.mocked(api.updateInteraction)
      .mockResolvedValueOnce(renamed)
      .mockResolvedValueOnce(rewritten);

    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');

    const titleInput = screen.getByLabelText('Current interaction title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed step');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'next', {
      title: 'Renamed step',
    });
    expect(await screen.findByDisplayValue('Renamed step')).toBeInTheDocument();

    const bodyInput = screen.getByLabelText('Current interaction content');
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Rewritten content.');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'next', {
      body: 'Rewritten content.',
    });
    expect(screen.getByLabelText('Current interaction content')).toHaveTextContent(
      'Rewritten content.',
    );
  });

  it('keeps conditional text on its source interaction when its link is followed', async () => {
    const conditionalStory = structuredClone(story);
    conditionalStory.interactions[0].body =
      '<div data-conditional-text-target="next"><button type="button" contenteditable="false" aria-label="Open target interaction: Next" data-conditional-text-link="next">Next</button><p>Source-only clue</p></div>';
    vi.mocked(api.updateInteraction).mockResolvedValue(conditionalStory);

    await renderPlayer(
      '/stories/story-1/play?mode=simulation&startInteractionId=start',
      conditionalStory,
    );

    const sourceEditor = screen.getByLabelText('Current interaction content');
    sourceEditor.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Open target interaction: Next' }));

    expect(await screen.findByDisplayValue('Next')).toBeInTheDocument();
    const targetEditor = screen.getByLabelText('Current interaction content');
    expect(targetEditor).toHaveTextContent('You continue.');
    expect(targetEditor).not.toHaveTextContent('Source-only clue');
    await waitFor(() =>
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'start', {
        body: expect.stringContaining('Source-only clue'),
      }),
    );
    expect(api.updateInteraction).not.toHaveBeenCalledWith('story-1', 'next', {
      body: expect.stringContaining('Source-only clue'),
    });
  });

  it('adds an option in simulation mode and focuses its title', async () => {
    const user = userEvent.setup();
    const position = getStoryGraphClickCreationPosition(story, {
      kind: 'child',
      sourceId: 'next',
    })!;
    const withOption = structuredClone(story);
    withOption.interactions.push({
      id: 'option-1',
      title: 'New option',
      body: '',
      position,
      triggers: [{ id: 'trigger-option-1', inputInteractionIds: ['next'], conditions: [] }],
    });
    const renamedOption = structuredClone(withOption);
    renamedOption.interactions[3].title = 'Ask the guard';
    vi.mocked(api.createInteraction).mockResolvedValue(withOption);
    vi.mocked(api.updateInteraction).mockResolvedValue(renamedOption);

    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');
    await user.click(screen.getByRole('button', { name: 'Add option' }));

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'next',
      position,
    });
    const optionTitleInput = await screen.findByLabelText('New option title');
    expect(optionTitleInput).toHaveFocus();
    expect(optionTitleInput).toHaveValue('New option');

    await user.clear(optionTitleInput);
    await user.type(optionTitleInput, 'Ask the guard{Enter}');

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'option-1', {
      title: 'Ask the guard',
    });
    expect(await screen.findByRole('button', { name: 'Ask the guard' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ask the guard' }));

    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Ask the guard');
    expect(screen.getByLabelText('Current interaction content')).toBeEmptyDOMElement();
  });

  it('adds an option from a newly created option without a stored position', async () => {
    const user = userEvent.setup();
    const withOption = structuredClone(story);
    withOption.interactions.push({
      id: 'option-1',
      title: 'New option',
      body: '',
      position: { x: 300, y: 0 },
      triggers: [{ id: 'trigger-option-1', inputInteractionIds: ['next'], conditions: [] }],
    });
    delete (withOption.interactions[3] as Partial<(typeof withOption.interactions)[number]>)
      .position;
    const withNestedOption = structuredClone(withOption);
    withNestedOption.interactions.push({
      id: 'option-2',
      title: 'Nested option',
      body: '',
      position: { x: 80, y: 648 },
      triggers: [{ id: 'trigger-option-2', inputInteractionIds: ['option-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction)
      .mockResolvedValueOnce(withOption)
      .mockResolvedValueOnce(withNestedOption);
    vi.mocked(api.updateInteraction).mockResolvedValue(withOption);

    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.keyboard('{Enter}');

    await user.click(await screen.findByRole('button', { name: 'New option' }));
    const nestedPosition = getStoryGraphClickCreationPosition(withOption, {
      kind: 'child',
      sourceId: 'option-1',
    })!;
    await user.click(screen.getByRole('button', { name: 'Add option' }));

    expect(api.createInteraction).toHaveBeenLastCalledWith('story-1', {
      parentId: 'option-1',
      position: nestedPosition,
    });
    expect(await screen.findByLabelText('New option title')).toHaveValue('Nested option');
  });

  it('adds a root option at the beginning of simulation mode', async () => {
    const user = userEvent.setup();
    const position = getStoryGraphClickCreationPosition(story, { kind: 'root' })!;
    const withRoot = structuredClone(story);
    withRoot.interactions.push({
      id: 'root-2',
      title: 'New option',
      body: '',
      position,
      triggers: [{ id: 'trigger-root-2', inputInteractionIds: [], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(withRoot);

    await renderPlayer('/stories/story-1/play?mode=simulation');

    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add option' })).toBeInTheDocument();
    expect(
      screen
        .getByRole('button', { name: 'Start' })
        .compareDocumentPosition(screen.getByRole('button', { name: 'Add option' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Add option' }));

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      position,
    });
    const optionTitleInput = await screen.findByLabelText('New option title');
    expect(optionTitleInput).toHaveFocus();
    expect(optionTitleInput).toHaveValue('New option');
  });
});
