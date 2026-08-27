import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  api,
  FakeEventSource,
  renderPlayer,
  setupStoryPlayerTestSuite,
  story,
  StoryPlayer,
} from '../test/storyPlayerTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

describe('StoryPlayer loading and presentation', () => {
  setupStoryPlayerTestSuite();

  it('replays the open simulation when remote story content and triggers change', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');
    expect(screen.getByRole('button', { name: /Secret/ })).toBeDisabled();

    const remote = structuredClone(story);
    remote.revision = 2;
    remote.interactions[1].title = 'Remote next';
    remote.interactions[2].triggers[0].conditions = [];
    vi.mocked(api.getStory).mockResolvedValue(remote);

    let source: FakeEventSource | undefined;
    await waitFor(() => {
      source = FakeEventSource.instances.find(({ url }) => url === '/api/stories/story-1/events');
      expect(source).toBeDefined();
    });
    source?.emit('story-changed');

    expect(await screen.findByDisplayValue('Remote next')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Secret/ })).toBeEnabled();
  });

  it('shows a recoverable error when the story cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStory)
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce(structuredClone(story));
    vi.mocked(api.getReaderProgress).mockResolvedValue(null);

    render(
      <MemoryRouter initialEntries={['/stories/story-1/play']}>
        <Routes>
          <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Paralleax Reader')).toBeInTheDocument();
    expect(api.getStory).toHaveBeenCalledTimes(2);
  });

  it('reads publicly without loading or saving authenticated progress', async () => {
    const user = userEvent.setup();
    const publicStory = structuredClone(story);
    publicStory.access = { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' };
    publicStory.capabilities = {
      canRead: true,
      canEdit: false,
      canManage: false,
      canComment: false,
    };
    vi.mocked(api.getStory).mockResolvedValue(publicStory);
    render(
      <MemoryRouter initialEntries={['/stories/story-1/play']}>
        <Routes>
          <Route path="/stories/:storyId/play" element={<StoryPlayer authenticated={false} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Sign in to save progress')).toBeInTheDocument();
    expect(api.getReaderProgress).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Back to editor' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(api.saveReaderProgress).not.toHaveBeenCalled();
  });

  it('loads a story and follows available choices', async () => {
    const user = userEvent.setup();
    await renderPlayer();

    expect(screen.getByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /Force unavailable options/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByText('You arrive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(api.saveReaderProgress).toHaveBeenCalledWith('story-1', {
      journeyInteractionIds: ['start'],
      ownedItemIds: [],
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('projects conditional body text from outgoing trigger availability', async () => {
    const user = userEvent.setup();
    const conditionalStory = structuredClone(story);
    conditionalStory.interactions[0].body =
      '<p>Always shown</p>' +
      '<div data-conditional-text-target="next"><button data-conditional-text-link="next">Next</button><p>Available clue</p></div>' +
      '<div data-conditional-text-target="hidden"><button data-conditional-text-link="hidden">Secret</button><p>Disconnected clue</p></div>';

    await renderPlayer('/stories/story-1/play', conditionalStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByText('Available clue')).toBeInTheDocument();
    expect(screen.queryByText('Disconnected clue')).not.toBeInTheDocument();
  });

  it('keeps unavailable conditional text visible with an explanation in simulation', async () => {
    const user = userEvent.setup();
    const conditionalStory = structuredClone(story);
    conditionalStory.interactions[1].triggers[0].conditions = [
      { interactionId: 'hidden', hasBeenVisited: true },
    ];
    conditionalStory.interactions[0].body =
      '<div data-conditional-text-target="next"><button aria-label="Open target interaction: Next" data-conditional-text-link="next">Next</button><p>Unavailable clue</p></div>';

    await renderPlayer('/stories/story-1/play?mode=simulation', conditionalStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByText('Unavailable clue').closest('.conditional-text')).toHaveClass(
      'conditional-text-unavailable',
    );
    expect(screen.getByText(/Requires "Secret" to be visited/)).toBeInTheDocument();
    const unavailableOption = screen.getByRole('button', {
      name: /^NextRequires "Secret" to be visited\./,
    });
    expect(unavailableOption).toHaveClass('choice', 'unavailable');
    expect(unavailableOption).toHaveAttribute('title', 'Requires "Secret" to be visited.');
  });

  it('shows conditions on hover for available simulation options', async () => {
    const user = userEvent.setup();
    const conditionedStory = structuredClone(story);
    conditionedStory.interactions[1].triggers[0].conditions = [
      { interactionId: 'start', hasBeenVisited: true },
    ];

    await renderPlayer('/stories/story-1/play?mode=simulation', conditionedStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute(
      'title',
      '"Start" has been visited',
    );
  });

  it('renders sanitized rich text and media in the reader', async () => {
    const user = userEvent.setup();
    const richStory = structuredClone(story);
    richStory.interactions[0].body =
      '<p>A <strong>rich</strong> opening.</p><img src="https://media.example/opening.gif"><script>alert(1)</script>';
    await renderPlayer('/stories/story-1/play', richStory);

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('rich').tagName).toBe('STRONG');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.example/opening.gif');
    expect(document.querySelector('script')).toBeNull();
  });
});
