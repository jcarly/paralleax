import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { TestDataRouter } from '../test/TestDataRouter';
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

  it('keeps the latest simulation slice when a realtime reload began before a choice', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=start');
    expect(await screen.findByDisplayValue('Start')).toBeInTheDocument();

    let source: FakeEventSource | undefined;
    await waitFor(() => {
      source = FakeEventSource.instances.find(({ url }) => url === '/api/stories/story-1/events');
      expect(source).toBeDefined();
    });

    const loadRuntimeSlice = vi.mocked(api.getStoryRuntimeSlice).getMockImplementation();
    if (!loadRuntimeSlice) throw new Error('Expected runtime slice loading to be mocked.');
    let staleSliceRequested = false;
    let releaseStaleSlice: (() => void) | undefined;
    vi.mocked(api.getStoryRuntimeSlice).mockImplementation((storyId, request = {}) => {
      if (!staleSliceRequested && request.currentInteractionId === 'start') {
        staleSliceRequested = true;
        return new Promise((resolve) => {
          releaseStaleSlice = () => {
            void Promise.resolve(loadRuntimeSlice(storyId, request)).then(resolve);
          };
        });
      }
      return loadRuntimeSlice(storyId, request);
    });

    source?.emit('story-changed');
    await waitFor(() => expect(staleSliceRequested).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByDisplayValue('Next')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Secret' })).toBeInTheDocument();
    const sliceCallsBeforeRelease = vi.mocked(api.getStoryRuntimeSlice).mock.calls.length;

    await act(async () => {
      releaseStaleSlice?.();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(vi.mocked(api.getStoryRuntimeSlice).mock.calls.length).toBeGreaterThan(
        sliceCallsBeforeRelease,
      ),
    );
    expect(screen.getByDisplayValue('Next')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secret' })).toBeInTheDocument();
  });

  it('shows a recoverable error when the story cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStory)
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce(structuredClone(story));
    vi.mocked(api.getReaderProgress).mockResolvedValue(null);

    render(
      <TestDataRouter initialEntry="/stories/story-1/play">
        <Routes>
          <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
        </Routes>
      </TestDataRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Paralleax Reader')).toBeInTheDocument();
    expect(api.getStory).toHaveBeenCalledTimes(2);
  });

  it('returns to the Story library when the Story cannot be read', async () => {
    vi.mocked(api.getStory).mockRejectedValue(
      Object.assign(new Error('Story not found'), { status: 404 }),
    );

    render(
      <TestDataRouter initialEntry="/stories/private-story/play">
        <Routes>
          <Route path="/" element={<div>Story library route</div>} />
          <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
        </Routes>
      </TestDataRouter>,
    );

    expect(await screen.findByText('Story library route')).toBeInTheDocument();
    expect(screen.queryByText('Story not found')).not.toBeInTheDocument();
  });

  it('does not let a late response from the previous Story replace the active route', async () => {
    const user = userEvent.setup();
    const firstStory = { ...structuredClone(story), title: 'First delayed Story' };
    const secondStory = {
      ...structuredClone(story),
      id: 'story-2',
      title: 'Second active Story',
    };
    let releaseFirst = () => {};
    const firstRequest = new Promise<typeof story>((resolve) => {
      releaseFirst = () => resolve(firstStory);
    });
    vi.mocked(api.getStory).mockImplementation((storyId) =>
      storyId === 'story-1' ? firstRequest : Promise.resolve(secondStory),
    );
    vi.mocked(api.getReaderProgress).mockResolvedValue(null);

    render(
      <TestDataRouter initialEntry="/stories/story-1/play">
        <Link to="/stories/story-2/play">Open second Story</Link>
        <Routes>
          <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
        </Routes>
      </TestDataRouter>,
    );

    await user.click(screen.getByRole('link', { name: 'Open second Story' }));
    expect(await screen.findAllByText('Second active Story')).not.toHaveLength(0);

    act(() => releaseFirst());
    await act(async () => Promise.resolve());

    expect(screen.queryByText('First delayed Story')).not.toBeInTheDocument();
    expect(screen.getAllByText('Second active Story')).not.toHaveLength(0);
  });

  it('reads publicly without loading or saving authenticated progress', async () => {
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
      <TestDataRouter initialEntry="/stories/story-1/play">
        <Routes>
          <Route path="/stories/:storyId/play" element={<StoryPlayer authenticated={false} />} />
        </Routes>
      </TestDataRouter>,
    );

    expect(await screen.findByText('Sign in to save progress')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(api.getReaderProgress).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Back to editor' })).not.toBeInTheDocument();
    expect(api.saveReaderProgress).not.toHaveBeenCalled();
  });

  it('starts its only available opening interaction and follows later choices', async () => {
    const user = userEvent.setup();
    await renderPlayer();

    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Start the story/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /Force unavailable options/ }),
    ).not.toBeInTheDocument();

    expect(screen.getByText('You arrive.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Next' })).toBeInTheDocument();
    await waitFor(() =>
      expect(api.saveReaderProgress).toHaveBeenCalledWith(
        'story-1',
        {
          journeyInteractionIds: ['start'],
          ownedItemIds: [],
          randomSeed: expect.any(String),
          stepStartedAt: [expect.any(String), expect.any(String)],
        },
        'reader',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('keeps the opening choices when more than one interaction is available', async () => {
    const multipleOpenings = structuredClone(story);
    multipleOpenings.interactions.push({
      id: 'alternative-start',
      title: 'Alternative start',
      body: 'Another opening.',
      position: { x: 300, y: 0 },
      triggers: [{ id: 'trigger-alternative-start', inputInteractionIds: [], conditions: [] }],
    });

    await renderPlayer('/stories/story-1/play', multipleOpenings);

    expect(await screen.findByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alternative start' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('stays at the opening screen when no interaction is available', async () => {
    const noAvailableOpening = structuredClone(story);
    noAvailableOpening.interactions[0].triggers[0].conditions = [
      { interactionId: 'hidden', hasBeenVisited: true },
    ];

    await renderPlayer('/stories/story-1/play', noAvailableOpening);

    expect(await screen.findByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('commits only one transition when an option is activated twice before rerender', async () => {
    const ambiguousStory = structuredClone(story);
    ambiguousStory.interactions.push({
      id: 'alternative-start',
      title: 'Alternative start',
      body: 'Another opening.',
      position: { x: 300, y: 0 },
      triggers: [{ id: 'trigger-alternative-start', inputInteractionIds: [], conditions: [] }],
    });
    await renderPlayer('/stories/story-1/play', ambiguousStory);
    const start = await screen.findByRole('button', { name: 'Start' });

    act(() => {
      start.click();
      start.click();
    });

    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument();
    await waitFor(() => expect(api.saveReaderProgress).toHaveBeenCalledTimes(1));
    expect(api.saveReaderProgress).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ journeyInteractionIds: ['start'] }),
      'reader',
    );
  });

  it('follows an available inline interaction link without bypassing trigger availability', async () => {
    const user = userEvent.setup();
    const linkedStory = structuredClone(story);
    linkedStory.interactions[0].body =
      '<p><span data-interaction-link-target="next">Continue in the text</span></p>';

    await renderPlayer('/stories/story-1/play', linkedStory);
    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Next' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Continue in the text' }));

    expect(await screen.findByRole('heading', { name: 'Next' })).toBeInTheDocument();
  });

  it('projects conditional body text from outgoing trigger availability', async () => {
    const conditionalStory = structuredClone(story);
    conditionalStory.interactions[0].body =
      '<p>Always shown</p>' +
      '<div data-conditional-text-target="next"><button data-conditional-text-link="next">Next</button><p>Available clue</p></div>' +
      '<div data-conditional-text-target="hidden"><button data-conditional-text-link="hidden">Secret</button><p>Disconnected clue</p></div>';

    await renderPlayer('/stories/story-1/play', conditionalStory);
    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument();

    expect(await screen.findByText('Available clue')).toBeInTheDocument();
    expect(screen.queryByText('Disconnected clue')).not.toBeInTheDocument();
  });

  it('evaluates structured conditional text with Trigger condition semantics', async () => {
    const conditionalStory = structuredClone(story);
    conditionalStory.interactions[0].body =
      '<div data-conditional-text-block="visited-start"><p>Visited clue</p></div>' +
      '<div data-conditional-text-block="visited-secret"><p>Hidden clue</p></div>';
    conditionalStory.interactions[0].conditionalTextBlocks = [
      {
        id: 'visited-start',
        conditions: [{ interactionId: 'start', hasBeenVisited: true }],
      },
      {
        id: 'visited-secret',
        conditions: [{ interactionId: 'hidden', hasBeenVisited: true }],
      },
    ];

    await renderPlayer('/stories/story-1/play', conditionalStory);
    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument();

    expect(screen.getByText('Visited clue')).toBeInTheDocument();
    expect(screen.queryByText('Hidden clue')).not.toBeInTheDocument();
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
    const richStory = structuredClone(story);
    richStory.interactions[0].body =
      '<p>A <strong>rich</strong> opening.</p><img src="https://media.example/opening.gif"><script>alert(1)</script>';
    await renderPlayer('/stories/story-1/play', richStory);

    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByText('rich').tagName).toBe('STRONG');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.example/opening.gif');
    expect(document.querySelector('script')).toBeNull();
  });
});
